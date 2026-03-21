# Beaver-AI-Agent 2.0 Copilot 执行指南（终极版 v2）

> **版本**：2.0-final-v2
> **日期**：2026-03-21
> **变更**：去掉 Execution Dependency / 新增 Adapter 参数映射层 / 适配河狸云数据集查询协议
> **用途**：每个 Copilot 新会话的完整上下文

---

## 一、2.0 是什么

**beaver-ai-agent 2.0 = 面向企业复杂业务场景的 AI Runtime Kernel。**

### 系统中心迁移

```
V1 中心（要退出）            2.0 中心（要建立）
───────────────              ───────────────
Header Scope         →       Session / Scope Runtime
Skill / Intent 配置   →       Domain / Ontology Runtime
ContextManager 杂糅   →       Context Planner
ConnectorClient 直连  →       Action / Adapter Runtime（含参数映射层）
字符串拼接输出        →       Policy / Evidence / Response Runtime
普通日志             →       ExecutionLog / Discovery Runtime
```

### 正确主链

```
用户输入
→ Session Runtime（身份、作用域、headers）
→ Domain 识别 / 装载（Planner 第一步是确定 Domain，不是匹配 Skill）
→ Ontology Runtime（装载该 Domain 的 Entity / Action / Parameter）
→ Context Planner（参数缺口、消歧、执行计划、追问/确认）
→ Action Runtime → Adapter 参数映射 → 实际调用 → 响应映射
→ Policy / Evidence / Response Runtime
→ ExecutionLog / Discovery
```

---

## 二、设计原则

```
1. 打平配置：Parameter 是扁平 key-value 行，不是 JSON 嵌套
   Adapter 映射层负责把打平参数组装成宿主系统要求的格式

2. Domain 优先：运行时第一装载对象是 Domain，不是 Skill

3. Action 是执行契约：定义业务动作的输入输出、风险等级、确认策略

4. Adapter 是实现 + 映射：
   - 通用映射层：request_mapper + response_mapper
   - 默认实现：平进平出
   - 河狸云实现：打平参数 → filterModel/valueCols/sortModel 协议

5. 不做执行依赖硬编码：
   执行顺序通过参数依赖自然产生
   「关闭问题需要 issue_id」→ Planner 推断要先查询问题
   不在 Relation 层定义执行依赖

6. Relation 保持纯语义：只描述业务关系（包含/属于/关联）
   不承担运行时执行顺序的职责

7. 自发现服务于 Runtime：不反客为主，不自动上线

8. 先做样板域打穿，再扩域
```

---

## 三、数据库方案

### 3.1 保持不变的表（含 v6 扩展字段）

```
rc_ai_entity            — 含 generated_by, confidence, discovery_status, version
rc_ai_entity_property   — 含 semantic_role, enum_values, generated_by
rc_ai_entity_relation   — 含 relation_type, join_property, generated_by（纯语义关系）
rc_ai_action            — 含 action_type, requires_confirmation, risk_level, generated_by
rc_ai_action_parameter  — 含 default_value, enum_values, semantic_role, generated_by
rc_ai_adapter           — 含 adapter_type, base_url, db_config, openapi_url, status
rc_ai_skill             — 含 match_keywords, generated_by, discovery_status, test_cases
rc_ai_tool              — 含 generated_by
rc_ai_execution_log     — v6 新建，已有
```

### 3.2 新建 1 张表

```sql
CREATE TABLE IF NOT EXISTS rc_ai_domain (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    code VARCHAR(100) NOT NULL UNIQUE COMMENT '域编码（如 inspection, issue）',
    name VARCHAR(200) NOT NULL COMMENT '域名称（如 工序验收、问题整改）',
    description TEXT COMMENT '域描述（给 LLM 和 Planner 读的）',
    version INT DEFAULT 1 COMMENT '版本号',
    status ENUM('draft','reviewed','published','deprecated') DEFAULT 'draft' COMMENT '发布状态',
    generated_by ENUM('manual','llm','leiden','domain_auto') DEFAULT 'manual' COMMENT '来源',
    confidence DECIMAL(3,2) DEFAULT 1.00 COMMENT '置信度',
    default_risk_level ENUM('low','medium','high') DEFAULT 'low' COMMENT '域默认风险等级',
    requires_scope_check BOOLEAN DEFAULT TRUE COMMENT '是否强制 scope 校验',
    response_style ENUM('text','card','table','mixed') DEFAULT 'mixed' COMMENT '默认输出风格',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_status (status),
    INDEX idx_code (code)
) COMMENT='业务域（2.0 运行时第一装载对象）';
```

### 3.3 现有表增加字段

```sql
-- Entity 关联 Domain
ALTER TABLE rc_ai_entity
    ADD COLUMN IF NOT EXISTS domain_id BIGINT DEFAULT NULL COMMENT '所属 Domain',
    ADD INDEX idx_domain (domain_id);

-- Action 增加 domain_id + 证据定义 + 响应类型
ALTER TABLE rc_ai_action
    ADD COLUMN IF NOT EXISTS domain_id BIGINT DEFAULT NULL COMMENT '所属 Domain（冗余，方便查询）',
    ADD COLUMN IF NOT EXISTS evidence_schema JSON DEFAULT NULL
    COMMENT '证据项定义 [{"type":"source","label":"数据来源","field":"..."}]',
    ADD COLUMN IF NOT EXISTS response_type ENUM('text','table','card','confirm','mixed') DEFAULT 'text'
    COMMENT '默认输出形式';

-- ★ ActionParameter 增加映射相关字段 ★
ALTER TABLE rc_ai_action_parameter
    ADD COLUMN IF NOT EXISTS filter_type VARCHAR(50) DEFAULT NULL
    COMMENT '河狸云 filterType：String/Integer/Long/Decimal/Boolean/Date/Time/DateTime/set',
    ADD COLUMN IF NOT EXISTS filter_condition VARCHAR(50) DEFAULT NULL
    COMMENT '河狸云条件类型：equals/contains/greaterThan/lessThan/inRange 等',
    ADD COLUMN IF NOT EXISTS value_mode ENUM('filter','values','range','date_range') DEFAULT 'filter'
    COMMENT '值传递模式：单值filter/多值values/范围range/日期范围date_range',
    ADD COLUMN IF NOT EXISTS agg_func VARCHAR(50) DEFAULT NULL
    COMMENT '聚合函数：sum/count/distinctCount/avg/max/min/first/last/percent/formula（输出参数用）',
    ADD COLUMN IF NOT EXISTS sort_order ENUM('asc','desc') DEFAULT NULL
    COMMENT '排序方式（输出参数可用）';

-- Adapter 增加映射配置
ALTER TABLE rc_ai_adapter
    ADD COLUMN IF NOT EXISTS request_mapper VARCHAR(100) DEFAULT 'passthrough'
    COMMENT '请求映射器：passthrough(平进) / beaver_dataset(河狸云数据集协议)',
    ADD COLUMN IF NOT EXISTS response_mapper VARCHAR(100) DEFAULT 'passthrough'
    COMMENT '响应映射器：passthrough(平出) / beaver_dataset(河狸云响应提取)';

-- execution_log 增加 domain
ALTER TABLE rc_ai_execution_log
    ADD COLUMN IF NOT EXISTS domain_id BIGINT DEFAULT NULL COMMENT '命中的 Domain',
    ADD COLUMN IF NOT EXISTS param_gaps JSON DEFAULT NULL COMMENT '参数缺口（自发现用）',
    ADD COLUMN IF NOT EXISTS fallback_reason VARCHAR(500) DEFAULT NULL COMMENT 'fallback 原因',
    ADD COLUMN IF NOT EXISTS confirm_status ENUM('not_needed','pending','confirmed','cancelled') DEFAULT 'not_needed',
    ADD INDEX idx_domain (domain_id);
```

### 3.4 参数映射的核心设计说明

**打平参数表是对 Kernel 的契约，映射层是对宿主系统的适配。**

```
Kernel 看到的（打平）：
  rc_ai_action_parameter:
    name="project_id"   is_input=true   filter_type="Long"   filter_condition="equals"   value_mode="filter"
    name="status"        is_input=true   filter_type="set"    filter_condition=null        value_mode="values"
    name="start_date"    is_input=true   filter_type="Date"   filter_condition="inRange"   value_mode="date_range"
    name="keyword"       is_input=true   filter_type=null     (特殊参数，直接放 keyword 字段)
    name="limit"         is_input=true   filter_type=null     (特殊参数，直接放 limit 字段)
    name="total_amount"  is_output=true  agg_func="sum"
    name="issue_count"   is_output=true  agg_func="count"
    name="project_name"  is_output=true  agg_func=null        (无聚合 → 自动归入 rowGroupCols)

河狸云收到的（映射后）：
  {
    "datasetCode": "issue_list",
    "limit": 100,
    "keyword": "漏水",
    "filterModel": {
      "project_id": {"filterType": "Long", "type": "equals", "filter": 12345},
      "status":     {"filterType": "set", "values": [1, 2]},
      "start_date": {"filterType": "Date", "type": "inRange", "dateFrom": "2026-01-01", "dateTo": "2026-03-01"}
    },
    "valueCols": [
      {"field": "total_amount", "aggFunc": "sum"},
      {"field": "issue_count", "aggFunc": "count"},
      {"field": "project_name"}
    ],
    "rowGroupCols": [
      {"field": "project_name"}
    ],
    "sortModel": []
  }
```

**映射规则编码在 Adapter 代码里，不在数据库里。** Parameter 表的 `filter_type` / `filter_condition` / `value_mode` / `agg_func` 提供映射所需的元信息，Adapter 代码按这些元信息组装请求体。这保持了「打平配置、代码映射」的原则。

---

## 四、后端 Runtime 实现

### 4.1 Layer A：Session / Scope Runtime

（和之前版本一致，此处省略代码，参见 v6 执行指南的 SessionManager + TicketHandler）

Session Redis 结构：
```json
{
    "session_id": "uuid",
    "user_id": 12345,
    "user_name": "zhangsan",
    "display_name": "张三",
    "ou_name": "XX监理公司",
    "ou_type": 1,
    "headers": { "Authorization": "Bearer ...", "EnterpriseId": "e1", "MemberId": "m1" },
    "active_scope": {
        "enterprise_id": "e1",
        "member_id": "m1",
        "module": "inspection"
    },
    "runtime_state": {
        "current_domain": null,
        "pending_confirm": null,
        "conversation_context": []
    }
}
```

### 4.2 Layer B：Domain / Ontology Runtime

```python
# backend/app/runtime/domain_runtime.py

@dataclass
class DomainPack:
    """一个 Domain 的完整运行时数据包"""
    domain: Domain
    entities: list
    properties: list
    relations: list           # 纯语义关系，不含执行依赖
    actions: list
    parameters: list          # 含 filter_type / value_mode / agg_func 等映射元信息

    def get_actions_for_entity(self, entity_code: str) -> list:
        entity = next((e for e in self.entities if e.entity_code == entity_code), None)
        return [a for a in self.actions if a.entity_id == entity.id] if entity else []

    def get_input_params(self, action_id: int) -> list:
        return [p for p in self.parameters if p.action_id == action_id and p.is_input]

    def get_output_params(self, action_id: int) -> list:
        return [p for p in self.parameters if p.action_id == action_id and p.is_output]

class DomainRuntime:
    async def load_domain_pack(self, domain_code: str) -> DomainPack:
        domain = await Domain.get_by_code(domain_code)
        if not domain or domain.status != 'published':
            raise DomainNotAvailable(domain_code)

        entities = await Entity.filter(domain_id=domain.id)
        entity_ids = [e.id for e in entities]
        properties = await EntityProperty.filter(entity_id__in=entity_ids)
        relations = await EntityRelation.filter(entity_id__in=entity_ids)
        actions = await Action.filter(entity_id__in=entity_ids, discovery_status='published')
        parameters = await ActionParameter.filter(action_id__in=[a.id for a in actions])

        return DomainPack(
            domain=domain,
            entities=entities,
            properties=properties,
            relations=relations,
            actions=actions,
            parameters=parameters,
        )
```

### 4.3 Layer C：Context Planner

```python
# backend/app/runtime/context_planner.py

class ContextPlanner:
    """
    Planner 决定「做什么」，Runtime 决定「怎么做」
    执行顺序不靠 Dependency 硬编码，靠参数依赖自然推断
    """

    async def plan(self, user_input: str, session: dict) -> ExecutionPlan:
        # 1. 识别 Domain
        domain_code = await self._resolve_domain(user_input, session)
        domain_pack = await self.domain_runtime.load_domain_pack(domain_code)

        # 2. 在 Domain 范围内匹配 Action
        matched_action = await self._match_action(user_input, domain_pack)
        if not matched_action:
            return ExecutionPlan(plan_type='fallback', reason='no_action_matched')

        # 3. 计算参数缺口（通过参数依赖自然推断执行顺序）
        input_params = domain_pack.get_input_params(matched_action.id)
        filled, gaps = await self._fill_params(user_input, input_params, session, domain_pack)

        # 如果某个必填参数的值来自另一个 Action 的输出
        # Planner 可以生成多步执行计划（而不是靠 Execution Dependency 表）
        if gaps:
            # 检查是否有其他 Action 的输出可以填充这些缺口
            prereq_plan = await self._find_prereq_actions(gaps, domain_pack, session)
            if prereq_plan:
                return prereq_plan  # 多步执行计划
            else:
                return ExecutionPlan(plan_type='clarify', action=matched_action, param_gaps=gaps)

        # 4. 检查确认
        if matched_action.action_type == 'mutation' and matched_action.requires_confirmation:
            return ExecutionPlan(plan_type='confirm', action=matched_action, filled_params=filled)

        # 5. 执行
        return ExecutionPlan(plan_type='execute', action=matched_action, filled_params=filled)

    async def _find_prereq_actions(self, gaps, domain_pack, session):
        """
        通过参数依赖自动推断前置 Action
        例：关闭问题需要 issue_id → 查找哪个 Action 的输出包含 issue_id → 先执行那个
        """
        for gap in gaps:
            # 在同 Domain 的所有 Action 输出参数中查找能提供这个值的
            for action in domain_pack.actions:
                output_params = domain_pack.get_output_params(action.id)
                if any(p.name == gap.name or p.property_id == gap.property_id for p in output_params):
                    # 找到了一个前置 Action 可以提供缺失参数
                    return ExecutionPlan(
                        plan_type='multi_step',
                        steps=[
                            {'action': action, 'purpose': f'获取 {gap.name}'},
                            {'action': gap.original_action, 'purpose': '目标操作'},
                        ]
                    )
        return None
```

### 4.4 Layer D：Action / Adapter Runtime（核心重构）

#### 4.4.1 执行引擎

```python
# backend/app/runtime/action_runtime.py

@dataclass
class ActionRequest:
    action_code: str
    session_id: str
    active_scope: dict
    input_params: dict      # 打平的 key-value（Kernel 视角）
    execution_mode: str = 'normal'

@dataclass
class ActionResult:
    success: bool
    normalized_output: dict  # 打平的 key-value（Kernel 视角）
    raw_output: dict         # 原始返回（调试用）
    evidence: list
    confirm_required: bool = False
    error_code: str = None
    error_message: str = None
    latency_ms: int = 0

class ActionRuntime:
    def __init__(self, adapter_registry, session_manager, logger):
        self.adapters = adapter_registry
        self.sessions = session_manager
        self.logger = logger

    async def execute(self, request: ActionRequest) -> ActionResult:
        start = time.time()
        session = await self.sessions.get(request.session_id)
        action = await Action.get_by_code(request.action_code)
        adapter = await Adapter.get(action.adapter_id)
        input_params = await ActionParameter.filter(action_id=action.id, is_input=True)
        output_params = await ActionParameter.filter(action_id=action.id, is_output=True)

        try:
            impl = self.adapters.get(adapter.adapter_type)
            raw = await impl.execute(
                adapter=adapter,
                action=action,
                flat_params=request.input_params,
                input_param_defs=input_params,     # 含 filter_type / value_mode 等映射元信息
                output_param_defs=output_params,    # 含 agg_func 等映射元信息
                headers=session.get("headers", {}),
                scope=request.active_scope,
            )

            normalized = self._normalize_output(raw, output_params)
            evidence = self._build_evidence(action, normalized)

            result = ActionResult(
                success=True, normalized_output=normalized, raw_output=raw,
                evidence=evidence, latency_ms=int((time.time() - start) * 1000),
            )
        except Exception as e:
            result = ActionResult(
                success=False, normalized_output={}, raw_output={}, evidence=[],
                error_code=type(e).__name__, error_message=str(e),
                latency_ms=int((time.time() - start) * 1000),
            )

        await self.logger.log(request, result, session, action)
        return result
```

#### 4.4.2 WebApiAdapter（适配河狸云数据集查询协议）

```python
# backend/app/runtime/adapters/webapi_adapter.py

class WebApiAdapter:
    """
    WebAPI 适配器
    根据 adapter.request_mapper 选择映射策略：
      - passthrough: 平进平出（通用 REST）
      - beaver_dataset: 河狸云数据集查询协议
    """

    async def execute(self, adapter, action, flat_params, input_param_defs,
                      output_param_defs, headers, scope):
        mapper = self._get_mapper(adapter.request_mapper)
        request_body = mapper.map_request(flat_params, input_param_defs, output_param_defs, action)

        url = f"{adapter.base_url}{action.code}"
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(url, json=request_body, headers=headers)
            resp.raise_for_status()
            raw_response = resp.json()

        response_mapper = self._get_response_mapper(adapter.response_mapper)
        return response_mapper.map_response(raw_response, output_param_defs)

    def _get_mapper(self, mapper_type: str):
        return {
            'passthrough': PassthroughRequestMapper(),
            'beaver_dataset': BeaverDatasetRequestMapper(),
        }.get(mapper_type, PassthroughRequestMapper())

    def _get_response_mapper(self, mapper_type: str):
        return {
            'passthrough': PassthroughResponseMapper(),
            'beaver_dataset': BeaverDatasetResponseMapper(),
        }.get(mapper_type, PassthroughResponseMapper())


class PassthroughRequestMapper:
    """平进：打平参数直接作为请求体"""
    def map_request(self, flat_params, input_defs, output_defs, action):
        return flat_params


class BeaverDatasetRequestMapper:
    """
    河狸云数据集查询协议映射器
    把打平的 input/output 参数转换为 filterModel + valueCols + rowGroupCols + sortModel
    """
    def map_request(self, flat_params, input_defs, output_defs, action):
        body = {
            "datasetCode": action.code,  # action.code 存储 datasetCode
            "filterModel": {},
            "valueCols": [],
            "rowGroupCols": [],
            "sortModel": [],
        }

        # ========== 输入参数 → filterModel / keyword / limit ==========
        for p in input_defs:
            value = flat_params.get(p.name)
            if value is None and not p.is_required:
                continue

            # 特殊参数：keyword
            if p.name == 'keyword':
                body["keyword"] = value
                continue

            # 特殊参数：limit
            if p.name == 'limit':
                body["limit"] = int(value) if value else None
                continue

            # 常规参数 → filterModel
            if p.filter_type:
                filter_item = {"filterType": p.filter_type}

                if p.filter_condition:
                    filter_item["type"] = p.filter_condition

                if p.value_mode == 'filter':
                    # 单值模式
                    filter_item["filter"] = value
                elif p.value_mode == 'values':
                    # 多值模式（set）
                    filter_item["values"] = value if isinstance(value, list) else [value]
                elif p.value_mode == 'range':
                    # 范围模式
                    if isinstance(value, (list, tuple)) and len(value) == 2:
                        filter_item["filter"] = value[0]
                        filter_item["filterTo"] = value[1]
                    else:
                        filter_item["filter"] = value
                elif p.value_mode == 'date_range':
                    # 日期范围模式
                    if isinstance(value, (list, tuple)) and len(value) == 2:
                        filter_item["dateFrom"] = value[0]
                        filter_item["dateTo"] = value[1]
                    else:
                        filter_item["dateFrom"] = value

                body["filterModel"][p.name] = filter_item

        # ========== 输出参数 → valueCols + rowGroupCols + sortModel ==========
        has_agg = any(p.agg_func for p in output_defs)

        for p in output_defs:
            col = {"field": p.name}

            if p.agg_func:
                # 有聚合函数 → valueCols
                col["aggFunc"] = p.agg_func
                body["valueCols"].append(col)
            else:
                # 无聚合函数
                body["valueCols"].append(col)
                if has_agg:
                    # 其他输出参数有聚合 → 本参数自动归入 rowGroupCols
                    body["rowGroupCols"].append({"field": p.name})

            # 排序
            if p.sort_order:
                body["sortModel"].append({"colId": p.name, "sort": p.sort_order})

        return body


class PassthroughResponseMapper:
    """平出：原始响应直接返回"""
    def map_response(self, raw_response, output_defs):
        return raw_response


class BeaverDatasetResponseMapper:
    """河狸云数据集响应提取：从响应中提取打平的结果"""
    def map_response(self, raw_response, output_defs):
        # 河狸云数据集响应通常是 { "data": [...], "total": N } 结构
        # 提取并打平
        if isinstance(raw_response, dict):
            data = raw_response.get("data", raw_response)
            if isinstance(data, list):
                return data  # 列表结果
            return data
        return raw_response
```

#### 4.4.3 DatabaseAdapter

```python
# backend/app/runtime/adapters/database_adapter.py

class DatabaseAdapter:
    """数据库适配器：只读、参数化、限流"""

    async def execute(self, adapter, action, flat_params, input_param_defs,
                      output_param_defs, headers, scope):
        assert action.action_type == 'query', "DatabaseAdapter 只支持 query"

        db_config = adapter.db_config
        pool = await self._get_pool(db_config)

        # 输出字段
        select_fields = ", ".join([f"`{p.name}`" for p in output_param_defs]) or "*"

        # 输入参数 → WHERE
        where_parts, values = [], []
        for p in input_param_defs:
            val = flat_params.get(p.name)
            if val is not None:
                where_parts.append(f"`{p.name}` = %s")
                values.append(val)

        where_sql = " AND ".join(where_parts) if where_parts else "1=1"
        sql = f"SELECT {select_fields} FROM `{action.code}` WHERE {where_sql} LIMIT 100"

        async with pool.acquire() as conn:
            cursor = await conn.execute(sql, values)
            rows = await cursor.fetchall()
            columns = [desc[0] for desc in cursor.description]
            return [dict(zip(columns, row)) for row in rows]
```

### 4.5 Layer E：Response Runtime

```python
class ResponseRuntime:
    async def compose(self, plan, result=None):
        if plan.plan_type == 'clarify':
            return {
                "type": "clarify",
                "message": f"还需要：{', '.join(g.title or g.name for g in plan.param_gaps)}",
            }
        elif plan.plan_type == 'confirm':
            return {
                "type": "confirm",
                "action": plan.action.name,
                "risk_level": plan.action.risk_level,
                "params": plan.filled_params,
                "message": f"确认要执行「{plan.action.name}」吗？",
            }
        elif plan.plan_type == 'execute' and result:
            return {
                "type": plan.action.response_type or "text",
                "success": result.success,
                "data": result.normalized_output,
                "evidence": [vars(e) for e in result.evidence],
                "error": result.error_message if not result.success else None,
            }
        else:
            return {"type": "fallback", "message": "抱歉，我暂时无法处理这个请求。"}
```

---

## 五、参数映射配置示例

### 示例：查询某项目的问题列表

```
rc_ai_action:
  code = "issue_list"          # 对应 datasetCode
  entity_id = (问题 Entity)
  adapter_id = (河狸云 Adapter)
  action_type = "query"
  response_type = "table"

rc_ai_action_parameter (输入):
  name="project_id"   is_input=true  is_required=true   filter_type="Long"     filter_condition="equals"     value_mode="filter"
  name="status"        is_input=true  is_required=false  filter_type="set"      filter_condition=null          value_mode="values"
  name="start_date"    is_input=true  is_required=false  filter_type="Date"     filter_condition="inRange"     value_mode="date_range"
  name="keyword"       is_input=true  is_required=false  filter_type=null       (特殊参数)
  name="limit"         is_input=true  is_required=false  filter_type=null       default_value="100"

rc_ai_action_parameter (输出):
  name="issue_name"    is_output=true  agg_func=null
  name="project_name"  is_output=true  agg_func=null
  name="total_amount"  is_output=true  agg_func="sum"
  name="issue_count"   is_output=true  agg_func="count"
  name="create_time"   is_output=true  agg_func=null     sort_order="desc"

rc_ai_adapter:
  adapter_type = "webapi"
  base_url = "https://beaver.ricent.com"
  request_mapper = "beaver_dataset"
  response_mapper = "beaver_dataset"
```

Kernel 调用时传入打平参数：
```python
flat_params = {
    "project_id": 12345,
    "status": [1, 2],
    "keyword": "漏水",
}
```

BeaverDatasetRequestMapper 自动组装为：
```json
{
    "datasetCode": "issue_list",
    "keyword": "漏水",
    "filterModel": {
        "project_id": {"filterType": "Long", "type": "equals", "filter": 12345},
        "status": {"filterType": "set", "values": [1, 2]}
    },
    "valueCols": [
        {"field": "issue_name"},
        {"field": "project_name"},
        {"field": "total_amount", "aggFunc": "sum"},
        {"field": "issue_count", "aggFunc": "count"},
        {"field": "create_time"}
    ],
    "rowGroupCols": [
        {"field": "issue_name"},
        {"field": "project_name"},
        {"field": "create_time"}
    ],
    "sortModel": [
        {"colId": "create_time", "sort": "desc"}
    ]
}
```

---

## 六、自发现引擎

### 三层策略（和之前一致）

```
第一层：统计发现 — 从 execution_log 挖掘高频缺口/fallback/共现
第二层：图聚类发现 — Leiden 算法划分 Domain 候选
第三层：LLM 草稿生成 — 命名 + 描述 + Parameter 推导
```

选 Leiden 不选 Louvain。所有生成标记 draft，必须人工审核。

---

## 七、前端 2.0 信息架构

```
├── Session / Scope            ← 会话状态、作用域
├── Domain / Ontology Studio   ← Domain 列表、Entity/Property、关系图、发布管理
├── Action / Adapter Studio    ← Action 列表、参数配置（含映射元信息）、Adapter 绑定
├── Policy / Evidence          ← 策略规则、证据模板
├── Execution / Discovery      ← 执行轨迹、命中率、参数缺口
└── Review Studio              ← draft 审核发布
```

### Action 参数配置页的关键变化

参数配置页需要展示和编辑映射元信息：

```
每个输入参数行：
  [name] [type] [is_required] [default_value]
  [filter_type ▼] [filter_condition ▼] [value_mode ▼]    ← 2.0 新增

每个输出参数行：
  [name] [type]
  [agg_func ▼] [sort_order ▼]                             ← 2.0 新增
```

其中 `filter_type` / `filter_condition` / `value_mode` / `agg_func` 是 Select 下拉，选项从河狸云协议定义中枚举。对于非河狸云的 Adapter（request_mapper=passthrough），这些字段可以留空。

---

## 八、分阶段实施

```
Phase 1（第1-3周）Runtime 基线重构
  □ 新建 rc_ai_domain 表
  □ 现有表增加字段（domain_id / filter_type / value_mode / agg_func / request_mapper 等）
  □ DomainRuntime.load_domain_pack()
  □ ContextPlanner.plan()（含参数依赖推断，不靠 Execution Dependency）
  □ ActionRuntime.execute()
  □ WebApiAdapter + BeaverDatasetRequestMapper/ResponseMapper
  □ DatabaseAdapter
  □ ResponseRuntime.compose()
  □ ExecutionLog 全链路嵌入

Phase 2（第4-5周）样板域打穿
  □ Domain: inspection（工序验收）+ issue（问题整改）
  □ 完整 Entity/Property/Action/Parameter 配置（含映射元信息）
  □ 多轮 + 追问 + 确认 + 证据输出

Phase 3（第6-8周）前端平台升级
  □ Domain Studio + Action 参数配置（含映射字段）
  □ LogsPage 重构
  □ Chat Session 保护

Phase 4（第9-10周）自发现接入
  □ Leiden 聚类 + 统计发现 + Review Studio

Phase 5（第11周+）扩域 + 小模型
```

---

## 九、关键坚持点

```
1.  Domain 是 Runtime 第一装载对象，不是 Skill
2.  不做执行依赖硬编码，通过参数依赖自然推断
3.  打平参数是 Kernel 契约，映射层是 Adapter 适配
4.  河狸云协议（filterModel/valueCols）的映射信息存在 Parameter 字段里，映射代码在 Adapter 里
5.  ConnectorClient 降级为 WebApiAdapter
6.  Adapter 默认 passthrough，河狸云用 beaver_dataset mapper
7.  所有自动生成走审核发布
8.  execution_log 是优化中枢
9.  Leiden 不选 Louvain
10. 先做样板域打穿，再扩域
```

---

> 放入 `docs/toAI/07-2.0-Copilot执行指南-终极版v2.md`
