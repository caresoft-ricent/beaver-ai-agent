"""BeaverDatasetRequestMapper 纯单元测试 — 不依赖数据库

验证打平参数 → filterModel/valueCols/rowGroupCols/sortModel 映射规则，
包括 filterModel 集合模式（同一字段多条件）。

用法:
    cd backend
    source .venv/bin/activate
    python tests/test_mapper_unit.py
"""
from __future__ import annotations

import json
import sys
import os
from dataclasses import dataclass, field
from typing import Optional

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


# ── Mock ActionParameter 和 Action，不依赖数据库 ──

@dataclass
class MockParam:
    name: str
    source_property: str = None
    is_input: bool = False
    is_output: bool = False
    is_required: bool = False
    default_value: str = None
    filter_type: str = None
    filter_condition: str = None
    value_mode: str = "filter"
    agg_func: str = None
    sort_order: str = None


@dataclass
class MockAction:
    action_code: str = "test_dataset"


def section(t):
    print(f"\n{'─'*50}\n  {t}\n{'─'*50}")


def ok(msg):
    print(f"  ✅ {msg}")


def fail(msg):
    print(f"  ❌ {msg}")


def main():
    from app.runtime.adapters.webapi_adapter import (
        BeaverDatasetRequestMapper,
        BeaverDatasetResponseMapper,
        PassthroughRequestMapper,
        PassthroughResponseMapper,
    )

    mapper = BeaverDatasetRequestMapper()
    action = MockAction(action_code="inspection_list")

    # ═══════════════════════════════════════════
    section("1. 基本 filterModel 映射")
    # ═══════════════════════════════════════════
    input_defs = [
        MockParam(name="project_id", is_input=True, filter_type="Long", filter_condition="equals", value_mode="filter"),
        MockParam(name="status", is_input=True, filter_type="set", value_mode="values"),
        MockParam(name="keyword", is_input=True),
        MockParam(name="limit", is_input=True),
    ]
    output_defs = [
        MockParam(name="project_name", is_output=True),
        MockParam(name="total", is_output=True, agg_func="count"),
    ]

    body = mapper.map_request(
        {"project_id": 123, "status": [1, 2], "keyword": "漏水", "limit": 50},
        input_defs, output_defs, action,
    )

    assert body["datasetCode"] == "inspection_list"
    ok(f"datasetCode = {body['datasetCode']}")

    assert body["keyword"] == "漏水"
    ok(f"keyword = {body['keyword']}")

    assert body["limit"] == 50
    ok(f"limit = {body['limit']}")

    fm = body["filterModel"]
    assert fm["project_id"] == {"filterType": "Long", "type": "equals", "filter": 123}
    ok(f"project_id filter = {fm['project_id']}")

    assert fm["status"] == {"filterType": "set", "values": [1, 2]}
    ok(f"status set filter = {fm['status']}")

    assert any(v["field"] == "total" and v.get("aggFunc") == "count" for v in body["valueCols"])
    ok(f"valueCols with aggFunc")

    assert any(v["field"] == "project_name" for v in body["rowGroupCols"])
    ok(f"rowGroupCols includes project_name (no agg → auto group)")

    # ═══════════════════════════════════════════
    section("2. date_range 映射")
    # ═══════════════════════════════════════════
    date_defs = [
        MockParam(name="create_date", is_input=True, filter_type="Date", filter_condition="inRange", value_mode="date_range"),
    ]
    body2 = mapper.map_request(
        {"create_date": ["2026-01-01", "2026-03-01"]},
        date_defs, [], action,
    )
    fd = body2["filterModel"]["create_date"]
    assert fd["dateFrom"] == "2026-01-01"
    assert fd["dateTo"] == "2026-03-01"
    assert fd["filterType"] == "Date"
    assert fd["type"] == "inRange"
    ok(f"date_range mapping = {fd}")

    # ═══════════════════════════════════════════
    section("3. range 映射")
    # ═══════════════════════════════════════════
    range_defs = [
        MockParam(name="amount", is_input=True, filter_type="Decimal", filter_condition="inRange", value_mode="range"),
    ]
    body3 = mapper.map_request(
        {"amount": [100, 5000]},
        range_defs, [], action,
    )
    fr = body3["filterModel"]["amount"]
    assert fr["filter"] == 100
    assert fr["filterTo"] == 5000
    ok(f"range mapping = {fr}")

    # ═══════════════════════════════════════════
    section("4. filterModel 集合模式（同一字段多条件）")
    # ═══════════════════════════════════════════
    # 模拟同一字段 amount 有两个条件: greaterThan AND lessThan
    multi_defs = [
        MockParam(name="amount", is_input=True, filter_type="Decimal", filter_condition="greaterThan", value_mode="filter"),
        MockParam(name="amount", is_input=True, filter_type="Decimal", filter_condition="lessThan", value_mode="filter"),
    ]
    body4 = mapper.map_request(
        {"amount": 100},  # 同名参数，两个 param_def 各取一次
        multi_defs, [], action,
    )
    fa = body4["filterModel"]["amount"]
    assert "conditions" in fa, f"Expected conditions array, got {fa}"
    assert fa["operator"] == "AND"
    assert len(fa["conditions"]) == 2
    assert fa["conditions"][0]["type"] == "greaterThan"
    assert fa["conditions"][1]["type"] == "lessThan"
    ok(f"filterModel collection mode = {json.dumps(fa, ensure_ascii=False)}")

    # ═══════════════════════════════════════════
    section("5. sortModel 映射")
    # ═══════════════════════════════════════════
    sort_defs = [
        MockParam(name="create_time", is_output=True, sort_order="desc"),
        MockParam(name="name", is_output=True),
    ]
    body5 = mapper.map_request({}, [], sort_defs, action)
    sm = body5["sortModel"]
    assert len(sm) == 1
    assert sm[0] == {"colId": "create_time", "sort": "desc"}
    ok(f"sortModel = {sm}")

    # ═══════════════════════════════════════════
    section("6. source_property 优先取值")
    # ═══════════════════════════════════════════
    sp_defs = [
        MockParam(name="project_id", source_property="projectId", is_input=True,
                  filter_type="Long", filter_condition="equals"),
    ]
    body6 = mapper.map_request(
        {"projectId": 999},  # source_property 优先
        sp_defs, [], action,
    )
    assert body6["filterModel"]["project_id"]["filter"] == 999
    ok("source_property='projectId' → flat_params['projectId'] = 999")

    # ═══════════════════════════════════════════
    section("7. Passthrough 映射器")
    # ═══════════════════════════════════════════
    pt_req = PassthroughRequestMapper()
    pt_body = pt_req.map_request({"a": 1, "b": 2}, [], [], action)
    assert pt_body == {"a": 1, "b": 2}
    ok("PassthroughRequestMapper: passthrough")

    pt_resp = PassthroughResponseMapper()
    raw = {"code": 200, "data": [1, 2, 3]}
    assert pt_resp.map_response(raw, []) == raw
    ok("PassthroughResponseMapper: passthrough")

    # ═══════════════════════════════════════════
    section("8. BeaverDatasetResponseMapper")
    # ═══════════════════════════════════════════
    resp_mapper = BeaverDatasetResponseMapper()

    # 嵌套格式
    r1 = resp_mapper.map_response({"code": 200, "data": {"data": [{"id": 1}], "total": 10}}, [])
    assert r1 == {"items": [{"id": 1}], "total": 10}
    ok(f"Nested response: {r1}")

    # 平铺格式
    r2 = resp_mapper.map_response({"code": 200, "data": [{"id": 2}]}, [])
    assert r2 == {"items": [{"id": 2}], "total": 1}
    ok(f"Flat response: {r2}")

    # 非 dict
    r3 = resp_mapper.map_response("raw_text", [])
    assert r3 == "raw_text"
    ok("Non-dict passthrough")

    # ═══════════════════════════════════════════
    section("ALL UNIT TESTS PASSED ✅")
    print(f"\n  Total: 8 test groups, all passed.\n")


if __name__ == "__main__":
    main()
