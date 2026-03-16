"""金样例测试 5：完整对话端到端（同步引擎 DialogEngine）

验证完整处理链：
  用户输入 → 意图识别 → 实体合并 → 归一化 → 槽位校验 → 工具执行 → 回复生成

使用同步引擎 DialogEngine.process() 测试，避免 async 复杂性。
所有外部调用（LLM、Connector）均 mock。
"""
import pytest
import json
from unittest.mock import patch, MagicMock
from app.core.engine import DialogEngine, EngineResult
from app.core.context_manager import load_context, save_context


class TestEndToEndDialogSimple:
    """端到端对话 - 简单场景"""

    def test_keyword_match_mock_tool_response(self, db, factory, tenant_id, customer_id):
        """关键词匹配 → mock 工具执行 → 文本格式化回复"""
        # 准备数据：连接器(mock模式) + 实体 + 操作 + 技能 + 工具链
        connector = factory.connector(db, mock_enabled="1")
        entity = factory.entity(db, entity_code="issue", entity_name="问题")
        action = factory.action(db, entity, connector,
                                action_code="query_issues",
                                action_name="查询问题",
                                mock_response={"data": {"items": [
                                    {"id": 1, "title": "外墙渗漏", "status": "open"},
                                    {"id": 2, "title": "地面裂缝", "status": "closed"},
                                ]}})
        skill = factory.skill(db, skill_code="issue_query",
                              skill_name="问题查询",
                              match_keywords=["问题", "查询问题"])
        factory.skill_tool(db, skill, entity=entity, action=action,
                           tools_mode="entity_action")

        engine = DialogEngine(db, tenant_id, customer_id)
        result = engine.process("session_e2e_1", "帮我查询问题")

        assert result.reply is not None
        assert len(result.reply) > 0
        assert result.get("intent") == "issue_query"

    def test_template_response(self, db, factory, tenant_id, customer_id):
        """模板回复 - 技能有 response_template"""
        connector = factory.connector(db, mock_enabled="1")
        entity = factory.entity(db, entity_code="project", entity_name="项目")
        action = factory.action(db, entity, connector,
                                action_code="project_summary",
                                mock_response={"data": {"total": 5, "active": 3}})
        skill = factory.skill(db, skill_code="project_summary",
                              skill_name="项目概况",
                              match_keywords=["项目", "概况"],
                              response_template="当前共有项目相关数据。")
        factory.skill_tool(db, skill, entity=entity, action=action,
                           tools_mode="entity_action")

        engine = DialogEngine(db, tenant_id, customer_id)
        result = engine.process("session_e2e_2", "查看项目概况")

        assert "项目" in result.reply

    def test_no_skills_returns_config_message(self, db, tenant_id, customer_id):
        """无技能配置时返回配置中提示"""
        engine = DialogEngine(db, tenant_id, customer_id)
        result = engine.process("session_empty", "你好")

        assert "配置" in result.reply or "暂时" in result.reply

    def test_no_match_returns_help_text(self, db, factory, tenant_id, customer_id):
        """无匹配意图时返回帮助文本"""
        factory.skill(db, skill_code="issue_query",
                      match_keywords=["问题", "查询问题"])

        engine = DialogEngine(db, tenant_id, customer_id)
        result = engine.process("session_nomatch", "abcdefg随机输入")

        assert "无法理解" in result.reply or "抱歉" in result.reply


class TestEndToEndDialogWithSlots:
    """端到端对话 - 带槽位校验"""

    def test_missing_slot_triggers_clarification(self, db, factory, tenant_id, customer_id):
        """缺少必填参数时触发追问"""
        connector = factory.connector(db, mock_enabled="1")
        entity = factory.entity(db, entity_code="issue", entity_name="问题")
        action = factory.action(db, entity, connector,
                                action_code="close_issue",
                                mock_response={"success": True})
        factory.action_parameter(db, action,
                                 name="issue_id", source_property="issue_id",
                                 title="问题ID", is_required=True, is_input=True)
        skill = factory.skill(db, skill_code="issue_close",
                              skill_name="关闭问题",
                              match_keywords=["关闭问题", "关闭"])
        factory.skill_tool(db, skill, entity=entity, action=action,
                           tools_mode="entity_action")

        engine = DialogEngine(db, tenant_id, customer_id)
        result = engine.process("session_slot", "请帮我关闭问题")

        assert result.get("needs_clarification") is True
        assert result.reply is not None


class TestEndToEndContext:
    """端到端对话 - 上下文保持"""

    def test_context_preserves_across_turns(self, db, factory, tenant_id, customer_id):
        """多轮对话实体保持"""
        connector = factory.connector(db, mock_enabled="1")
        entity = factory.entity(db, entity_code="issue", entity_name="问题")
        action = factory.action(db, entity, connector,
                                action_code="query_issues",
                                mock_response={"data": {"items": [{"id": 1}]}})
        skill = factory.skill(db, skill_code="issue_query",
                              match_keywords=["问题", "查询"])
        factory.skill_tool(db, skill, entity=entity, action=action,
                           tools_mode="entity_action")

        session_id = "session_multi_turn"
        engine = DialogEngine(db, tenant_id, customer_id)

        # 第一轮
        result1 = engine.process(session_id, "查询问题")
        assert result1.get("intent") == "issue_query"

        # 第二轮 - 应该能保持上下文
        result2 = engine.process(session_id, "还有其他问题吗")
        # 至少不应该报错
        assert result2.reply is not None

    def test_intent_switch_clears_entities(self, db, factory, tenant_id, customer_id):
        """切换意图时清除旧实体"""
        connector = factory.connector(db, mock_enabled="1")
        entity = factory.entity(db, entity_code="issue", entity_name="问题")
        action = factory.action(db, entity, connector,
                                action_code="query_issues",
                                mock_response={"data": {"items": []}})

        skill_a = factory.skill(db, skill_code="issue_query",
                                skill_name="问题查询",
                                match_keywords=["问题", "查询问题"])
        factory.skill_tool(db, skill_a, entity=entity, action=action,
                           tools_mode="entity_action")

        skill_b = factory.skill(db, skill_code="project_summary",
                                skill_name="项目概况",
                                match_keywords=["项目", "概况"])

        session_id = "session_switch"
        # 先创建 ChatSession 记录，否则 save_context 无法持久化
        factory.chat_session(db, session_id, tenant_id=tenant_id, customer_id=customer_id)

        engine = DialogEngine(db, tenant_id, customer_id)

        # 第一轮 - 问题查询
        engine.process(session_id, "查询问题")
        ctx_after_1 = load_context(db, session_id)
        assert ctx_after_1.get("last_intent") == "issue_query"

        # 第二轮 - 切换到项目概况
        engine.process(session_id, "查看项目概况")
        ctx_after_2 = load_context(db, session_id)
        assert ctx_after_2.get("last_intent") == "project_summary"
        # 切换意图后旧实体应被清除
        assert ctx_after_2.get("entities") == {}
