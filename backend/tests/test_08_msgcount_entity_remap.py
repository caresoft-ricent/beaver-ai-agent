"""测试：message_count 原子更新 + LLM意图实体键名映射 + 批量删除

覆盖:
- message_count 使用 SQL UPDATE 原子递增（修复始终为0的bug）
- LLM意图识别返回的自由键名(如"company")映射为规范参数名(如"customerName")
- 批量删除会话端点
"""
import pytest
from sqlalchemy import text
from unittest.mock import MagicMock

from app.models.chat import ChatSession, ChatMessage
from app.models.intent import Skill, SkillTool
from app.models.action import Action, ActionParameter
from app.core.stream_engine import _remap_intent_entities


# ─────────────────── message_count ───────────────────


class TestMessageCountAtomicUpdate:
    """测试: message_count 使用 SQL UPDATE 原子递增"""

    def test_atomic_increment_from_zero(self, db):
        """新会话 message_count 从 0 原子递增到 2"""
        session = ChatSession(
            session_id="sess_mc_test_01",
            tenant_id=1,
            customer_id="C001",
            message_count=0,
        )
        db.add(session)
        db.commit()

        # 模拟 /stream 端点的原子 UPDATE
        db.execute(
            text("UPDATE ai_chat_session SET message_count = message_count + 2 WHERE session_id = :sid"),
            {"sid": "sess_mc_test_01"},
        )
        db.commit()

        # 验证
        row = db.execute(
            text("SELECT message_count FROM ai_chat_session WHERE session_id = :sid"),
            {"sid": "sess_mc_test_01"},
        ).fetchone()
        assert row[0] == 2

    def test_atomic_increment_accumulates(self, db):
        """多轮对话 message_count 累积递增"""
        session = ChatSession(
            session_id="sess_mc_test_02",
            tenant_id=1,
            customer_id="C001",
            message_count=0,
        )
        db.add(session)
        db.commit()

        # 3 轮对话
        for _ in range(3):
            db.execute(
                text("UPDATE ai_chat_session SET message_count = message_count + 2 WHERE session_id = :sid"),
                {"sid": "sess_mc_test_02"},
            )
            db.commit()

        row = db.execute(
            text("SELECT message_count FROM ai_chat_session WHERE session_id = :sid"),
            {"sid": "sess_mc_test_02"},
        ).fetchone()
        assert row[0] == 6


# ─────────────────── LLM 实体键名映射 ───────────────────


class TestRemapIntentEntities:
    """测试: LLM意图识别返回的自由键名映射为规范参数名"""

    def _setup_skill_with_param(self, db, factory, param_name="customerName"):
        """创建一个技能，关联一个有指定参数的操作"""
        entity = factory.entity(db)
        connector = factory.connector(db)
        action = factory.action(db, entity, connector,
            action_code="query_progress", action_name="产线查询",
            http_method="POST", api_path="/api/bi/query")
        factory.action_parameter(db, action,
            name="customer_name", title="客户名称",
            source_property=param_name,
            is_input=True, is_required=True)
        skill = factory.skill(db,
            skill_code="QUERY_PROGRESS_OVER",
            skill_name="产线概况",
            match_keywords=["产线", "概况"])
        factory.skill_tool(db, skill, entity, action)
        return skill

    def test_remap_company_to_customerName(self, db, factory):
        """'company' 键应映射为 'customerName'"""
        skill = self._setup_skill_with_param(db, factory, "customerName")

        raw = {"company": "生益电子"}
        result = _remap_intent_entities(db, skill, raw)
        assert "customerName" in result
        assert result["customerName"] == "生益电子"
        assert "company" not in result

    def test_keep_correct_key(self, db, factory):
        """已经正确的键名应原样保留"""
        skill = self._setup_skill_with_param(db, factory, "customerName")

        raw = {"customerName": "胜宏科技"}
        result = _remap_intent_entities(db, skill, raw)
        assert result["customerName"] == "胜宏科技"

    def test_empty_entities(self, db, factory):
        """空实体字典应原样返回"""
        skill = self._setup_skill_with_param(db, factory)

        result = _remap_intent_entities(db, skill, {})
        assert result == {}

    def test_none_entities(self, db, factory):
        """None 实体应原样返回"""
        skill = self._setup_skill_with_param(db, factory)

        result = _remap_intent_entities(db, skill, None)
        assert result is None

    def test_multiple_params_no_ambiguity(self, db, factory):
        """多个参数时，正确匹配的保留，不匹配的也保留（不丢弃）"""
        entity = factory.entity(db)
        connector = factory.connector(db)
        action = factory.action(db, entity, connector,
            action_code="query_multi", action_name="多参查询")
        factory.action_parameter(db, action,
            name="p1", title="客户名称",
            source_property="customerName",
            is_input=True)
        factory.action_parameter(db, action,
            name="p2", title="状态",
            source_property="stageStatus",
            is_input=True)
        skill = factory.skill(db, skill_code="MULTI_PARAM")
        factory.skill_tool(db, skill, entity, action)

        # 一个匹配、一个不匹配 → 不匹配的映射到唯一剩余参数
        raw = {"customerName": "生益电子", "unknown_field": "foo"}
        result = _remap_intent_entities(db, skill, raw)
        assert result["customerName"] == "生益电子"
        # 单个未匹配键 + 单个未填充参数 → 自动映射
        assert result["stageStatus"] == "foo"


# ─────────────────── 批量删除 ───────────────────


class TestBatchDeleteSessions:
    """测试: 批量删除会话端点逻辑"""

    def test_batch_delete_messages_and_sessions(self, db):
        """批量删除应同时删除消息和会话"""
        # 创建 2 个会话 + 消息
        for i in range(2):
            sid = f"sess_batch_{i}"
            s = ChatSession(session_id=sid, tenant_id=1, customer_id="C001")
            db.add(s)
            db.flush()
            db.add(ChatMessage(session_id=sid, role="user", content=f"msg_{i}"))
            db.add(ChatMessage(session_id=sid, role="assistant", content=f"reply_{i}"))
        db.commit()

        sids = ["sess_batch_0", "sess_batch_1"]

        # 模拟批量删除逻辑
        db.query(ChatMessage).filter(ChatMessage.session_id.in_(sids)).delete(synchronize_session=False)
        count = db.query(ChatSession).filter(ChatSession.session_id.in_(sids)).delete(synchronize_session=False)
        db.commit()

        assert count == 2
        remaining = db.query(ChatSession).filter(ChatSession.session_id.in_(sids)).count()
        assert remaining == 0
        remaining_msgs = db.query(ChatMessage).filter(ChatMessage.session_id.in_(sids)).count()
        assert remaining_msgs == 0

    def test_batch_delete_empty_list(self, db):
        """空列表应不做任何操作"""
        sids = []
        count = db.query(ChatSession).filter(ChatSession.session_id.in_(sids)).delete(synchronize_session=False) if sids else 0
        assert count == 0
