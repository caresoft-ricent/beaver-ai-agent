# 河狸云 API 对接方案

## 背景

AI Agent 需要调用河狸云 SaaS 平台的业务 API（查询账单、订单、工单等）。
出于安全考虑，不将客户的真实 token 暴露给 AI Agent，而是由河狸云平台提供一个**匿名接口**，通过写死的请求头锁定调用方身份。

---

## 方案设计

### 1. 河狸云侧：新增匿名 API 网关

河狸云平台包装一组只读 API，以统一前缀暴露：

```
POST https://api.beaver-cloud.com/ai-agent/v1/query
```

**请求头（写死，锁定身份）：**

```http
X-Agent-Key: <由河狸云生成的固定密钥，每个租户一个>
X-Tenant-Id: <租户ID>
Content-Type: application/json
```

**请求体（通用查询格式）：**

```json
{
  "entity": "bill",
  "action": "list",
  "customer_id": "C001",
  "params": {
    "page": 1,
    "page_size": 20,
    "status": "unpaid"
  }
}
```

**返回格式（统一结构）：**

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "total": 5,
    "items": [...]
  }
}
```

### 2. 支持的 entity + action 列表

| entity | action | 说明 |
|--------|--------|------|
| bill | list / detail | 账单查询 |
| order | list / detail | 订单查询 |
| ticket | list / detail / create | 工单管理 |
| product | list / detail | 产品查询 |
| usage | summary / detail | 用量统计 |
| payment | list | 支付记录 |

### 3. AI Agent 侧：ConnectorClient 适配

当前 `backend/app/core/connector_client.py` 已有 `ConnectorClient` 类，
只需在**河狸云connector配置**中填入：

| 配置字段 | 值 |
|----------|-----|
| base_url | `https://api.beaver-cloud.com/ai-agent/v1` |
| auth_type | `header` |
| auth_config | `{"X-Agent-Key": "<密钥>"}` |

系统会自动将 `X-Agent-Key` 注入每次请求的 Header。

### 4. 具体实现步骤

#### 步骤 1：河狸云平台（殷明团队负责）

1. 创建 AI Agent 专用 API 网关路由 `/ai-agent/v1/query`
2. 为每个租户生成一个 `agent_key`（存 DB，可随时吊销）
3. 网关层根据 `X-Agent-Key` + `X-Tenant-Id` 鉴权，校验调用合法性
4. 收到请求后，内部转发到对应业务微服务，拿到结果后统一格式返回
5. **只开放只读接口**（list / detail），写入操作（create ticket）需要二次确认机制

#### 步骤 2：AI Agent 侧配置

```python
# 管理后台 → 连接器管理 → 新增连接器
{
    "name": "河狸云业务API",
    "base_url": "https://api.beaver-cloud.com/ai-agent/v1",
    "auth_type": "header",
    "auth_config": {
        "X-Agent-Key": "ak_xxxxxxxxxxxx",
        "X-Tenant-Id": "1"
    },
    "timeout": 10,
    "is_active": True
}
```

#### 步骤 3：意图配置绑定

在管理后台为每个意图配置 API 调用：

- 意图：`QUERY_BILL` → connector: 河狸云业务API → path: `/query` → body_template: `{"entity":"bill","action":"list",...}`
- 意图：`QUERY_ORDER` → connector: 河狸云业务API → path: `/query` → body_template: `{"entity":"order","action":"list",...}`

### 5. 安全要点

- `X-Agent-Key` 只在后端使用，永远不暴露给前端
- 河狸云网关限制：只允许 AI Agent 服务器 IP 访问（可选白名单）
- 所有 API 调用记录审计日志
- `agent_key` 支持过期和轮转
- 敏感字段（身份证号、手机号）在返回时脱敏处理

### 6. 整体调用链路

```
用户提问 → ChatPage (前端)
  → /api/v1/chat/stream (AG-UI 协议)
    → StreamEngine 意图识别
      → ConnectorClient.call("河狸云业务API", "/query", {...})
        → https://api.beaver-cloud.com/ai-agent/v1/query
          ← 河狸云返回结果
      ← 格式化回复 + SSE 流式输出
    ← 前端渲染消息
```

---

## 下一步 Action Items

| 负责方 | 事项 | 优先级 |
|--------|------|--------|
| 河狸云(殷明) | 设计并实现 `/ai-agent/v1/query` 网关 | P0 |
| 河狸云(殷明) | 提供 agent_key 和 entity/action 文档 | P0 |
| AI Agent | 管理后台配置连接器 + 意图绑定 | P1 |
| AI Agent | 联调测试 | P1 |
