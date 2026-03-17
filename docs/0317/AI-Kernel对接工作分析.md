# AI-Kernel × 河狸云对接 —— 工作分析与行动计划

> 基于《AI-Kernel对接完整方案-v2.pdf》，对照现有代码分析，列出 AI Kernel 侧所有需完成的工作项。
>
> 更新日期：2026-03-17

---

## 一、方案核心要点回顾

### 1.1 四种访问方式

| # | 方式 | 身份来源 | 说明 |
|---|------|---------|------|
| 1 | 嵌入 iframe | 河狸云签 ticket → iframe | 河狸云内点"AI助手" |
| 2 | 嵌入新窗口 | 河狸云签 ticket → URL 传入 | 点击打开新标签 |
| 3 | 独立访问（有登录态） | 跳河狸云 /ai-auth → 自动签票跳回 | 直接打开 ai.ricent.com |
| 4 | 独立访问（未登录） | 跳河狸云登录 → /ai-auth → 签票跳回 | 直接打开 ai.ricent.com |

**关键原则**：四种方式共用同一套 `Ticket → Session → activate-scope → Gateway` 协议。

### 1.2 河狸云需提供的三个接口

| # | 接口 | 优先级 | 描述 |
|---|------|--------|------|
| 1 | `POST /api/internal/ai-ticket` | P0 | 签发含 identity + memberships 的 JWT ticket |
| 2 | `GET /ai-auth?redirect={url}` | P0 | 认证中转页（独立访问时用） |
| 3 | `POST /api/ai/gateway/execute` | P1 | 能力网关（统一 API 路由入口） |

### 1.3 AI Kernel Session 模型（方案设计）

```
AISession:
  session_id
  principal        → user_id, username, display_name, phone
  access_token     → 河狸云 JWT（跨企业通用）
  available_memberships[]  → 用户可选的全部企业/权限
  active_scope     → 当前工作作用域（可切换）
  created_at / expires_at
```

### 1.4 AI Kernel 需提供的 API

| # | 端点 | 功能 |
|---|------|------|
| 1 | `POST /api/v1/auth/exchange` | Ticket → Session（建立会话） |
| 2 | `POST /api/v1/session/activate-scope` | 切换企业作用域 |
| 3 | `GET /api/v1/session/me` | 查询当前 Session 信息 |
| 4 | `/auth/callback` 页面 | 独立访问回调页（前端路由） |

---

## 二、现有代码盘点

### 2.1 已有（可复用）

| 模块 | 文件 | 现状 | 评估 |
|------|------|------|------|
| **BeaverSessionScope** | `kernel/scope.py` | 5 核心字段 + 12 扩展字段 | ✅ 可复用，需扩展 |
| **extract_scope()** | `kernel/scope.py` | 从 Header 提取 5 个字段 | ✅ 可复用 |
| **ConnectorClient** | `clients/connector_client.py` | 3 种认证类型：api_key / jwt_pass / proxy_headers | ⚠️ 需新增 scope_proxy |
| **Connector 模型** | `models/config.py` | auth_type: api_key / oauth2 / jwt_pass / custom | ⚠️ 需扩展 |
| **ChatPage (H5)** | `pages/ChatApp.tsx` | `/chat/app` 独立页面 | ✅ 可作为嵌入基础 |
| **ChatEmbed** | `pages/ChatEmbed.tsx` | `/chat-embed` iframe 嵌入 | ✅ 可复用 |
| **API client** | `api/client.ts` | Axios + JWT 拦截器 | ⚠️ 需扩展 Header |

### 2.2 缺失（需新建）

| 模块 | 说明 |
|------|------|
| **AISession 模型** | 数据库表 + ORM：存储 principal、memberships、active_scope、access_token、过期时间 |
| **Ticket 验签** | 验证河狸云签发的 JWT ticket（HS256 + 共享密钥） |
| **POST /auth/exchange** | ticket 换 session_token 的 API |
| **POST /session/activate-scope** | 切换企业作用域的 API |
| **GET /session/me** | 查询当前会话信息的 API |
| **scope_proxy 注入** | ConnectorClient 中根据 active_scope 动态构建请求 Header |
| **前端 /auth/callback 页面** | 独立访问流程的回调页面 |
| **前端企业选择器** | 多企业用户切换作用域的 UI 组件 |
| **前端 postMessage 监听** | 嵌入模式下接收河狸云的 scope 变更通知 |
| **Gateway 对接** | 改现有连接器 → 统一走 `/api/ai/gateway/execute` |

---

## 三、工作分解

### 第一类：主动先做（不依赖河狸云，可立即启动）

#### 🔧 T1. scope_proxy 动态注入（后端）
**优先级 P0 | 预估 3h**

**现状**：`ConnectorClient._build_headers()` 的 `proxy_headers` 分支只能从 `auth_config.headers` 读取**静态**值，无法从运行时 `BeaverSessionScope` 动态注入。

**改动内容**：
1. 在连接器 `auth_type` 中新增 `scope_proxy` 类型
2. `ConnectorClient.__init__` 接受可选 `scope: BeaverSessionScope` 参数
3. `_build_headers()` 在 `scope_proxy` 模式下从 `scope` 动态构建：
   ```python
   if self.auth_type == "scope_proxy" and self.scope:
       headers["Authorization"] = f"Bearer {self.scope.token}"
       headers["Enterpriseid"] = self.scope.enterprise_id
       headers["Memberid"] = self.scope.member_id
       headers["Orgid"] = self.scope.org_id
       headers["Ouid"] = self.scope.ouid
   ```
4. 三大引擎（`engine.py` / `stream_engine.py` / `workflow_engine.py`）构建 ConnectorClient 时传入当前 scope

**验证**：单元测试验证不同 auth_type 生成正确 Header。

---

#### 🔧 T2. AISession 模型 + 数据表（后端）
**优先级 P0 | 预估 4h**

新建 `backend/app/models/session.py`，设计 `ai_session` 表：

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BigInteger PK | 自增 |
| session_token | String(64) UNIQUE | AI Kernel 签发的 session 标识 |
| user_id | String(64) | 河狸云用户 ID |
| username | String(128) | 用户名 |
| display_name | String(128) | 显示名 |
| phone | String(32) | 手机号 |
| access_token | Text | 河狸云 JWT（加密存储） |
| memberships | JSON | 完整 memberships 数组 |
| active_membership_id | String(128) | 当前激活的 membership_id |
| active_scope | JSON | 当前 active_scope 快照 |
| expires_at | DateTime | 过期时间 |
| created_at | DateTime | 创建时间 |

新建 Alembic 迁移脚本。

---

#### 🔧 T3. Ticket 验签 + exchange API（后端）
**优先级 P0 | 预估 3h**

1. 配置项：`AI_TICKET_SECRET` 环境变量（共享密钥）
2. 新建 `backend/app/kernel/ticket.py`：`verify_ticket(ticket_jwt) → dict`
   - HS256 验签
   - 校验 issuer = "beaver"、audience = "beaver-ai-kernel"
   - 校验过期时间
3. 新建 `POST /api/v1/auth/exchange`：
   - 接收 `{"ticket": "eyJ..."}`
   - 验签 → 创建 AISession → 返回 session_token + 用户信息 + 企业列表 + 默认 active_scope
   - ticket 一次性使用（用后标记已消费或用 jti 去重）

---

#### 🔧 T4. activate-scope + /me API（后端）
**优先级 P0 | 预估 3h**

1. `POST /api/v1/session/activate-scope`：
   - Header: `Authorization: Bearer {session_token}`
   - Body: `{"membership_id": "m_BLOGI_...", "current_module": "inspection"}`
   - 从 session.memberships 中查找对应 membership → 更新 active_scope
   - 返回新的 active_scope + 提示消息
2. `GET /api/v1/session/me`：
   - Header: `Authorization: Bearer {session_token}`
   - 返回当前 session 的 user + memberships + active_scope

---

#### 🔧 T5. Session 中间件（后端）
**优先级 P0 | 预估 2h**

1. 新建 `backend/app/kernel/session_middleware.py`：
   - 从请求 Header `Authorization: Bearer {session_token}` 提取 session_token
   - 查 ai_session 表 → 验证未过期 → 注入 `request.state.ai_session`
   - 从 active_scope 构建 BeaverSessionScope 注入 `request.state.scope`
2. 兼容现有逻辑：
   - 无 session_token 时退化为现有 `extract_scope()` 行为
   - 现有管理后台、demo 测试等不受影响

---

#### 🔧 T6. 前端 auth/callback 页面 + 路由（前端）
**优先级 P0 | 预估 3h**

1. 新建 `frontend/src/pages/AuthCallback.tsx`：
   - URL: `/auth/callback?ticket=xxx`
   - 从 URL 取 ticket → 调 `POST /api/v1/auth/exchange` → 存 session_token
   - 成功后跳转到对话页面
2. 更新 `App.tsx` 添加路由
3. 更新 `api/client.ts`：
   - 请求拦截器自动注入 session_token
   - 注入 scope Header：Enterpriseid / Memberid / Orgid / Ouid

---

#### 🔧 T7. 前端企业选择器（前端）
**优先级 P1 | 预估 4h**

1. 新建企业选择器组件：
   - 调 `GET /api/v1/session/me` 获取企业列表
   - 下拉/卡片式选择企业
   - 选择后调 `POST /api/v1/session/activate-scope`
   - 在对话中显示"已切换到 XX 企业"
2. ChatPage 顶部或侧边栏集成选择器

---

#### 🔧 T8. 前端 postMessage 监听（前端）
**优先级 P0 | 预估 2h**

在 ChatEmbed / ChatApp 中添加 `window.addEventListener('message', ...)`:
- 监听 `KERNEL_SCOPE_CHANGED` 事件
- 校验 `event.origin` 白名单
- 调 `POST /api/v1/session/activate-scope` 更新作用域
- 在对话中插入系统消息

---

### 第二类：对接联调（依赖河狸云接口就绪）

#### 🔗 T9. Ticket 联调（依赖河狸云 #1 #3）
**优先级 P0 | 预估 1d**

- 河狸云部署 `/api/internal/ai-ticket`
- 双方约定 `AI_TICKET_SECRET`
- 联调：河狸云签 ticket → AI Kernel exchange → 建立 session
- 验证所有 membership 字段完整性

---

#### 🔗 T10. 嵌入模式联调（依赖河狸云 #4）
**优先级 P0 | 预估 1d**

- 河狸云前端添加"AI助手"按钮，拿 ticket 传给 iframe
- 联调 ticket 交换 → 对话 → 动态身份 API 调用
- 验证 postMessage 企业切换通知

---

#### 🔗 T11. 独立访问联调（依赖河狸云 #2）
**优先级 P0 | 预估 0.5d**

- 河狸云部署 `/ai-auth` 中转页
- 联调完整流程：用户访问 → 跳转登录 → 签票 → 回调 → 进入对话
- 验证已登录和未登录两种场景

---

#### 🔗 T12. Gateway 对接（依赖河狸云 #5）
**优先级 P1 | 预估 2d**

1. 河狸云部署 `POST /api/ai/gateway/execute`（首批 5 个能力）
2. AI Kernel 侧：
   - 为每个 capability_code 配置 Action + Skill
   - Gateway 相比现有直接调 API：只需一个连接器、一个 base_url、capability_code 路由
3. 现有 2 个场景（产线进度 QUERY_PROGRESS_OVER + 服务查询 QUERY_SERVICE）升级为动态身份
4. 新建 3-4 个新场景：
   - `issue.query` → 质量问题查询
   - `issue.close` → 关闭问题（写操作）
   - `inspection.list` → 巡检记录
   - `acceptance.query` → 验收记录
   - `project.summary` → 项目概况
5. 处理 Gateway 统一错误码（4001/4003/4004/4010/4040/5000）

---

#### 🔗 T13. 全链路验证（依赖所有接口就绪）
**优先级 P0 | 预估 1d**

按方案中的验证标准逐条测试：

| # | 场景 | 操作 | 期望 |
|---|------|------|------|
| 1 | 嵌入 iframe | 河狸云内点 AI 助手 | AI 显示当前企业，查询返回该企业数据 |
| 2 | 嵌入切企业 | 河狸云顶部切企业 | AI 提示"已切换到XX"，后续查询用新企业 |
| 3 | 嵌入新窗口 | 河狸云内新标签打开 | 企业选择器 + 当前企业数据 |
| 4 | 独立访问（已登录） | 打开 ai.ricent.com | 自动签票 → 自动回来 → 进入对话 |
| 5 | 独立访问（未登录） | 打开 ai.ricent.com | 登录 → 自动回来 → 进入对话 |
| 6 | 独立切企业 | 前端选择器切换 | 后续查询用新企业数据 |
| 7 | 跨企业查询 | "我管的所有项目里哪个问题最多" | AI 遍历 memberships 汇总结果 |
| 8 | 无权限 | 手动切到不在 memberships 的企业 | 返回 4003 |
| 9 | Session 过期 | 等 session 过期后操作 | 提示重新登录 |
| 10 | Gateway 错误码 | 关闭已关闭的问题 | 展示"问题已关闭，无法操作" |

---

## 四、时间线建议

### 第 1 周（AI 侧先行，不等河狸云）

| 天 | 任务 | 负责 |
|----|------|------|
| Day1-2 | T1: scope_proxy 动态注入 + T2: AISession 模型 | 后端 |
| Day3 | T3: Ticket 验签 + exchange API | 后端 |
| Day4 | T4: activate-scope + /me API + T5: Session 中间件 | 后端 |
| Day5 | T6: 前端 auth/callback + T8: postMessage 监听 | 前端 |

### 第 2 周（联调）

| 天 | 任务 | 负责 |
|----|------|------|
| Day1-2 | T9: Ticket 联调 + T10: 嵌入模式联调 | 双方 |
| Day3 | T11: 独立访问联调 + T7: 前端企业选择器 | 双方 + 前端 |
| Day4-5 | 现有场景升级动态身份 + 联调验证 | AI 侧 |

### 第 3 周（Gateway + 新场景）

| 天 | 任务 | 负责 |
|----|------|------|
| Day1-2 | T12: Gateway 对接（首批 5 能力） | 双方 |
| Day3-4 | 新增 3-4 个 AI 场景（issue/inspection/acceptance/project） | AI 侧 |
| Day5 | T13: 全链路验证（10 个验证场景） | 双方 |

---

## 五、关键技术决策

### 5.1 session_token 与现有 admin JWT 共存

| 场景 | 认证方式 | 说明 |
|------|---------|------|
| 管理后台 `/api/admin/*` | AdminUser JWT | 不变 |
| 对接模式 `/api/v1/*` | session_token（从 ticket 交换） | 新增 |
| 管理后台测试对话 `/api/v1/*` | AdminUser JWT（降级为 anonymous scope） | 兼容 |
| Demo/测试 | 无认证 / URL 参数 | 兼容 |

设计中间件时需要同时支持两种 token 并向下兼容。

### 5.2 tenant_id 映射

方案中 `tenant_id` 是字符串（如 "RYSGS"），现有系统中 `tenant_id` 是整数（如 1）。需要：
- AISession 存储原始 `enterprise_id`（字符串）
- BeaverSessionScope.tenant_id 保留 `Optional[int]` 做映射
- 需要建立 `enterprise_id → int tenant_id` 的映射表或映射逻辑
- 短期方案：在 ai_tenant 表增加 `enterprise_code` 字段做关联

### 5.3 Gateway vs 直连

| 对比项 | 直连（现有方式） | Gateway（方案推荐） |
|--------|----------------|---------------------|
| 连接器数量 | 每个 API 需单独配连接器 | 只需一个 Gateway 连接器 |
| 认证 | 每个连接器独立配 | 统一 scope_proxy |
| 新增能力 | 配连接器 + Action + Skill | Java 加路由表 + AI 配 Action + Skill |
| 错误处理 | 各 API 格式不同 | 统一错误码 |

**建议**：新场景统一走 Gateway，现有 QUERY_PROGRESS_OVER / QUERY_SERVICE 迁移到 Gateway。

### 5.4 密钥管理

```bash
# 生成共享密钥
openssl rand -hex 32

# .env 配置
AI_TICKET_SECRET=生成的密钥
```

河狸云用它签 ticket，AI Kernel 用它验 ticket。通过安全渠道（非代码仓库）传递。

---

## 六、风险与注意事项

| 风险 | 影响 | 应对 |
|------|------|------|
| ticket 有效期仅 5 分钟 | 用户操作慢时 ticket 过期 | 前端拿到 ticket 后立即 exchange |
| access_token 过期 | Gateway 调用返回 401 | AI Kernel 检测 401 → 提示用户重新登录 |
| 跨企业查询性能 | 用户有 N 个企业就调 N 次 Gateway | 并发调用 + 超时控制 + 结果缓存 |
| session_token 泄露 | 冒充用户 | HTTPS 传输 + HttpOnly Cookie 或短有效期 |
| 企业数据隔离 | 切换 scope 不彻底 | 切换时清空对话上下文中的旧实体 |

---

## 七、与河狸云团队对齐要点

### 需要河狸云确认的事项

1. **ticket JWT 字段完整性**：PDF 中的 payload 结构是否最终定稿？特别是 `memberships[].regions`、`children_ids` 的实际数据格式
2. **密钥传递方式**：约定 `AI_TICKET_SECRET` 的生成和交换方式
3. **域名规划**：AI Kernel 部署域名（如 `ai.ricent.com`），用于 `/ai-auth` 的 redirect 白名单
4. **Gateway 首批能力**：5 个 capability_code 的具体请求参数和响应结构
5. **Gateway 部署环境**：测试环境 base_url
6. **postMessage origin**：河狸云前端域名，用于 AI Kernel 的 origin 校验白名单
7. **access_token 有效期**：河狸云 JWT 有效期多长？过期后 AI Kernel 如何处理？

### AI Kernel 侧可先行启动

- T1 ~ T6 完全不依赖河狸云接口，可以立即开始开发
- 使用 Mock ticket 进行本地测试
- scope_proxy 可在现有连接器上配置测试
