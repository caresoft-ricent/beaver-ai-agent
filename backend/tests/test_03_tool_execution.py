"""金样例测试 3：工具链执行（mock connector）

验证：
- entity+action 模式下的工具执行
- api_config 模式下的工具执行
- mock_response 回退
- 参数映射（source_property → api_param_name）
- 输出聚合（count/sum）
"""
import pytest
from unittest.mock import patch, MagicMock
from app.core.stream_engine import (
    _execute_tool_with_events, _build_param_mapping, _apply_output_aggregation,
)
from app.core.evidence import EvidenceCollector


class TestExecuteToolEntityAction:
    """entity+action 模式工具执行"""

    def test_mock_enabled_returns_mock_data(self, db, factory):
        """mock 模式返回预设数据"""
        connector = factory.connector(db, mock_enabled="1")
        entity = factory.entity(db)
        action = factory.action(db, entity, connector,
                                mock_response={"data": {"items": [{"id": 1, "name": "测试"}]}})
        skill = factory.skill(db)
        tool = factory.skill_tool(db, skill, entity=entity, action=action,
                                  tools_mode="entity_action")

        result = _execute_tool_with_events(db, tool, {"area": "A区"}, "customer_001")

        assert result["data"] is not None
        assert result["data"]["source"] == "mock"

    def test_no_connector_uses_mock_fallback(self, db, factory):
        """无连接器时使用 mock 数据"""
        entity = factory.entity(db)
        action = factory.action(db, entity, connector=None,
                                mock_response={"data": {"items": []}})
        skill = factory.skill(db)
        tool = factory.skill_tool(db, skill, entity=entity, action=action,
                                  tools_mode="entity_action")

        result = _execute_tool_with_events(db, tool, {}, "customer_001")

        assert result["data"] is not None
        assert result["data"]["source"] == "mock"

    def test_events_contain_tool_call_lifecycle(self, db, factory):
        """工具执行事件包含完整生命周期"""
        connector = factory.connector(db, mock_enabled="1")
        entity = factory.entity(db)
        action = factory.action(db, entity, connector,
                                action_name="查询问题",
                                mock_response={"data": {"items": []}})
        skill = factory.skill(db)
        tool = factory.skill_tool(db, skill, entity=entity, action=action,
                                  tools_mode="entity_action")

        result = _execute_tool_with_events(db, tool, {}, "customer_001")

        events = result["events"]
        assert len(events) >= 3, "应包含 start, args, end 事件"
        # 验证事件中包含 TOOL_CALL 相关类型
        event_data = [e for e in events if "TOOL_CALL" in e or "tool_call" in e]
        assert len(event_data) >= 1, "至少包含一个tool_call事件"


class TestExecuteToolApiConfig:
    """api_config 模式工具执行"""

    def test_api_config_mock_response(self, db, factory):
        """api_config 模式的 mock 响应"""
        connector = factory.connector(db, mock_enabled="1")
        skill = factory.skill(db)
        tool = factory.skill_tool(db, skill, tools_mode="api",
                                  config={
                                      "api_config": {
                                          "name": "query_issues",
                                          "connector_id": connector.id,
                                          "http_method": "GET",
                                          "api_path": "/api/issues",
                                          "mock_response": {"items": [{"id": 1}]},
                                      }
                                  })

        result = _execute_tool_with_events(db, tool, {"status": "open"}, "customer_001")

        assert result["data"] is not None


class TestBuildParamMapping:
    """参数名映射"""

    def test_mapping_with_source_property(self, db, factory):
        """source_property 与 name 不同时创建映射"""
        entity = factory.entity(db)
        connector = factory.connector(db)
        action = factory.action(db, entity, connector, action_code="query_issues")
        factory.action_parameter(db, action,
                                 name="regionId", source_property="line_code",
                                 is_input=True)

        mapping = _build_param_mapping(db, action.id)

        assert mapping is not None
        assert mapping["regionId"] == "line_code"

    def test_no_mapping_when_names_match(self, db, factory):
        """name 和 source_property 相同时无映射"""
        entity = factory.entity(db)
        connector = factory.connector(db)
        action = factory.action(db, entity, connector)
        factory.action_parameter(db, action,
                                 name="status", source_property="status",
                                 is_input=True)

        mapping = _build_param_mapping(db, action.id)

        assert mapping is None


class TestOutputAggregation:
    """输出参数聚合"""

    def test_count_aggregation(self, db, factory):
        """count 聚合计算列表长度"""
        entity = factory.entity(db)
        connector = factory.connector(db)
        action = factory.action(db, entity, connector)
        factory.action_parameter(db, action,
                                 name="total", source_property="total",
                                 is_input=False, is_output=True,
                                 value_type="count")

        result = {"data": {"data": {"items": [
            {"id": 1}, {"id": 2}, {"id": 3}
        ]}}}

        aggregated = _apply_output_aggregation(db, action.id, result)

        assert "aggregated" in aggregated
        assert aggregated["aggregated"]["total"] == 3

    def test_sum_aggregation(self, db, factory):
        """sum 聚合计算字段总和"""
        entity = factory.entity(db)
        connector = factory.connector(db)
        action = factory.action(db, entity, connector)
        factory.action_parameter(db, action,
                                 name="amount", source_property="amount",
                                 is_input=False, is_output=True,
                                 value_type="sum")

        result = {"data": {"data": {"items": [
            {"amount": 10}, {"amount": 20}, {"amount": 30}
        ]}}}

        aggregated = _apply_output_aggregation(db, action.id, result)

        assert "aggregated" in aggregated
        assert aggregated["aggregated"]["amount"] == 60.0

    def test_no_aggregation_params(self, db, factory):
        """无聚合参数时原样返回"""
        entity = factory.entity(db)
        connector = factory.connector(db)
        action = factory.action(db, entity, connector)

        result = {"data": {"items": [{"id": 1}]}}
        aggregated = _apply_output_aggregation(db, action.id, result)

        assert "aggregated" not in aggregated
