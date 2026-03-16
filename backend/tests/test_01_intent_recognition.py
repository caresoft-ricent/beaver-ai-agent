"""金样例测试 1：意图识别（规则匹配 + LLM fallback）

验证：
- 关键词匹配能正确识别意图
- 多关键词得分排序正确
- 正则模式匹配及实体抽取
- 无匹配时返回 None
- LLM fallback 路径（mock LLM）
"""
import pytest
from unittest.mock import patch, MagicMock
from app.core.stream_engine import _recognize_intent


class TestRuleBasedIntentRecognition:
    """规则匹配意图识别"""

    def test_keyword_match_single(self, db, factory, tenant_id):
        """单个关键词匹配"""
        skill = factory.skill(db, skill_code="issue_query",
                              skill_name="问题查询",
                              match_keywords=["问题", "查询问题", "问题列表"])

        matched, confidence, entities, detail = _recognize_intent(
            db, tenant_id, "帮我查询问题", [skill], {}
        )

        assert matched is not None
        assert matched.skill_code == "issue_query"
        assert confidence >= 0.7
        assert detail["match_method"] == "rule"

    def test_keyword_match_multi_score(self, db, factory, tenant_id):
        """多关键词命中时得分更高"""
        skill = factory.skill(db, skill_code="issue_query",
                              match_keywords=["问题", "查询", "列表"])

        _, conf_multi, _, _ = _recognize_intent(
            db, tenant_id, "查询问题列表", [skill], {}
        )

        _, conf_single, _, _ = _recognize_intent(
            db, tenant_id, "查看问题", [skill], {}
        )

        assert conf_multi > conf_single, "多关键词命中应比单关键词得分高"

    def test_multiple_skills_best_match(self, db, factory, tenant_id):
        """多个技能竞争时选最佳匹配"""
        skill_a = factory.skill(db, skill_code="issue_query",
                                skill_name="问题查询",
                                match_keywords=["问题", "查询"],
                                sort_order=1)
        skill_b = factory.skill(db, skill_code="project_summary",
                                skill_name="项目概况",
                                match_keywords=["项目", "概况", "进度"],
                                sort_order=2)

        matched, _, _, _ = _recognize_intent(
            db, tenant_id, "查看项目概况和进度", [skill_a, skill_b], {}
        )

        assert matched.skill_code == "project_summary", "应匹配命中更多关键词的技能"

    def test_pattern_match_with_entity_extraction(self, db, factory, tenant_id):
        """正则模式匹配并抽取实体"""
        skill = factory.skill(db, skill_code="issue_query",
                              match_keywords=[],
                              match_patterns=[r"查询(?P<area>.+?)的问题"])

        matched, confidence, entities, detail = _recognize_intent(
            db, tenant_id, "查询A区的问题", [skill], {}
        )

        assert matched is not None
        assert confidence >= 0.9
        assert entities.get("area") == "A区"

    def test_no_match_returns_none(self, db, factory, tenant_id):
        """无匹配时返回 None"""
        skill = factory.skill(db, skill_code="issue_query",
                              match_keywords=["问题", "查询"])

        matched, confidence, entities, detail = _recognize_intent(
            db, tenant_id, "今天天气怎么样", [skill], {}
        )

        assert matched is None
        assert confidence == 0


class TestLLMFallbackIntentRecognition:
    """LLM 兜底意图识别"""

    def test_llm_fallback_on_no_rule_match(self, db, factory, tenant_id):
        """规则无匹配时走 LLM"""
        factory.llm_config(db, usage="intent")
        skill = factory.skill(db, skill_code="issue_query",
                              skill_name="问题查询",
                              match_keywords=["非常特殊的关键词"])

        mock_llm_response = {
            "intent": "issue_query",
            "confidence": 0.85,
            "entities": {"status": "open"},
        }

        with patch("app.core.pipeline.call_llm_for_intent", return_value=mock_llm_response):
            matched, confidence, entities, detail = _recognize_intent(
                db, tenant_id, "有哪些未解决的工单", [skill], {}
            )

        assert matched is not None
        assert matched.skill_code == "issue_query"
        assert confidence == 0.85
        assert entities.get("status") == "open"
        assert detail["match_method"] == "llm"

    def test_llm_low_confidence_returns_none(self, db, factory, tenant_id):
        """LLM 置信度低于阈值时返回 None"""
        factory.llm_config(db, usage="intent")
        skill = factory.skill(db, skill_code="issue_query",
                              match_keywords=["非常特殊的关键词"])

        mock_llm_response = {
            "intent": "issue_query",
            "confidence": 0.3,
            "entities": {},
        }

        with patch("app.core.pipeline.call_llm_for_intent", return_value=mock_llm_response):
            matched, _, _, detail = _recognize_intent(
                db, tenant_id, "随便聊聊", [skill], {}
            )

        assert matched is None
        assert detail["match_method"] == "llm"

    def test_llm_error_graceful_degradation(self, db, factory, tenant_id):
        """LLM 调用失败时优雅降级"""
        factory.llm_config(db, usage="intent")
        skill = factory.skill(db, skill_code="issue_query",
                              match_keywords=["非常特殊的关键词"])

        with patch("app.core.pipeline.call_llm_for_intent", side_effect=Exception("API超时")):
            matched, _, _, detail = _recognize_intent(
                db, tenant_id, "查看问题", [skill], {}
            )

        assert matched is None
        assert detail["match_method"] == "llm_error"
        assert "API超时" in detail["error"]
