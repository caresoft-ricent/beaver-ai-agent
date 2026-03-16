"""金样例测试 4：槽位校验与追问

验证：
- 必填参数齐全时通过校验
- 必填参数缺失时返回追问
- 有默认值的必填参数不算缺失
- value_type=fixed 的参数不需要用户提供
- 追问文本生成正确
"""
import pytest
from app.core.context_manager import check_slots, build_clarification_reply


class TestSlotCheck:
    """槽位完整性校验"""

    def test_all_required_present(self, db, factory):
        """所有必填参数都已提供 → 校验通过"""
        entity = factory.entity(db)
        connector = factory.connector(db)
        action = factory.action(db, entity, connector)
        skill = factory.skill(db)
        factory.skill_tool(db, skill, entity=entity, action=action,
                           tools_mode="entity_action")
        factory.action_parameter(db, action,
                                 name="area", source_property="area",
                                 title="区域", is_required=True, is_input=True)

        entities = {"area": "A区"}
        result = check_slots(db, skill, entities)

        assert result.complete is True

    def test_missing_required_param(self, db, factory):
        """缺少必填参数 → 校验失败"""
        entity = factory.entity(db)
        connector = factory.connector(db)
        action = factory.action(db, entity, connector)
        skill = factory.skill(db)
        factory.skill_tool(db, skill, entity=entity, action=action,
                           tools_mode="entity_action")
        factory.action_parameter(db, action,
                                 name="area", source_property="area",
                                 title="区域", is_required=True, is_input=True)

        entities = {}  # 未提供 area
        result = check_slots(db, skill, entities)

        assert result.complete is False
        assert len(result.missing_required) > 0
        missing_names = [p["name"] for p in result.missing_required]
        assert "area" in missing_names

    def test_default_value_fills_required(self, db, factory):
        """有默认值的必填参数 → 视为满足"""
        entity = factory.entity(db)
        connector = factory.connector(db)
        action = factory.action(db, entity, connector)
        skill = factory.skill(db)
        factory.skill_tool(db, skill, entity=entity, action=action,
                           tools_mode="entity_action")
        factory.action_parameter(db, action,
                                 name="page_size", source_property="page_size",
                                 title="分页大小", is_required=True, is_input=True,
                                 default_value="20")

        entities = {}  # 未提供，但有默认值
        result = check_slots(db, skill, entities)

        assert result.complete is True

    def test_fixed_param_not_required_from_user(self, db, factory):
        """value_type=fixed 的参数由系统填充，不需要用户提供"""
        entity = factory.entity(db)
        connector = factory.connector(db)
        action = factory.action(db, entity, connector)
        skill = factory.skill(db)
        factory.skill_tool(db, skill, entity=entity, action=action,
                           tools_mode="entity_action")
        factory.action_parameter(db, action,
                                 name="tenant_code", source_property="tenant_code",
                                 title="租户编码", is_required=True, is_input=True,
                                 value_type="fixed", default_value="RYSGS")

        entities = {}  # 未提供，但 fixed 参数由系统注入
        result = check_slots(db, skill, entities)

        assert result.complete is True

    def test_optional_param_not_block(self, db, factory):
        """可选参数缺失不阻塞"""
        entity = factory.entity(db)
        connector = factory.connector(db)
        action = factory.action(db, entity, connector)
        skill = factory.skill(db)
        factory.skill_tool(db, skill, entity=entity, action=action,
                           tools_mode="entity_action")
        factory.action_parameter(db, action,
                                 name="area", source_property="area",
                                 title="区域", is_required=False, is_input=True)

        entities = {}
        result = check_slots(db, skill, entities)

        assert result.complete is True


class TestClarificationReply:
    """追问文本生成"""

    def test_clarification_text_generated(self, db, factory):
        """缺失参数时生成追问文本"""
        entity = factory.entity(db)
        connector = factory.connector(db)
        action = factory.action(db, entity, connector)
        skill = factory.skill(db)
        factory.skill_tool(db, skill, entity=entity, action=action,
                           tools_mode="entity_action")
        factory.action_parameter(db, action,
                                 name="area", source_property="area",
                                 title="区域", is_required=True, is_input=True,
                                 param_description="请提供查询区域")

        entities = {}
        slot_result = check_slots(db, skill, entities)
        text = build_clarification_reply(slot_result)

        assert text is not None
        assert len(text) > 0

    def test_no_clarification_when_complete(self, db, factory):
        """参数齐全时无追问"""
        entity = factory.entity(db)
        connector = factory.connector(db)
        action = factory.action(db, entity, connector)
        skill = factory.skill(db)
        factory.skill_tool(db, skill, entity=entity, action=action,
                           tools_mode="entity_action")
        factory.action_parameter(db, action,
                                 name="area", source_property="area",
                                 title="区域", is_required=True, is_input=True)

        entities = {"area": "A区"}
        slot_result = check_slots(db, skill, entities)
        text = build_clarification_reply(slot_result)

        # 校验通过时追问为空或返回 None
        assert text is None or text == ""
