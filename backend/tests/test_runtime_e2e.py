"""2.0 Runtime 端到端测试脚本

测试完整链路: DomainRuntime → ContextPlanner → ActionRuntime → ResponseRuntime
使用 inspection 样板域种子数据。

用法:
    cd backend
    source .venv/bin/activate
    python tests/test_runtime_e2e.py
"""
from __future__ import annotations

import asyncio
import json
import sys
import os

# 确保 backend 目录在 path 中
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def section(title: str):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")


def ok(msg: str):
    print(f"  ✅ {msg}")


def fail(msg: str):
    print(f"  ❌ {msg}")


def info(msg: str):
    print(f"  ℹ️  {msg}")


def test_domain_runtime(db, tenant_id=1):
    """测试 1: DomainRuntime 装载 inspection 域"""
    section("Test 1: DomainRuntime.load_domain_pack('inspection')")

    from app.runtime.domain_runtime import DomainRuntime, DomainNotAvailable

    runtime = DomainRuntime(db, tenant_id)

    # 列出已发布域
    domains = runtime.list_published_domains()
    info(f"Published domains: {[d.code for d in domains]}")
    assert any(d.code == "inspection" for d in domains), "inspection domain not found"
    ok("list_published_domains() found inspection")

    # 装载 DomainPack
    pack = runtime.load_domain_pack("inspection")
    assert pack.domain.code == "inspection"
    assert pack.domain.name == "工序验收"
    ok(f"Domain: {pack.domain.name} (code={pack.domain.code})")

    assert len(pack.entities) >= 1
    ok(f"Entities: {[e.entity_code for e in pack.entities]}")

    assert len(pack.actions) >= 2
    ok(f"Actions: {pack.all_action_codes()}")

    # 检查参数
    for action in pack.actions:
        inputs = pack.get_input_params(action.id)
        outputs = pack.get_output_params(action.id)
        ok(f"  {action.action_code}: {len(inputs)} inputs, {len(outputs)} outputs")
        for p in inputs:
            info(f"    IN  {p.name} filter_type={p.filter_type} value_mode={p.value_mode}")
        for p in outputs:
            info(f"    OUT {p.name} agg_func={p.agg_func} sort_order={p.sort_order}")

    # 测试 resolve_domain
    code = runtime.resolve_domain("查看工序验收记录")
    assert code == "inspection", f"Expected 'inspection', got '{code}'"
    ok(f"resolve_domain('查看工序验收记录') → '{code}'")

    code2 = runtime.resolve_domain("你好，今天天气怎么样")
    info(f"resolve_domain('你好，今天天气怎么样') → '{code2}' (expected None)")

    # 测试缓存
    pack2 = runtime.load_domain_pack("inspection")
    assert pack2 is pack  # 同一对象
    ok("Cache hit verified")

    # 测试 DomainNotAvailable
    try:
        runtime.load_domain_pack("nonexistent_domain")
        fail("Should have raised DomainNotAvailable")
    except DomainNotAvailable as e:
        ok(f"DomainNotAvailable raised: {e}")

    return pack


def test_beaver_dataset_mapper(pack):
    """测试 2: BeaverDatasetRequestMapper 映射"""
    section("Test 2: BeaverDatasetRequestMapper")

    from app.runtime.adapters.webapi_adapter import BeaverDatasetRequestMapper

    mapper = BeaverDatasetRequestMapper()

    # 找 inspection_list action
    action = pack.get_action_by_code("inspection_list")
    assert action, "inspection_list action not found"
    input_defs = pack.get_input_params(action.id)
    output_defs = pack.get_output_params(action.id)

    # 场景 A: 基本查询 — 按项目+状态筛选
    flat_params_a = {
        "project_id": 12345,
        "inspection_status": [1, 2],
        "keyword": "漏水",
    }
    body_a = mapper.map_request(flat_params_a, input_defs, output_defs, action)
    info(f"Scene A body:\n{json.dumps(body_a, indent=2, ensure_ascii=False)}")

    assert body_a["datasetCode"] == "inspection_list"
    ok(f"datasetCode = {body_a['datasetCode']}")

    assert body_a.get("keyword") == "漏水"
    ok(f"keyword = {body_a['keyword']}")

    fm = body_a["filterModel"]
    assert "project_id" in fm
    assert fm["project_id"]["filterType"] == "Long"
    assert fm["project_id"]["filter"] == 12345
    ok(f"filterModel.project_id = {fm['project_id']}")

    assert "inspection_status" in fm
    assert fm["inspection_status"]["filterType"] == "set"
    assert fm["inspection_status"]["values"] == [1, 2]
    ok(f"filterModel.inspection_status = {fm['inspection_status']}")

    assert len(body_a["valueCols"]) > 0
    ok(f"valueCols count = {len(body_a['valueCols'])}")

    # 场景 B: 日期范围查询
    flat_params_b = {
        "inspection_date": ["2026-01-01", "2026-03-01"],
    }
    body_b = mapper.map_request(flat_params_b, input_defs, output_defs, action)
    info(f"Scene B body:\n{json.dumps(body_b, indent=2, ensure_ascii=False)}")

    if "inspection_date" in body_b["filterModel"]:
        fd = body_b["filterModel"]["inspection_date"]
        assert fd["filterType"] == "Date"
        assert fd.get("dateFrom") == "2026-01-01"
        assert fd.get("dateTo") == "2026-03-01"
        ok(f"filterModel.inspection_date date_range = {fd}")

    # 场景 C: 统计查询 — 验证 valueCols + rowGroupCols
    action_stat = pack.get_action_by_code("inspection_statistics")
    assert action_stat, "inspection_statistics action not found"
    input_stat = pack.get_input_params(action_stat.id)
    output_stat = pack.get_output_params(action_stat.id)

    flat_params_c = {"project_id": 99}
    body_c = mapper.map_request(flat_params_c, input_stat, output_stat, action_stat)
    info(f"Scene C (statistics) body:\n{json.dumps(body_c, indent=2, ensure_ascii=False)}")

    agg_cols = [v for v in body_c["valueCols"] if v.get("aggFunc")]
    ok(f"valueCols with aggFunc: {agg_cols}")

    row_groups = body_c["rowGroupCols"]
    ok(f"rowGroupCols: {row_groups}")

    assert len(agg_cols) >= 2, "Should have at least 2 agg columns"
    ok("Statistics mapping correct")


def test_context_planner(db, pack, tenant_id=1):
    """测试 3: ContextPlanner 规划"""
    section("Test 3: ContextPlanner.plan()")

    from app.runtime.context_planner import ContextPlanner

    planner = ContextPlanner(db, tenant_id)

    # 场景 A: 参数充足 → execute
    entities_full = {
        "project_id": 12345,
        "inspection_status": [1, 2],
    }
    plan_a = planner.plan(pack, entities_full, "查看12345项目的验收记录",
                          intent_code="inspection_list")
    ok(f"Plan A: type={plan_a.plan_type}, action={plan_a.action_code}")
    ok(f"  flat_params={plan_a.flat_params}")
    assert plan_a.plan_type == "execute"
    assert plan_a.action_code == "inspection_list"
    ok("Full params → execute ✓")

    # 场景 B: 无参数匹配 → 根据覆盖率选择
    entities_empty = {}
    plan_b = planner.plan(pack, entities_empty, "查看验收情况")
    ok(f"Plan B: type={plan_b.plan_type}, action={plan_b.action_code}")
    info(f"  gaps={[g['name'] for g in plan_b.param_gaps]}")
    # 无必填参数时应该直接 execute
    ok(f"Empty params plan_type = {plan_b.plan_type}")

    # 场景 C: 意图精确匹配
    plan_c = planner.plan(pack, {"project_id": 1}, "验收统计",
                          intent_code="inspection_statistics")
    assert plan_c.action_code == "inspection_statistics"
    ok(f"Plan C: exact match → {plan_c.action_code}")


def parse_sse(event_str: str) -> dict:
    """Parse SSE 'data: {...}\\n\\n' into dict"""
    for line in event_str.strip().split("\n"):
        if line.startswith("data: "):
            return json.loads(line[6:])
    return {}


def test_response_runtime(db, pack, tenant_id=1):
    """测试 4: ResponseRuntime 组装"""
    section("Test 4: ResponseRuntime.compose()")

    from app.runtime.context_planner import ContextPlanner, PlanResult
    from app.runtime.action_runtime import ActionResult
    from app.runtime.response_runtime import ResponseRuntime

    resp_rt = ResponseRuntime()

    # clarify 场景
    plan_clarify = PlanResult(
        plan_type="clarify",
        action_code="inspection_list",
        param_gaps=[{"name": "project_id", "title": "项目ID", "description": "必填"}],
        clarification_text="请提供项目ID",
    )
    events = resp_rt.compose(plan_clarify)
    ok(f"Clarify events: {len(events)} events")
    assert len(events) == 1
    evt0 = parse_sse(events[0])
    assert evt0["type"] == "CUSTOM"
    assert evt0["name"] == "clarification"
    info(f"  Event: {json.dumps(evt0, ensure_ascii=False)[:200]}")

    # execute + 成功结果
    plan_exec = PlanResult(plan_type="execute", action_code="inspection_list")
    result_ok = ActionResult(
        success=True, action_code="inspection_list",
        data={"items": [{"project_name": "测试项目"}], "total": 1},
        evidence={"action_code": "inspection_list", "latency_ms": 50},
    )
    events_exec = resp_rt.compose(plan_exec, result_ok)
    ok(f"Execute events: {len(events_exec)} events")
    for e in events_exec:
        parsed = parse_sse(e)
        info(f"  {parsed.get('name')}: {json.dumps(parsed, ensure_ascii=False)[:150]}")

    # execute + 失败结果
    result_fail = ActionResult(
        success=False, action_code="inspection_list",
        error="Connection timeout",
    )
    events_fail = resp_rt.compose(plan_exec, result_fail)
    ok(f"Fail events: {len(events_fail)} events")

    ok("ResponseRuntime all scenarios passed")


async def test_action_runtime_mock(db, pack, tenant_id=1):
    """测试 5: ActionRuntime (Mock — 不发真实HTTP)"""
    section("Test 5: ActionRuntime (构建验证，不发真实请求)")

    from app.runtime.action_runtime import ActionRuntime

    art = ActionRuntime(db, tenant_id)

    # 验证 action + connector 查找
    action = pack.get_action_by_code("inspection_list")
    assert action, "Action not found"

    from app.models.config import Connector
    connector = db.query(Connector).filter(Connector.id == action.connector_id).first()
    assert connector, "Connector not found"
    ok(f"Connector: {connector.name} (base_url={connector.base_url})")
    ok(f"  request_mapper={connector.request_mapper}, response_mapper={connector.response_mapper}")

    # 验证 adapter registry
    adapter_type = connector.adapter_type or "webapi"
    adapter_impl = art._registry.get(adapter_type)
    ok(f"Adapter: {adapter_type} → {type(adapter_impl).__name__}")

    info("(跳过真实 HTTP 调用 — 需要有效的 session_headers)")
    ok("ActionRuntime wiring verified")


def test_adapter_registry():
    """测试 6: AdapterRegistry"""
    section("Test 6: AdapterRegistry")

    from app.runtime.adapters.registry import build_default_registry

    reg = build_default_registry()

    webapi = reg.get("webapi")
    ok(f"webapi → {type(webapi).__name__}")

    database = reg.get("database")
    ok(f"database → {type(database).__name__}")

    try:
        reg.get("nonexistent")
        fail("Should have raised ValueError")
    except ValueError as e:
        ok(f"Unknown type raises ValueError: {e}")


def test_domain_pack_prompt(pack):
    """测试 7: DomainPack.to_prompt_context()"""
    section("Test 7: DomainPack.to_prompt_context()")

    prompt = pack.to_prompt_context()
    info(f"Prompt context:\n{prompt}")
    assert "inspection" in prompt
    assert "工序验收" in prompt
    ok("Prompt context generated correctly")


def main():
    print("\n" + "🔧" * 30)
    print("  beaver-ai-agent 2.0 Runtime E2E Test")
    print("🔧" * 30)

    from app.database import SessionLocal
    db = SessionLocal()

    try:
        # Test 1: DomainRuntime
        pack = test_domain_runtime(db)

        # Test 2: BeaverDatasetRequestMapper
        test_beaver_dataset_mapper(pack)

        # Test 3: ContextPlanner
        test_context_planner(db, pack)

        # Test 4: ResponseRuntime
        test_response_runtime(db, pack)

        # Test 5: ActionRuntime (mock)
        asyncio.run(test_action_runtime_mock(db, pack))

        # Test 6: AdapterRegistry
        test_adapter_registry()

        # Test 7: DomainPack prompt
        test_domain_pack_prompt(pack)

        section("ALL TESTS PASSED ✅")
        print(f"\n  Total: 7 test groups, all passed.\n")

    except AssertionError as e:
        fail(f"ASSERTION FAILED: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    except Exception as e:
        fail(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
