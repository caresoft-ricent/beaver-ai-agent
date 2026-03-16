# beaver-ai-agent 代码改造意见

> 基于对 beaver-ai-agent 完整源码的深度审计（后端 Python 14 个核心文件、前端 React 12 个组件/页面），结合河狸云真实数据结构，给出具体的技术改造建议。

## 1. 代码现状总体评估

| 维度 | 评分 | 判断 |
|------|------|------|
| 工程完成度 | B+ | 前后端闭环、流式 SSE、证据链、工作流引擎均已实现 |
| 架构成熟度 | B- | Skill-first 未升级，Scope 缺失，Action 未解耦 |
| 代码质量 | B | 核心引擎逻辑清晰，但双引擎重复严重 |
| 安全性 | C+ | 认证模式有隐患，无权限校验层 |
| 可测试性 | D | 零测试，无回归能力 |
| 可扩展性 | B | 模块化雏形已现，待系统化收敛 |

---

## 2. 代码优势与亮点

### 2.1 流式引擎质量超出预期

stream_engine.py 约 1050 行，覆盖了完整的执行链路：意图识别 → LLM 增强实体抽取 → 参数归一化/转换 → 槽位校验/追问 → 工具链执行 → LLM 流式回复生成。每一步都有 AG-UI 协议事件输出和证据链记录。这个链路的完备程度超出了普通 POC 水平。

### 2.2 工作流编排引擎是真正的加分项

workflow_engine.py 支持 6 种节点类型（tool_call / condition / parallel / confirm / llm_call / reply），有向图执行、暂停恢复、变量模板解析（`${tool_results.node_1.status}`），MAX_STEPS 防死循环。说明开发者已经在想"超越线性工具链"的问题。

### 2.3 上下文管理器处理了真实问题

context_manager.py 包含：中文日期短语归一化（"最近两周" → date_start/date_end）、状态枚举映射、属性级 normalization_config、名称→ID 的 mapping_config 转换、多轮实体合并、意图切换时清除旧实体、上下文摘要压缩。这些是踩过实际坑的产物。

### 2.4 参数映射设计有意识

ActionParameter.source_property 把"语义属性名"和"API 实际参数名"解耦（如上下文中叫 `line_code`，API 实际要 `regionId`）。方向正确。

### 2.5 AG-UI 协议实现干净

agui.py 约 117 行，轻量的 SSE 事件编码器，支持完整的 AG-UI 事件类型。实现干净。

---

## 3. 关键问题诊断

### 问题 1：双引擎代码重复（最大技术债）

engine.py（415行，同步版）和 stream_engine.py（1055行，流式版）存在大量重复：

- `_recognize_intent()` — 两个文件各写了一遍
- `_execute_tool()` / `_execute_tool_with_events()` — 核心工具执行逻辑重复
- `_render_template()` — 完全相同
- `_get_llm_config()` — 完全相同
- `_format_data_as_text()` — 完全相同
- `_generate_reply_with_llm()` / `_stream_llm_reply()` — 同步 vs 流式，但核心逻辑相同

**影响：** 任何业务逻辑修改都需要同步更新两处。

**建议：** 抽取 core/pipeline.py，双引擎只做输出适配（同步返回 vs SSE 事件包装）。

### 问题 2：Skill 表职责过载

当前 Skill 表 18 个字段，承担三层职责：

| 职责层 | 字段 |
|--------|------|
| 场景定义 | match_keywords, match_patterns, skill_description, skill_code |
| 执行编排 | flow_type, workflow_config, max_tool_calls, response_prompt, response_template, entity_extract_prompt |
| 策略配置 | clarification_config, max_response_tokens, summary_threshold, llm_config_id |

**影响：** 同一个能力（如"问题关闭"）被工序验收和巡检两个场景使用时，必须创建两个 Skill，各自配一遍所有字段。

**建议（Stage 4）：** 拆分为 Scenario（场景匹配）+ Playbook（执行编排）+ ScenarioPolicy（策略）。但这不是当前优先级。

### 问题 3：Session Scope 严重缺失

DialogEngine 构造函数：
```python
def __init__(self, db: Session, tenant_id: int, customer_id: str):
```

只有 tenant_id 和 customer_id，且 tenant_id 是 int 类型。但河狸云实际数据中：
- 企业 ID 是字符串编码（'RYSGS'、'BLOGI'）
- 需要 enterprise_id、org_id、member_id、ouid、角色、数据域等完整上下文

**影响：** 无法做数据域隔离和权限校验。

**建议（Stage 1）：** 实现 BeaverSessionScope，从 Header 提取。

### 问题 4：Action 缺少安全属性声明

Action 表本质是 HTTP 请求模板包装器（http_method, api_path, request_template, response_mapping, mock_response），缺少：

- **前置条件检查**：问题必须是 open 状态才能关闭
- **确认策略**：现在挂在 Skill.clarification_config 上
- **输入输出 schema 验证**：ActionParameter 有 is_input/is_output 但没有 JSON Schema
- **副作用声明**：read / write / delete
- **幂等性声明**

**影响：** "是否需要确认"取决于配 Skill 的人记不记得加 `require_confirm`。

**建议（Stage 2）：** Action 新增 capability_code / policy_config / side_effect_type。

### 问题 5：零测试

整个项目没有 tests/ 目录。

**影响：** 任何重构都是在"碰运气"。

**建议（Stage 0）：** 立即建立测试，写 5 个场景级金样例。

### 问题 6：认证模式有安全隐患

ConnectorClient 的 `proxy_headers` 模式直接将 auth_config 中的所有 header 注入请求。`jwt_pass` 模式的 token 是静态配置。

**建议：** 第一阶段用 BeaverSessionScope.token 代理调用。第二阶段让 Capability Gateway 统一处理认证。

---

## 4. 具体改造建议

### 建议 1：合并双引擎，抽取 pipeline.py

**新文件：** `backend/app/core/pipeline.py`

抽取以下函数为独立模块：
- `recognize_intent(db, tenant_id, message, skills, ctx)` → 返回 (skill, confidence, entities, detail)
- `execute_tool(db, tool, entities, customer_id)` → 返回 result dict
- `render_template(template, data, entities)` → 返回 str
- `get_llm_config(db, tenant_id, usage)` → 返回 LLMConfig
- `format_data_as_text(data)` → 返回 str

engine.py 变为：调用 pipeline → 同步返回 EngineResult
stream_engine.py 变为：调用 pipeline → 包装 AG-UI SSE 事件

**预计效果：** 消除约 300 行重复代码，未来业务逻辑只改一处。

### 建议 2：BeaverSessionScope 实现

**新文件：** `backend/app/kernel/scope.py`

```python
from pydantic import BaseModel
from fastapi import Request

class BeaverSessionScope(BaseModel):
    ouid: str                    # Header Ouid
    enterprise_id: str           # Header Enterpriseid（字符串！）
    member_id: str               # Header Memberid
    org_id: str                  # Header Orgid
    token: str                   # Header Authorization（去掉 Bearer）
    display_name: str = ""
    enterprise_name: str = ""
    job: str = ""
    role_type: int = 0
    roles: list = []
    regions: list = []
    children_ids: list = []
    current_module: str = ""
    exp: int = 0

def extract_scope(request: Request) -> BeaverSessionScope:
    """从前端请求 Header 提取 Scope"""
    token = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
    referer = request.headers.get("Referer", "")
    # 从 Referer 解析模块：/org/{orgId}/enterprise/{eid}/{module}/{sub}
    parts = referer.split("/")
    module = ""
    if "enterprise" in parts:
        idx = parts.index("enterprise")
        if idx + 2 < len(parts):
            module = parts[idx + 2]
        if idx + 3 < len(parts):
            module += "/" + parts[idx + 3]

    return BeaverSessionScope(
        ouid=request.headers.get("Ouid", ""),
        enterprise_id=request.headers.get("Enterpriseid", ""),
        member_id=request.headers.get("Memberid", ""),
        org_id=request.headers.get("Orgid", ""),
        token=token,
        current_module=module,
        # roles, job, regions 等通过缓存的 rc_enterprise 获取
    )
```

### 建议 3：Action → Capability 新增字段

```sql
ALTER TABLE ai_action ADD COLUMN capability_code VARCHAR(64) COMMENT '标准能力编码，如 issue.close';
ALTER TABLE ai_action ADD COLUMN input_schema JSON COMMENT '输入参数 JSON Schema';
ALTER TABLE ai_action ADD COLUMN output_schema JSON COMMENT '输出参数 JSON Schema';
ALTER TABLE ai_action ADD COLUMN policy_config JSON COMMENT '策略配置，含 requires_confirmation / scope_check';
ALTER TABLE ai_action ADD COLUMN side_effect_type VARCHAR(16) DEFAULT 'read' COMMENT 'read/write/delete';
```

policy_config 示例：
```json
{
  "requires_confirmation": true,
  "scope_check": "enterprise",
  "preconditions": [
    {"field": "status", "operator": "eq", "value": "open"}
  ]
}
```

### 建议 4：LLM 配置简化

当前按 usage（intent/response/general/entity_extraction）分别配置 LLM，代码里到处 `_get_llm_config(db, tenant_id, usage)`。

**建议：** 简化为"默认模型 + 可选 per-scenario 覆盖"。建立 LLMRouter 中间层，根据 task_type 自动选择本地推理（意图识别、实体抽取）或云端 API（回复生成）。

### 建议 5：tenant_id 类型迁移

代码中多处使用 `tenant_id: int`，但河狸云实际的企业 ID / 租户 ID 是字符串编码。需要：

1. 评估 AI Kernel 内部表（ai_entity, ai_skill, ai_action 等）的 tenant_id 字段是否需要改为 varchar
2. 如果内部保留数字 ID，建立"河狸云企业编码 ↔ AI Kernel 租户 ID"映射表
3. BeaverSessionScope 中使用字符串类型的 enterprise_id

### 建议 6：流式 LLM 统一走 litellm

stream_engine.py 的 `_stream_llm_reply()` 直接用 httpx 拼 SSE 请求，而 requirements.txt 里有 litellm 但只在同步调用中使用。建议统一走 litellm 的流式接口，减少自己维护 SSE 解析的负担。

---

## 5. 风险矩阵

| 风险 | 概率 | 影响 | 应对措施 |
|------|------|------|----------|
| 重构时破坏现有功能 | 高 | 客户场景不可用 | **先补测试再重构**，建立回归基线 |
| 过度架构导致交付变慢 | 中 | 客户价值产出延迟 | 每个 Stage 同时交付一个场景 |
| Java 团队配合不及时 | 中 | 桥接协议无法落地 | 第一阶段零依赖，先 Mock 后替换 |
| 企业 ID 类型迁移复杂度 | 中 | 数据兼容性问题 | 先加映射层，再逐步迁移 |
| 模型质量影响意图识别精度 | 中 | 用户体验下降 | 规则优先 + LLM 兜底的双层策略已是正确方向 |

---

## 6. 前端简要评估

前端不是当前瓶颈，但有几个观察：

- ChatPage.tsx 有 874 行，WorkflowEditor.tsx 有 41KB — 需要拆分
- AG-UI 协议的前端解析逻辑写在 ChatPage 里 — 建议提取为独立的 `useAGUIStream` hook
- 如果后续要支持嵌入式部署（iframe/WebComponent），需要做一次清理

---

## 7. 最终判断

**当前系统离"可交付"比离"平台化"更近。**

不要在还没跑通 3 个以上真实客户场景之前就开始追求完美的 Ontology Runtime 和 Eval 平台。先把测试补上、Session Scope 接通、Capability 升级做完，让 1-2 个客户场景稳定运行，再回头做平台化抽象。

代码库的方向是对的，架构文档的思考深度超出了大多数同阶段项目。接下来的关键是：**不要让"架构完美主义"拖慢"场景交付"，也不要让"快速交付"破坏"平台边界"。在两者之间找到节奏。**
