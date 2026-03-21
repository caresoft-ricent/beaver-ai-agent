# beaver-ai-agent 2.0 Runtime Kernel 执行结果

> 执行依据: `docs/toAI/0321/beaver-ai-agent-2.0-Copilot执行指南-终极版v2.md`
> Git commit: `fc3962b` (branch: main)
> 16 files changed, 1299 insertions(+), 1 deletion(-)

---

## 执行概要

按 5 步渐进式完成 2.0 Runtime Kernel 基础架构搭建，采用**双轨机制**：
- **新路径**: Domain → DomainPack → ContextPlanner → ActionRuntime → ResponseRuntime
- **旧路径**: Skill → SkillTool → ConnectorClient（完全保留，零修改）

filterModel 已实现为**集合结构**（同一字段多条件用 `conditions[]` + `operator` 组合）。

---

## Step 1: Database + Model ✅

### 数据库迁移 (`backend/migrate_v2.sql`)
| 操作 | 表 | 新增字段 |
|------|----|----------|
| CREATE TABLE | `rc_ai_domain` | 15 列 (tenant_id, code, name, status, version 等) |
| ALTER TABLE | `rc_ai_entity` | `domain_id` |
| ALTER TABLE | `rc_ai_action` | `domain_id`, `evidence_schema`, `response_type` |
| ALTER TABLE | `rc_ai_action_parameter` | `filter_type`, `filter_condition`, `value_mode`, `agg_func`, `sort_order` |
| ALTER TABLE | `rc_ai_adapter` | `request_mapper`, `response_mapper` |
| ALTER TABLE | `rc_ai_execution_log` | `domain_id`, `param_gaps`, `fallback_reason`, `confirm_status` |

### Model 更新
- **新文件**: `backend/app/models/domain.py` — Domain 模型
- **修改**: ontology.py (Entity), action.py (Action/ActionParameter), config.py (Connector), execution_log.py (ExecutionLog), `__init__.py`

---

## Step 2: Domain Runtime ✅

**文件**: `backend/app/runtime/domain_runtime.py`

| 组件 | 职责 |
|------|------|
| `DomainPack` | Domain 完整运行时数据包 (domain + entities + properties + relations + actions + parameters) |
| `DomainRuntime` | 装载 Domain (带缓存)、列出已发布域、匹配域 (session沿用→关键词→None) |
| `DomainNotAvailable` | Domain 不存在/不可用异常 |

**DomainPack 便捷方法**: `get_entity()`, `get_actions_for_entity()`, `get_input_params()`, `get_output_params()`, `get_action_by_code()`, `all_action_codes()`, `to_prompt_context()`

---

## Step 3: Adapter Registry + Mapping ✅

### AdapterRegistry (`backend/app/runtime/adapters/registry.py`)
- `register(type, impl)` / `get(type)` / `build_default_registry()` — 注册 `"webapi"` → `WebApiAdapter`

### WebApiAdapter (`backend/app/runtime/adapters/webapi_adapter.py`)

| 组件 | 职责 |
|------|------|
| `WebApiAdapter` | 统一 HTTP 调用入口 (映射器选择→HTTP→响应映射) |
| `BeaverDatasetRequestMapper` | **核心**: flat_params → 河狸云数据集查询协议 |
| `BeaverDatasetResponseMapper` | 河狸云响应解包 ({code,data} → items/total) |
| `PassthroughRequestMapper` | 平进 (不转换) |
| `PassthroughResponseMapper` | 平出 (不转换) |

### BeaverDatasetRequestMapper 映射规则

```
输入参数 (is_input=True):
  name="keyword"      → body.keyword
  name="limit"        → body.limit
  filter_type 不为空  → filterModel[name]
    - 单条件: {filterType, type, filter/values/dateFrom...}
    - 多条件 (filterModel集合): {filterType, operator:"AND", conditions:[...]}
  value_mode:
    - "filter"      → filter: value
    - "values"      → values: [value]  (set模式)
    - "range"       → filter + filterTo
    - "date_range"  → dateFrom + dateTo

输出参数 (is_output=True):
  agg_func 不为空   → valueCols[{field, aggFunc}]
  agg_func 为空     → valueCols[{field}] + rowGroupCols[{field}] (有聚合时)
  sort_order 不为空 → sortModel[{colId, sort}]
```

---

## Step 4: Action Runtime + Context Planner + Response Runtime ✅

### ActionRuntime (`backend/app/runtime/action_runtime.py`)
- `execute(pack, action_code, flat_params, session_headers)` → `ActionResult`
- 流程: Action查找 → Connector查找 → Adapter选择 → HTTP执行 → 日志记录

### ContextPlanner (`backend/app/runtime/context_planner.py`)
- `plan(pack, entities, message, intent_code, skill)` → `PlanResult`
- 流程: Action匹配(精确/覆盖率) → 归一化+参数转换(复用context_manager) → 参数填充+缺口检测 → 确认检查
- `PlanResult.plan_type`: `execute` / `clarify` / `confirm` / `fallback`

### ResponseRuntime (`backend/app/runtime/response_runtime.py`)
- `compose(plan, action_result)` → AG-UI事件列表
- 按 plan_type 分发: clarify→追问事件 / confirm→确认卡片 / execute→数据+证据 / fallback→空

---

## Step 5: stream_engine 双轨集成 ✅

**修改文件**: `backend/app/core/stream_engine.py`

### 新增 imports
```python
from app.runtime.domain_runtime import DomainRuntime
from app.runtime.context_planner import ContextPlanner
from app.runtime.action_runtime import ActionRuntime
from app.runtime.response_runtime import ResponseRuntime
```

### 路由逻辑 (Step 3.5, 插入在意图识别之后、实体抽取之前)
```
_stream_dialog_inner:
  Step 3: 意图识别 (不变)
  ↓
  Step 3.5 [新增]: DomainRuntime.resolve_domain(message, ctx)
    ├─ domain_code 存在 → load_domain_pack → 新路径
    │   ├─ 实体抽取 (merge + LLM增强)
    │   ├─ ContextPlanner.plan() → PlanResult
    │   ├─ clarify/confirm/fallback → 直接返回
    │   └─ execute → ActionRuntime.execute() → ResponseRuntime → LLM回复
    │
    └─ domain_code 为 None → 旧路径 (Step 4-8 完全不变)
```

### 旧路径零改动
Step 4-8 (实体抽取→归一化→参数转换→槽位→工具链→回复) 完全保留原有逻辑。

---

## 验证结果

| 验证项 | 结果 |
|--------|------|
| 全模块 import 测试 | ✅ All runtime imports OK |
| stream_engine import 测试 | ✅ stream_engine import OK |
| uvicorn 启动测试 | ✅ Server boot OK (MySQL connected) |
| MySQL 迁移执行 | ✅ 所有 ALTER/CREATE 成功 |

---

## 文件清单

### 新增文件 (9)
| 文件 | 行数 | 说明 |
|------|------|------|
| `backend/app/models/domain.py` | ~40 | Domain 模型 |
| `backend/app/runtime/__init__.py` | ~10 | Runtime 包入口 |
| `backend/app/runtime/domain_runtime.py` | ~192 | DomainPack + DomainRuntime |
| `backend/app/runtime/adapters/__init__.py` | ~5 | Adapter 包入口 |
| `backend/app/runtime/adapters/registry.py` | ~33 | AdapterRegistry |
| `backend/app/runtime/adapters/webapi_adapter.py` | ~260 | WebApiAdapter + Mappers |
| `backend/app/runtime/action_runtime.py` | ~140 | ActionRuntime |
| `backend/app/runtime/context_planner.py` | ~170 | ContextPlanner |
| `backend/app/runtime/response_runtime.py` | ~95 | ResponseRuntime |
| `backend/migrate_v2.sql` | ~150 | 2.0 数据库迁移 |

### 修改文件 (6)
| 文件 | 改动 |
|------|------|
| `backend/app/models/ontology.py` | Entity +domain_id |
| `backend/app/models/action.py` | Action +3 fields, ActionParameter +5 fields |
| `backend/app/models/config.py` | Connector +request_mapper/response_mapper |
| `backend/app/models/execution_log.py` | ExecutionLog +4 fields |
| `backend/app/models/__init__.py` | +Domain import |
| `backend/app/core/stream_engine.py` | +4 imports, +~110行 Domain双轨路由 |
