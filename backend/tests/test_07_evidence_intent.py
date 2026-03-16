"""测试：证据链完整参数记录 + 意图延续（continuation）逻辑

覆盖:
- 证据链记录完整请求参数（非仅键名）
- 证据链记录 POST/PUT 请求体
- 证据链记录完整 URL
- 同步引擎 (DialogEngine) 工具执行也写入证据链
- 意图延续：规则未匹配时沿用上下文中的前一意图
"""
import json
import pytest
from unittest.mock import MagicMock, patch

from app.core.pipeline import recognize_intent
from app.core.evidence import EvidenceCollector
from app.core.engine import DialogEngine
from app.models.intent import Skill


# ─────────────────── 意图延续 (continuation) ───────────────────


class TestIntentContinuation:
    """测试：规则+LLM均未匹配时, 沿用上一轮意图"""

    def test_continuation_with_last_intent(self, db):
        """上下文有last_intent时，无关键词也能沿用"""
        skill_a = Skill(
            tenant_id=1, skill_code="QUERY_SERVICE", skill_name="查询服务",
            match_keywords=["服务", "服务报告"], status="published", sort_order=1,
        )
        skill_b = Skill(
            tenant_id=1, skill_code="QUERY_PROGRESS", skill_name="产线概况",
            match_keywords=["产线", "概况"], status="published", sort_order=2,
        )
        db.add_all([skill_a, skill_b])
        db.flush()

        ctx = {"last_intent": "QUERY_SERVICE", "entities": {}, "turn_count": 2}
        skill, conf, entities, detail = recognize_intent(
            db, 1, "胜宏科技呢", [skill_a, skill_b], ctx
        )
        assert skill is not None
        assert skill.skill_code == "QUERY_SERVICE"
        assert detail["match_method"] == "continuation"
        assert conf == 0.5

    def test_continuation_without_last_intent(self, db):
        """无上下文last_intent时，返回None"""
        skill_a = Skill(
            tenant_id=1, skill_code="QUERY_SERVICE", skill_name="查询服务",
            match_keywords=["服务", "服务报告"], status="published", sort_order=1,
        )
        db.add(skill_a)
        db.flush()

        ctx = {"last_intent": None, "entities": {}, "turn_count": 1}
        skill, conf, entities, detail = recognize_intent(
            db, 1, "胜宏科技呢", [skill_a], ctx
        )
        assert skill is None
        assert detail["match_method"] == "none"

    def test_keyword_match_wins_over_continuation(self, db):
        """有关键词命中时不走continuation"""
        skill_a = Skill(
            tenant_id=1, skill_code="QUERY_SERVICE", skill_name="查询服务",
            match_keywords=["服务", "服务报告"], status="published", sort_order=1,
        )
        skill_b = Skill(
            tenant_id=1, skill_code="QUERY_PROGRESS", skill_name="产线概况",
            match_keywords=["产线", "概况"], status="published", sort_order=2,
        )
        db.add_all([skill_a, skill_b])
        db.flush()

        ctx = {"last_intent": "QUERY_SERVICE", "entities": {}, "turn_count": 2}
        skill, conf, entities, detail = recognize_intent(
            db, 1, "产线概况怎么样", [skill_a, skill_b], ctx
        )
        # 关键词匹配优先，不是continuation
        assert skill.skill_code == "QUERY_PROGRESS"
        assert detail["match_method"] == "rule"
        assert conf >= 0.8

    def test_continuation_picks_correct_skill(self, db):
        """continuation沿用的是last_intent对应的技能"""
        skill_a = Skill(
            tenant_id=1, skill_code="SKILL_A", skill_name="技能A",
            match_keywords=["甲"], status="published", sort_order=1,
        )
        skill_b = Skill(
            tenant_id=1, skill_code="SKILL_B", skill_name="技能B",
            match_keywords=["乙"], status="published", sort_order=2,
        )
        db.add_all([skill_a, skill_b])
        db.flush()

        ctx = {"last_intent": "SKILL_B", "entities": {}}
        skill, conf, entities, detail = recognize_intent(
            db, 1, "那丙呢", [skill_a, skill_b], ctx
        )
        assert skill.skill_code == "SKILL_B"


# ─────────────────── 证据链完整参数记录 ───────────────────


class TestEvidenceFullParams:
    """测试：证据链记录完整参数值和请求体"""

    def test_evidence_records_full_params(self):
        """add_step的detail中包含完整参数（非仅键名）"""
        ev = EvidenceCollector("sess1", 1, "cust1")
        ev.add_step("tool_test", {
            "request": {
                "method": "GET",
                "url": "https://api.example.com/api/test",
                "params": {"customerName": "生益电子", "status": "active"},
            },
            "source": "api",
            "status_code": 200,
        })
        step = ev.steps[0]
        req = step["detail"]["request"]
        assert req["params"]["customerName"] == "生益电子"
        assert req["url"] == "https://api.example.com/api/test"

    def test_evidence_records_post_body(self):
        """POST请求时证据链包含body"""
        ev = EvidenceCollector("sess1", 1, "cust1")
        ev.add_step("tool_test", {
            "request": {
                "method": "POST",
                "url": "https://api.example.com/api/query",
                "params": {"customerName": "胜宏科技"},
                "body": {"customerName": "胜宏科技"},
            },
            "source": "api",
            "status_code": 200,
        })
        step = ev.steps[0]
        req = step["detail"]["request"]
        assert req["body"]["customerName"] == "胜宏科技"
        assert req["method"] == "POST"


# ─────────────────── 同步引擎证据链 ───────────────────


class TestEngineEvidenceLogging:
    """测试：DialogEngine._execute_tool 也记录证据链"""

    def test_engine_evidence_after_tool_execution(self, db, factory):
        """同步引擎工具执行后evidence有记录"""
        conn = factory.connector(db, mock_enabled="1")
        entity = factory.entity(db, entity_code="svc", entity_name="服务")
        action = factory.action(db, entity, conn,
            action_code="query_svc",
            http_method="POST",
            api_path="/api/query/service",
            mock_response={"data": {"items": [{"id": 1}]}},
        )
        skill = factory.skill(db, skill_code="SVC_Q", match_keywords=["服务"])
        tool = factory.skill_tool(db, skill, entity, action, tools_mode="entity_action")

        session = factory.chat_session(db, "sess_ev_test")

        engine = DialogEngine(db, 1, "cust1")
        engine.process("sess_ev_test", "查询服务")

        # process 结束后 evidence 应该存在且有 tool 步骤
        assert engine.evidence is not None
        tool_steps = [s for s in engine.evidence.steps if s["step"].startswith("tool_")]
        assert len(tool_steps) >= 1
        # 验证记录了完整请求信息
        tool_step = tool_steps[0]
        req = tool_step["detail"]["request"]
        assert "url" in req
        assert "params" in req
        assert isinstance(req["params"], dict)

    def test_engine_evidence_has_response_preview(self, db, factory):
        """同步引擎工具执行后evidence有响应预览"""
        conn = factory.connector(db, mock_enabled="1")
        entity = factory.entity(db, entity_code="line", entity_name="产线")
        action = factory.action(db, entity, conn,
            action_code="query_line",
            http_method="GET",
            api_path="/api/lines",
            mock_response={"data": {"items": [{"id": 1, "name": "L1"}, {"id": 2, "name": "L2"}]}},
        )
        skill = factory.skill(db, skill_code="LINE_Q", match_keywords=["产线"])
        tool = factory.skill_tool(db, skill, entity, action, tools_mode="entity_action")

        session = factory.chat_session(db, "sess_ev_test2")

        engine = DialogEngine(db, 1, "cust1")
        engine.process("sess_ev_test2", "查询产线")

        tool_steps = [s for s in engine.evidence.steps if s["step"].startswith("tool_")]
        assert len(tool_steps) >= 1
        assert "response_preview" in tool_steps[0]["detail"]
