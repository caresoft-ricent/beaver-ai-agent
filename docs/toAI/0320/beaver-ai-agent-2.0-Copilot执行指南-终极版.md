# Beaver-AI-Agent 2.0 Copilot 执行指南（终极版）

> **版本**：2.0-final
> **日期**：2026-03-20
> **定位**：以终为始，不兼容 V1，直接实现终极形态
> **保留原则**：打平参数、结构化配置、不走大 JSON 胶水路线
> **用途**：每个 Copilot 新会话的完整上下文

---

## 一、2.0 是什么

### 一句话

**beaver-ai-agent 2.0 = 面向企业复杂业务场景的 AI Runtime Kernel。**

不是聊天页后端，不是 Skill/Tool 配置平台升级，不是 Prompt 包装层。

### 系统中心迁移

2.0 的本质不是多几个模块，而是系统中心迁移：

```
V1 中心（要退出）            2.0 中心（要建立）
───────────────              ───────────────
Header Scope         →       Session / Scope Runtime
Skill / Intent 配置   →       Domain / Ontology Runtime
ContextManager 杂糅   →       Context Planner
ConnectorClient 直连  →       Action / Adapter Runtime
字符串拼接输出        →       Policy / Evidence / Response Runtime
普通日志             →       ExecutionLog / Discovery Runtime
```

### 正确主链

```
用户输入
→ Session Runtime（身份、作用域、模块上下文）
→ Domain 识别 / 装载（Planner 第一步是确定 Domain，不是匹配 Skill）
→ Ontology Runtime（装载该 Domain 的 Entity / Action / Dependency）
→ Context Planner（参数缺口、消歧、执行计划、追问/确认）
→ Action Runtime（ActionRequest → Adapter 执行 → ActionResult）
→ Policy / Evidence / Response Runtime（权限检查 + 证据收集 + 统一响应）
→ ExecutionLog / Discovery（全链路记录 + 反馈闭环）
```

---

## 二、设计原则

```
1. 打平配置：Parameter / Property / Dependency / Policy 全部结构化存储
   不用大 JSON schema 或自由文本拼接承载核心契约

2. Domain 优先：运行时第一装载对象是 Domain，不是 Skill
   Domain = 可装载的业务语义包（deployable semantic package）

3. Action 是执行契约：不是 Tool 的别名
   Action 定义业务动作的输入输出、风险等级、确认策略、证据要求

4. Adapter 是实现：WebAPI / Database / MCP 只是动作实现方式
   ConnectorClient 降级为 WebApiAdapter 的一种实现

5. Relation 分两类：
   Semantic Relation — 业务世界（包含/属于/关联），不要求 DAG
   Execution Dependency — 运行时（前置条件/参数依赖），必须 DAG

6. 自发现服务于 Runtime：不反客为主，不自动上线，不替代人工审核
   统计发现 → 图聚类候选 → LLM 草稿 → 人工审核发布

7. 身份河狸云驱动：AI 侧只存储和传递 UserSessionVo + headers

8. 先做样板域打穿，再扩域：不全域同时起跑
```

---

## 三、数据库方案

### 3.1 保持不变的表（含 v6 扩展字段）

```
rc_ai_entity            — 含 generated_by, confidence, discovery_status, version
rc_ai_entity_property   — 含 semantic_role, enum_values, generated_by
rc_ai_entity_relation   — 含 relation_type, join_property, generated_by
rc_ai_action            — 含 action_type, requires_confirmation, risk_level, generated_by
rc_ai_action_parameter  — 含 default_value, enum_values, semantic_role, generated_by
rc_ai_adapter           — 含 adapter_type, base_url, db_config, openapi_url, status
rc_ai_skill             — 含 match_keywords, generated_by, discovery_status, test_cases
rc_ai_tool              — 含 generated_by
rc_ai_execution_log     — v6 新建，已有
```

### 3.2 新建 1 张表

```sql
-- ================================================================
-- rc_ai_domain — Domain 是 2.0 的核心新增概念
-- 不新建 DomainEntityBinding 等附属表，用 entity.domain_id FK 替代
-- ================================================================
CREATE TABLE IF NOT EXISTS rc_ai_domain (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    code VARCHAR(100) NOT NULL UNIQUE COMMENT '域编码（如 inspection, issue）',
    name VARCHAR(200) NOT NULL COMMENT '域名称（如 工序验收、问题整改）',
    description TEXT COMMENT '域描述（给 LLM 和 Planner 读的）',
    version INT DEFAULT 1 COMMENT '版本号',
    status ENUM('draft','reviewed','published','deprecated') DEFAULT 'draft' COMMENT '发布状态',
    generated_by ENUM('manual','llm','leiden','domain_auto') DEFAULT 'manual' COMMENT '来源',
    confidence DECIMAL(3,2) DEFAULT 1.00 COMMENT '置信度',
    -- 域级配置（打平字段，不是大 JSON）
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

-- Relation 区分语义关系 vs 执行依赖
ALTER TABLE rc_ai_entity_relation
    ADD COLUMN IF NOT EXISTS dependency_type ENUM('semantic','execution') DEFAULT 'semantic'
    COMMENT 'semantic=业务关系(允许环) / execution=执行依赖(必须DAG)';

-- Action 增加证据和响应定义
ALTER TABLE rc_ai_action
    ADD COLUMN IF NOT EXISTS domain_id BIGINT DEFAULT NULL COMMENT '所属 Domain（冗余，方便查询）',
    ADD COLUMN IF NOT EXISTS evidence_schema JSON DEFAULT NULL
    COMMENT '证据项定义 [{"type":"source","label":"数据来源"},{"type":"key_field","label":"关键字段"}]',
    ADD COLUMN IF NOT EXISTS response_type ENUM('text','table','card','confirm','mixed') DEFAULT 'text'
    COMMENT '默认输出形式';

-- execution_log 增加 domain 和更完整的上下文
ALTER TABLE rc_ai_execution_log
    ADD COLUMN IF NOT EXISTS domain_id BIGINT DEFAULT NULL COMMENT '命中的 Domain',
    ADD COLUMN IF NOT EXISTS param_gaps JSON DEFAULT NULL COMMENT '参数缺口（自发现用）',
    ADD COLUMN IF NOT EXISTS fallback_reason VARCHAR(500) DEFAULT NULL COMMENT 'fallback 原因（自发现用）',
    ADD COLUMN IF NOT EXISTS confirm_status ENUM('not_needed','pending','confirmed','cancelled') DEFAULT 'not_needed'
    COMMENT '确认态',
    ADD INDEX idx_domain (domain_id);
```

### 3.4 不新建的表（避免过度设计）

```
✗ DomainVersion         → 用 domain 表的 version + status 字段
✗ DomainEntityBinding   → 用 entity.domain_id FK
✗ DomainActionBinding   → action 通过 entity.domain_id 自动关联
✗ DomainPolicyBinding   → action 级别的 risk_level + requires_confirmation + domain 级别的 default
✗ DomainResponseTemplate → action 级别的 response_type + evidence_schema
✗ ExecutionDependency 独立表 → 用 entity_relation.dependency_type='execution' 区分
✗ ActionBinding         → action.adapter_id 已有
✗ AdapterBinding        → adapter 表已有 adapter_type + base_url + db_config
```

**设计哲学：用字段区分，不用新表。将来真的需要独立管理时再拆。**

---

## 四、后端 Runtime 实现

### 4.1 Layer A：Session / Scope Runtime

已有 v6 的 `session/session_manager.py` + `session/ticket_handler.py`。2.0 升级点：

```python
# Session 数据结构升级（Redis JSON）
{
    "session_id": "uuid",
    "user_id": 12345,
    "user_name": "zhangsan",
    "display_name": "张三",
    "ou_name": "XX监理公司",
    "ou_type": 1,
    "headers": { ... },
    # 2.0 新增
    "active_scope": {                    # 当前生效的作用域
        "enterprise_id": "e1",           # 从 headers.EnterpriseId 提取
        "member_id": "m1",               # 从 headers.MemberId 提取
        "module": "inspection"           # 当前模块（由河狸云跳转时携带或后续切换）
    },
    "runtime_state": {                   # Planner 需要的运行时状态
        "current_domain": null,          # 当前 Domain code
        "pending_confirm": null,         # 待确认的 ActionRequest
        "conversation_context": []       # 多轮上下文摘要
    }
}
```

**API 升级**：

```python
# 保持 /go + /refresh 不变

# 新增
GET  /api/session/current            → 返回 Session 信息（不含 headers 敏感信息）
POST /api/session/activate-scope     → 切换 active_scope（河狸云驱动）
POST /api/session/update-state       → 更新 runtime_state（Planner 内部用）
```

**验收标准**：
- 不同 scope 下同一句话行为不同
- Session 过期优雅处理
- Chat 页面可读取 session 状态

### 4.2 Layer B：Domain / Ontology Runtime

```python
# backend/app/runtime/domain_runtime.py

class DomainRuntime:
    """Domain 装载器：按 Domain 一次性加载全部运行时对象"""

    async def load_domain_pack(self, domain_code: str) -> DomainPack:
        """
        装载一个 Domain 的完整运行时包
        这是 2.0 的核心操作——Planner 确定 Domain 后第一件事就是调这个
        """
        domain = await Domain.get_by_code(domain_code)
        if not domain or domain.status != 'published':
            raise DomainNotAvailable(domain_code)

        # 一次查询加载该 Domain 下的全部对象
        entities = await Entity.filter(domain_id=domain.id)
        entity_ids = [e.id for e in entities]

        properties = await EntityProperty.filter(entity_id__in=entity_ids)
        relations = await EntityRelation.filter(entity_id__in=entity_ids)
        actions = await Action.filter(entity_id__in=entity_ids, discovery_status='published')
        parameters = await ActionParameter.filter(action_id__in=[a.id for a in actions])

        # 分离两类关系
        semantic_relations = [r for r in relations if r.dependency_type == 'semantic']
        execution_deps = [r for r in relations if r.dependency_type == 'execution']

        return DomainPack(
            domain=domain,
            entities=entities,
            properties=properties,
            semantic_relations=semantic_relations,
            execution_dependencies=execution_deps,
            actions=actions,
            parameters=parameters,
        )

@dataclass
class DomainPack:
    """一个 Domain 的完整运行时数据包"""
    domain: Domain
    entities: list
    properties: list
    semantic_relations: list
    execution_dependencies: list  # DAG，用于执行规划
    actions: list
    parameters: list

    def get_actions_for_entity(self, entity_code: str) -> list:
        entity = next((e for e in self.entities if e.entity_code == entity_code), None)
        return [a for a in self.actions if a.entity_id == entity.id] if entity else []

    def get_action_params(self, action_id: int, is_input: bool = True) -> list:
        return [p for p in self.parameters if p.action_id == action_id and p.is_input == is_input]
```

### 4.3 Layer C：Context Planner

```python
# backend/app/runtime/context_planner.py

class ContextPlanner:
    """
    2.0 的执行规划器
    职责：Domain识别 → 装载 → 参数缺口 → 消歧 → 执行计划
    Planner 决定「做什么」，Runtime 决定「怎么做」
    """

    async def plan(self, user_input: str, session: dict) -> ExecutionPlan:
        # 1. 识别 Domain（优先从 session.runtime_state.current_domain 恢复）
        domain_code = await self._resolve_domain(user_input, session)

        # 2. 装载 Domain Pack
        domain_pack = await self.domain_runtime.load_domain_pack(domain_code)

        # 3. 识别意图（在 Domain 范围内匹配 Action，大幅缩小搜索空间）
        matched_action = await self._match_action(user_input, domain_pack)

        if not matched_action:
            return ExecutionPlan(plan_type='fallback', reason='no_action_matched')

        # 4. 计算参数缺口
        required_params = domain_pack.get_action_params(matched_action.id, is_input=True)
        filled_params, gaps = await self._fill_params(user_input, required_params, session)

        if gaps:
            return ExecutionPlan(
                plan_type='clarify',
                action=matched_action,
                filled_params=filled_params,
                param_gaps=gaps,
            )

        # 5. 检查是否需要确认（mutation 类 + requires_confirmation）
        if matched_action.action_type == 'mutation' and matched_action.requires_confirmation:
            return ExecutionPlan(
                plan_type='confirm',
                action=matched_action,
                filled_params=filled_params,
            )

        # 6. 生成执行计划
        return ExecutionPlan(
            plan_type='execute',
            action=matched_action,
            filled_params=filled_params,
            domain_pack=domain_pack,
        )

    async def _resolve_domain(self, user_input: str, session: dict) -> str:
        """
        Domain 识别策略（按优先级）：
        1. session.runtime_state.current_domain 非空 → 沿用（多轮延续）
        2. session.active_scope.module 非空 → 映射到 Domain
        3. LLM 从所有 published Domain 的 description 中选择
        """
        state = session.get("runtime_state", {})
        if state.get("current_domain"):
            return state["current_domain"]

        scope = session.get("active_scope", {})
        if scope.get("module"):
            domain = await Domain.get_by_module(scope["module"])
            if domain:
                return domain.code

        # LLM 选择
        domains = await Domain.filter(status='published')
        return await self._llm_classify_domain(user_input, domains)
```

### 4.4 Layer D：Action / Adapter Runtime

```python
# backend/app/runtime/action_runtime.py

@dataclass
class ActionRequest:
    action_code: str
    session_id: str
    active_scope: dict
    input_params: dict          # 打平的 key-value
    execution_mode: str = 'normal'  # normal / dry_run / retry

@dataclass
class ActionResult:
    success: bool
    normalized_output: dict     # 打平的 key-value
    evidence: list              # [EvidenceItem]
    confirm_required: bool = False
    error_code: str = None
    error_message: str = None
    latency_ms: int = 0

@dataclass
class EvidenceItem:
    evidence_type: str          # source / key_field / trace / explanation
    label: str                  # 显示标签
    value: str                  # 值
    trace_ref: str = None       # 追溯引用

class ActionRuntime:
    """统一执行引擎"""

    def __init__(self, adapter_registry: AdapterRegistry, session_manager, execution_logger):
        self.adapters = adapter_registry
        self.sessions = session_manager
        self.logger = execution_logger

    async def execute(self, request: ActionRequest) -> ActionResult:
        start = time.time()
        session = await self.sessions.get(request.session_id)
        action = await Action.get_by_code(request.action_code)
        adapter = await Adapter.get(action.adapter_id)

        try:
            # 1. 选择 Adapter 实现
            impl = self.adapters.get(adapter.adapter_type)

            # 2. 执行（session.headers 自动注入）
            raw_result = await impl.execute(
                adapter=adapter,
                action=action,
                params=request.input_params,
                headers=session.get("headers", {}),
                scope=request.active_scope,
            )

            # 3. 打平输出
            output_params = await ActionParameter.filter(action_id=action.id, is_output=True)
            normalized = self._normalize_output(raw_result, output_params)

            # 4. 生成证据项
            evidence = self._build_evidence(action, request, normalized)

            result = ActionResult(
                success=True,
                normalized_output=normalized,
                evidence=evidence,
                latency_ms=int((time.time() - start) * 1000),
            )
        except Exception as e:
            result = ActionResult(
                success=False,
                normalized_output={},
                evidence=[],
                error_code=type(e).__name__,
                error_message=str(e),
                latency_ms=int((time.time() - start) * 1000),
            )

        # 5. 写 execution_log（异步，不阻塞）
        await self.logger.log(request, result, session, action)
        return result

    def _normalize_output(self, raw: dict, output_params: list) -> dict:
        """把 API/DB 原始返回打平为 output parameter 定义的 key-value"""
        normalized = {}
        for p in output_params:
            normalized[p.name] = raw.get(p.name, raw.get(p.title, None))
        return normalized

    def _build_evidence(self, action, request, output) -> list:
        """从 action.evidence_schema 生成证据项"""
        if not action.evidence_schema:
            return []
        items = []
        for schema in action.evidence_schema:
            items.append(EvidenceItem(
                evidence_type=schema.get("type", "source"),
                label=schema.get("label", ""),
                value=str(output.get(schema.get("field", ""), "")),
            ))
        return items
```

### 4.5 Adapter 实现

```python
# backend/app/runtime/adapters/

class AdapterRegistry:
    def __init__(self):
        self._adapters = {
            'webapi': WebApiAdapter(),
            'database': DatabaseAdapter(),
        }
    def get(self, adapter_type: str):
        return self._adapters[adapter_type]

class WebApiAdapter:
    """WebAPI 适配器：替代现有 ConnectorClient"""

    async def execute(self, adapter, action, params, headers, scope):
        url = f"{adapter.base_url}{action.code}"  # action.code 含路径如 /api/issues
        async with httpx.AsyncClient(timeout=30) as client:
            if action.action_type == 'query':
                resp = await client.get(url, params=params, headers=headers)
            else:
                resp = await client.request(
                    method='POST', url=url, json=params, headers=headers
                )
            resp.raise_for_status()
            return resp.json()

class DatabaseAdapter:
    """数据库适配器：只读、参数化、限流"""

    async def execute(self, adapter, action, params, headers, scope):
        db_config = adapter.db_config
        # action.code 存储 SQL 模板名或表名
        # input params 转为 WHERE 条件

        # 安全约束
        assert action.action_type == 'query', "DatabaseAdapter 只支持 query"

        pool = await self._get_pool(db_config)
        async with pool.acquire() as conn:
            # 参数化查询（防注入）
            where_clauses = []
            values = []
            for key, val in params.items():
                where_clauses.append(f"`{key}` = %s")
                values.append(val)

            where_sql = " AND ".join(where_clauses) if where_clauses else "1=1"
            sql = f"SELECT * FROM `{action.code}` WHERE {where_sql} LIMIT 100"

            cursor = await conn.execute(sql, values)
            rows = await cursor.fetchall()
            columns = [desc[0] for desc in cursor.description]
            return [dict(zip(columns, row)) for row in rows]
```

### 4.6 Layer E：Response Runtime

```python
# backend/app/runtime/response_runtime.py

class ResponseRuntime:
    """统一响应装配器"""

    async def compose(self, plan: ExecutionPlan, result: ActionResult = None) -> dict:
        if plan.plan_type == 'clarify':
            return self._compose_clarify(plan)
        elif plan.plan_type == 'confirm':
            return self._compose_confirm(plan)
        elif plan.plan_type == 'execute' and result:
            return self._compose_result(plan, result)
        elif plan.plan_type == 'fallback':
            return self._compose_fallback(plan)

    def _compose_result(self, plan, result):
        response_type = plan.action.response_type or 'text'
        return {
            "type": response_type,
            "success": result.success,
            "data": result.normalized_output,
            "evidence": [vars(e) for e in result.evidence],
            "error": result.error_message if not result.success else None,
        }

    def _compose_confirm(self, plan):
        return {
            "type": "confirm",
            "action": plan.action.name,
            "risk_level": plan.action.risk_level,
            "params": plan.filled_params,
            "message": f"确认要执行「{plan.action.name}」吗？",
        }

    def _compose_clarify(self, plan):
        return {
            "type": "clarify",
            "action": plan.action.name,
            "missing_params": [g.name for g in plan.param_gaps],
            "message": f"还需要以下信息：{', '.join(g.title or g.name for g in plan.param_gaps)}",
        }
```

---

## 五、自发现引擎

### 5.1 三层自发现

```
第一层：统计发现（基于 execution_log，不需要算法）
  - 高频参数缺口 → 建议补 default_value 或调整 is_required
  - 高频 fallback → 建议新增 Action 或调整 Domain 描述
  - 高频动作串联 → 建议新增 Execution Dependency
  - 高频共现实体 → 建议调整 Domain 边界

第二层：图聚类发现（Leiden 算法）
  - 构建 Entity/Action 加权共现图
  - 运行 Leiden → 输出 Domain 候选分组
  - 全部标记为 generated_by='leiden', status='draft'

第三层：LLM 草稿生成
  - 聚类结果 → LLM 命名和描述
  - OpenAPI 文档 → LLM 推导 Entity/Action/Parameter 草案
  - 全部标记为 generated_by='llm', status='draft'
```

### 5.2 算法选型：Leiden（不选 Louvain）

```python
# pip install leidenalg igraph

import igraph as ig
import leidenalg

async def discover_domains():
    """
    从 Entity Relation 图中自动发现 Domain 候选
    使用 Leiden 算法（不用 Louvain——Louvain 最多25%的社区连接不良）
    """
    entities = await Entity.filter(discovery_status='published')
    relations = await EntityRelation.filter(dependency_type='semantic')

    if len(entities) < 10 or len(relations) < 15:
        return {"message": "实体或关系数量不足，建议手动指定 Domain"}

    # 构建无向图
    g = ig.Graph()
    id_map = {e.id: idx for idx, e in enumerate(entities)}
    g.add_vertices(len(entities))

    edges, weights = [], []
    for r in relations:
        if r.entity_id in id_map and r.ref_entity_id in id_map:
            edges.append((id_map[r.entity_id], id_map[r.ref_entity_id]))
            weights.append(1.0)  # 将来可加权：共现频次、execution_log 共现等
    g.add_edges(edges)
    g.es['weight'] = weights

    # Leiden 算法
    partition = leidenalg.find_partition(
        g,
        leidenalg.ModularityVertexPartition,
        weights=weights,
    )

    # 生成 Domain 候选
    candidates = []
    for idx, community in enumerate(partition):
        domain_entities = [entities[v] for v in community]
        candidates.append({
            "domain_code": f"domain_{idx}",
            "entity_codes": [e.entity_code for e in domain_entities],
            "entity_names": [e.entity_name for e in domain_entities],
            "size": len(community),
        })

    return candidates  # 返回预览，不直接写入 DB
```

### 5.3 自发现 API

```python
# 管理后台 API（admin 权限）
POST /api/admin/discovery/domains          → 运行 Leiden，返回候选预览
POST /api/admin/discovery/domains/apply    → 确认后写入 entity.domain_id
POST /api/admin/discovery/generate-skills  → 基于 Domain 自动生成 Skill/Tool（draft）
POST /api/admin/discovery/stats            → 从 execution_log 统计高频缺口/fallback
POST /api/admin/review/approve             → 审核通过（draft → published）
POST /api/admin/review/reject              → 审核拒绝
POST /api/admin/review/batch               → 批量审核
```

---

## 六、.env 配置

```env
# 保持 v6 的全部配置不变
APP_SECRET=Ricent2026
APP_RETRIEVE_URL=https://beaver.ricent.com/api/v6/basic/session/retrieve

# 2.0 新增（可选）
DOMAIN_AUTO_DISCOVER_MIN_ENTITIES=10
DOMAIN_AUTO_DISCOVER_MIN_RELATIONS=15
```

---

## 七、前端 2.0 信息架构

### 旧心智（V1，要退出）

```
├── Connectors（连接器）
├── LLM Config（大模型配置）
├── Entities（本体配置）
├── Skills（技能配置）
├── Intents（意图配置）
└── Logs（日志）
```

### 新心智（2.0 终态）

```
├── Session / Scope            ← 当前会话状态、作用域、会话诊断
├── Domain / Ontology Studio   ← Domain 列表、Entity/Property、关系图、依赖图、发布管理
├── Action / Adapter Studio    ← Action 列表、参数配置、风险等级、Adapter 绑定
├── Policy / Evidence          ← 策略规则、证据模板、响应模板
├── Execution / Discovery      ← 执行轨迹、命中率、参数缺口、Domain 候选
└── Review Studio              ← 所有 draft 项的审核发布
```

### 页面映射

```
现有页面 → 2.0 归属                    改动量
───────────────────────────────────────────
Login.tsx              → 保持不变         无
Dashboard.tsx          → 保持不变         无
EntityList.tsx         → Domain/Ontology  大改（加 Domain 维度 + v6 字段）
ConnectorList.tsx      → Action/Adapter   中改（adapter_type 切换 + DB 配置）
SkillList.tsx          → 降级为辅助页     小改（标记为 Domain 派生层）
LLMConfigList.tsx      → 保持不变         无
NormalizationPage.tsx  → 保持不变         无
WorkflowPage.tsx       → 保持不变         无
TenantList.tsx         → 保持不变         无
LogsPage.tsx           → Execution        大改（对接 execution_log + 分析维度）
ChatPage.tsx           → 加 Session 校验  小改
ChatEmbed.tsx          → 加 Session 校验  小改
ChatApp.tsx            → 加 Session 校验  小改

新建页面：
DiscoveryPage.tsx      → Execution/Discovery（Leiden + 统计 + DAG 可视化）
ReviewStudioPage.tsx   → Review Studio（draft 审核发布）
DomainStudioPage.tsx   → Domain/Ontology（Domain 管理 + 关系图）
```

---

## 八、分阶段实施

### Phase 1：Runtime 基线重构（第1-3周）

```
后端先行，跑通完整 Runtime 主链

□ 新建 rc_ai_domain 表
□ Entity/Action/execution_log 增加字段
□ 实现 DomainRuntime.load_domain_pack()
□ 实现 ContextPlanner.plan()
□ 实现 ActionRuntime.execute()（WebApiAdapter + DatabaseAdapter）
□ 实现 ResponseRuntime.compose()
□ Session 升级（active_scope + runtime_state）
□ ExecutionLog 全链路嵌入（含 param_gaps / fallback_reason / confirm_status）
□ ConnectorClient 降级为 WebApiAdapter 实现

验收标准：
  给定一个手动配置的 Domain + Entity + Action，
  从 /chat 发一句话，经过完整主链，返回统一响应对象 + 写入 execution_log
```

### Phase 2：样板域打穿（第4-5周）

```
在「工序验收 + 问题整改」上跑通完整 2.0 闭环

□ 创建 Domain: inspection（工序验收）
□ 创建 Domain: issue（问题整改）
□ 配置完整 Entity/Property/Relation/Action/Parameter
□ 配置 Execution Dependency（先查验收 → 再发起整改 → 再查整改状态）
□ 配置 evidence_schema
□ 多轮对话不漂
□ 参数不足时追问
□ 写操作前确认
□ 输出带证据摘要

验收标准：
  1. 不同角色下同一问法结果不同但合理
  2. 参数不足 → 追问 → 补齐 → 执行
  3. 写操作 → 确认 → 执行
  4. execution_log 完整复盘整条链
```

### Phase 3：前端平台升级（第6-8周）

```
□ DomainStudioPage 新建（Domain 管理 + Entity 关联）
□ EntityList 升级（Domain 维度 + v6 全部字段）
□ ConnectorList 升级（adapter_type 切换 + DB 配置 + 连接测试）
□ LogsPage 重构（execution_log + 分析维度）
□ Chat 页面 Session 校验 + 用户信息展示
□ 通用组件：GeneratedByBadge / DiscoveryStatusTag / SemanticRoleSelect
□ DAG 可视化组件（D3.js force-directed graph）

验收标准：
  管理员可以在后台完整配置一个 Domain 的全部对象，
  配完后从 Chat 页面端到端验证
```

### Phase 4：自发现接入（第9-10周）

```
□ 统计发现 API（高频缺口 / fallback / 共现）
□ Leiden 聚类 API
□ LLM 草稿生成
□ DiscoveryPage 新建
□ ReviewStudioPage 新建
□ 审核发布流转

验收标准：
  积累 200+ 条 execution_log 后，自发现可以输出有意义的 Domain 候选和优化建议
```

### Phase 5：扩域与稳定化（第11-12周+）

```
□ 复制到更多业务域
□ OpenAPI 自动推导
□ 小模型训练数据导出（JSONL）
□ 意图识别微调实验（Qwen2.5-7B + LoRA）
□ 性能优化
□ 文档完善
```

---

## 九、Java 团队配合点

| 编号 | 任务 | 时间 | 说明 |
|------|------|------|------|
| J1 | 确认 retrieve 返回 UserSessionVo 格式 | Phase 1 | 含 headers |
| J2 | 实现 /refresh 回调 | Phase 1 | 身份切换 + 退出 |
| J3 | 首批接口规格（工序验收 + 问题整改） | Phase 2 | 样板域需要 |
| J4 | OpenAPI 文档标准化 | Phase 5 | 自动推导需要 |

---

## 十、技术选型

| 组件 | 选型 | 理由 |
|------|------|------|
| Domain 发现 | Leiden (leidenalg + igraph) | 社区保证连通，比 Louvain 稳定 |
| DAG 可视化 | D3.js force-directed | 前端原生，交互性好 |
| OpenAPI 解析 | LLM few-shot | F1>92%，不需训练 |
| 小模型基座 | Qwen2.5-7B | 中文好，7B 推理成本低 |
| 小模型训练 | SFTTrainer + LoRA | 200 条标注即可起步 |

---

## 十一、关键坚持点

```
1.  Domain 是 Runtime 第一装载对象，不是 Skill
2.  ConnectorClient 必须降级为 WebApiAdapter
3.  Planner 第一步是识别 Domain，不是匹配 Skill
4.  Relation 分 semantic + execution 两类
5.  打平参数：Parameter 表 is_input/is_output，不用 JSON 嵌套
6.  所有自动生成必须走审核发布（draft → reviewed → published）
7.  execution_log 是优化中枢，不是普通日志
8.  先做样板域打穿，再扩域
9.  Leiden 不选 Louvain
10. 输出是统一响应对象，不是字符串拼接
```

---

> **本文档是 2.0 的最终可执行蓝图。**
> 放入 `docs/toAI/07-2.0-Copilot执行指南-终极版.md`
> 每个 Phase 开始时作为 Copilot 上下文输入。
