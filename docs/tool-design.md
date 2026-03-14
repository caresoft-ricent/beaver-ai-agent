# 工具/技能设计方案 — 接口调用包装 + 本体操作混合模式

> 基于殷明反馈调整：减少重复配置，支持综合接口直接包装

## 核心思路

原设计严格按「本体(Entity) + 操作(Action)」来包装每个工具，这在接口是综合接口时会导致：
- 多个操作调用同一接口（只是参数不同）
- 需要反复描述，严重拉长上下文
- 重复配置

**新方案：双模式混合**

### 模式1: 接口调用直接包装（殷明方案，推荐）
`SkillTool.tools_mode = "api"`, 在 `config.api_config` 中直接定义接口调用：

```json
{
  "api_config": {
    "name": "关闭问题",
    "connector_id": 1,
    "http_method": "POST",
    "api_path": "/api/v1/issues/close",
    "request_template": {
      "issue_id": "${issue_id}",
      "reason": "${reason}",
      "operator": "${customer_id}"
    },
    "response_mapping": {
      "status": "data.status",
      "message": "data.message"
    },
    "mock_response": {
      "data": {"status": "closed", "message": "问题已关闭"}
    }
  }
}
```

**优势：**
- 一个工具 = 一个综合接口调用
- 无需拆分为多个 Entity + Action
- 配置集中、简洁
- 适合河狸云现有综合接口（问题关闭/联系单提交等）

### 模式2: 本体+操作（原方案，适合标准化场景）
`SkillTool.entity_id` + `SkillTool.action_id` 引用已定义的本体和操作。

**适用场景：**
- 同一本体有多个标准操作（CRUD）
- 需要利用本体属性做输入/输出校验
- 多个技能共享同一本体的不同操作

## 数据库结构（无需迁移）

`ai_skill_tool` 表的 `config` JSON 字段已支持存储 `api_config`。

| 字段 | 说明 |
|------|------|
| `tools_mode` | `api`=接口调用, `system_tool`=系统工具 |
| `entity_id` / `action_id` | 模式2: 本体+操作引用 |
| `config.api_config` | 模式1: 接口调用直接配置 |

**判断逻辑：**
1. 如果 `config.api_config` 存在且 `tools_mode=api` → 使用接口调用模式
2. 否则，如果 `entity_id` 存在 → 使用本体+操作模式
3. 两种模式可在同一技能的工具链中混用

## 示例：查询产线进度

### 方式A: 接口调用包装（推荐）
```
Skill: QUERY_PROGRESS
  └─ SkillTool(order=1, tools_mode="api", config={
       "api_config": {
         "name": "查询交货进度",
         "connector_id": 1,
         "http_method": "GET",
         "api_path": "/api/delivery/progress",
         "request_template": null,
         "response_mapping": {"items": "data.items"},
         "mock_response": {"data": {"items": [...]}}
       }
     })
```

### 方式B: 本体+操作
```
Skill: QUERY_PROGRESS
  └─ SkillTool(order=1, entity_id=1, action_id=1)
       引用: Entity(产线) → Action(查询进度)
```

## AG-UI 流式协议

对话接口升级为 AG-UI 协议兼容：
- `POST /api/v1/chat/stream` — SSE 流式对话（新增）
- `POST /api/v1/chat/completions` — 原同步接口（保留）

AG-UI 事件流：
```
RUN_STARTED → STEP_STARTED(intent) → CUSTOM(intent结果)
→ STEP_STARTED(tool_execution) → TOOL_CALL_START → TOOL_CALL_ARGS → TOOL_CALL_END → TOOL_CALL_RESULT
→ STEP_STARTED(reply_generation) → TEXT_MESSAGE_START → TEXT_MESSAGE_CONTENT(流式) → TEXT_MESSAGE_END
→ RUN_FINISHED
```

## 前端界面

ChatPage 升级为 ChatGPT 风格：
- 居中式对话布局（最大宽度 768px）
- 流式文本输出（逐段渲染 + 光标闪烁）
- 工具调用可视化（显示调用进度）
- 意图识别步骤展示
- **听写功能**：Web Speech API 语音输入
- 快捷问题标签
