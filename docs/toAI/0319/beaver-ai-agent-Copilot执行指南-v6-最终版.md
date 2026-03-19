# Beaver-AI-Agent Copilot 执行指南（最终版 v6）

> **版本**：v6.0
> **更新**：2026-03-19
> **用途**：Copilot 每个新会话的完整上下文

---

## 一、项目定位

beaver-ai-agent（AI Kernel）是独立运行的企业级 Agent 平台，以 Ontology 驱动，承载河狸云及未来更多宿主系统的 AI 场景。

- 河狸云（Java）= System of Record — 业务数据、权限、身份、API
- AI Kernel（Python）= System of Intelligence — 语义理解、本体建模、对话编排、证据链

**三阶段**：①当前 Skill/Tool 手动配置（已通，效果不错）→ ②ContextEngine + 本体 DAG 自发现 → ③LLM 解析 API 文档半自动建模

**对标**：Palantir AIP、Salesforce Semantic Layer、MCP 协议

---

## 二、核心设计哲学

```
1. 打平参数：Action 输入输出 = Parameter 表 is_input/is_output 的扁平 key-value
2. 本体强耦合：Action 属于 Entity，Parameter 可关联 Entity Property
3. 身份由河狸云驱动：AI 侧只存储和使用 UserSessionVo + headers
4. 配置外置：鉴权信息放 .env，不存数据库
5. 最少改动：扩展现有表 + 只新建 1 张 execution_log
6. 一次性交付：3-5 天全部完成
```

---

## 三、系统入口

```
后台管理（/admin）：内置 admin 账号登录，做本体/Skill/Tool/Adapter 配置
Chat 对话（/go?ticket=xxx）：必须从河狸云跳转，无独立登录页
  → 无 ticket 或 session 过期 → 显示「请从河狸云进入AI助手」
```

---

## 四、身份模型

### 4.1 河狸云 UserSessionVo

```java
public class UserSessionVo {
    private Long userId;
    private String userName;
    private String displayName;
    private String mobileNo;
    private String ouName;
    private Integer ouType;           // 1监理 2施工 8甲方
    private Map<String, String> headers;  // Adapter 调 API 直接用
}
```

### 4.2 .env 配置

```env
# 现有配置保持不变...
DB_HOST=127.0.0.1
DB_PORT=13306
# ...

# beaver webapi（新增）
APP_SECRET=Ricent2026
APP_RETRIEVE_URL=https://beaver.ricent.com/api/v6/basic/session/retrieve
```

**说明**：`APP_SECRET` 和 `APP_RETRIEVE_URL` 放 `.env` 而非数据库，因为：
- 它们是部署级配置，不同环境不同值
- `APP_SECRET` 是敏感信息，不应存 DB
- 只有这两个值 + ticket 就能完成全部身份交互

### 4.3 身份流程

```
/go?ticket=xxx 的完整流程：
  1. AI 后端收到请求
  2. 拼接 URL：{APP_RETRIEVE_URL}?ticket={ticket}&appSecret={APP_SECRET}
     例如：https://beaver.ricent.com/api/v6/basic/session/retrieve?ticket=xxxx&appSecret=Ricent2026
  3. GET 请求调用该 URL
  4. 河狸云返回 UserSessionVo JSON
  5. 创建 Redis Session（存储 UserSessionVo 内容）
  6. 跳转到 /chat?session_id=xxx

/refresh?ticket=xxx&userId=xxx&appSecret=xxx 的完整流程：
  1. 河狸云主动调用 AI 后端
  2. 验证 appSecret == APP_SECRET
  3. 如果有 ticket：用新 ticket 重新调 APP_RETRIEVE_URL，刷新 Session
  4. 如果无 ticket：销毁 Session（用户退出）

/refresh?userId=xxx&appSecret=xxx（无 ticket = 退出）：
  1. 验证 appSecret
  2. 销毁该用户的 Redis Session
```

### 4.4 Session 数据结构（Redis）

```json
{
    "session_id": "uuid",
    "user_id": 12345,
    "user_name": "zhangsan",
    "display_name": "张三",
    "mobile_no": "13800138000",
    "ou_name": "XX监理公司",
    "ou_type": 1,
    "headers": {
        "Authorization": "Bearer eyJ...",
        "EnterpriseId": "e1",
        "MemberId": "m1",
        "Content-Type": "application/json"
    }
}
```

Redis key: `session:{session_id}`，TTL 24 小时，无时间戳字段。

---

## 五、兼容性硬性要求

```
1. ALTER TABLE 新增字段必须有 DEFAULT 值 → 现有数据自动兼容
2. 不删除任何现有表、字段、代码
3. 现有 Skill/Tool/Action/Adapter 配置完全保留
4. execution_log 纯新增，不影响现有流程
5. Session 模块纯新增
6. .env 新增变量不影响现有变量
```

---

## 六、数据库改造（一次性执行）

### 6.1 ALTER TABLE

```sql
-- rc_ai_entity
ALTER TABLE rc_ai_entity
    ADD COLUMN IF NOT EXISTS generated_by ENUM('manual','llm','api_sync','domain_auto') DEFAULT 'manual' COMMENT '数据来源',
    ADD COLUMN IF NOT EXISTS confidence DECIMAL(3,2) DEFAULT 1.00 COMMENT '可信度',
    ADD COLUMN IF NOT EXISTS discovery_status ENUM('draft','reviewed','published') DEFAULT 'published' COMMENT '审核状态',
    ADD COLUMN IF NOT EXISTS version INT DEFAULT 1 COMMENT '版本号';

-- rc_ai_entity_property
ALTER TABLE rc_ai_entity_property
    ADD COLUMN IF NOT EXISTS semantic_role ENUM('identifier','status','scope','timestamp','metric','label','content') DEFAULT NULL COMMENT '语义角色',
    ADD COLUMN IF NOT EXISTS enum_values JSON DEFAULT NULL COMMENT '枚举值',
    ADD COLUMN IF NOT EXISTS generated_by ENUM('manual','llm') DEFAULT 'manual' COMMENT '数据来源';

-- rc_ai_entity_relation
ALTER TABLE rc_ai_entity_relation
    ADD COLUMN IF NOT EXISTS relation_type ENUM('belongs_to','has_many','references') DEFAULT 'references' COMMENT '关系类型',
    ADD COLUMN IF NOT EXISTS join_property VARCHAR(200) DEFAULT NULL COMMENT '关联字段',
    ADD COLUMN IF NOT EXISTS generated_by ENUM('manual','llm') DEFAULT 'manual' COMMENT '数据来源';

-- rc_ai_action
ALTER TABLE rc_ai_action
    ADD COLUMN IF NOT EXISTS action_type ENUM('query','mutation') DEFAULT 'query' COMMENT '查询/写操作',
    ADD COLUMN IF NOT EXISTS requires_confirmation BOOLEAN DEFAULT FALSE COMMENT '是否需用户确认',
    ADD COLUMN IF NOT EXISTS risk_level ENUM('low','medium','high') DEFAULT 'low' COMMENT '风险等级',
    ADD COLUMN IF NOT EXISTS generated_by ENUM('manual','llm','api_sync') DEFAULT 'manual' COMMENT '数据来源',
    ADD COLUMN IF NOT EXISTS discovery_status ENUM('draft','reviewed','published') DEFAULT 'published' COMMENT '审核状态';

-- rc_ai_action_parameter
ALTER TABLE rc_ai_action_parameter
    ADD COLUMN IF NOT EXISTS default_value VARCHAR(500) DEFAULT NULL COMMENT '默认值',
    ADD COLUMN IF NOT EXISTS enum_values JSON DEFAULT NULL COMMENT '枚举值',
    ADD COLUMN IF NOT EXISTS semantic_role ENUM('identifier','status','scope','timestamp','metric','label','content') DEFAULT NULL COMMENT '语义角色',
    ADD COLUMN IF NOT EXISTS generated_by ENUM('manual','llm') DEFAULT 'manual' COMMENT '数据来源';

-- rc_ai_adapter（扩展字段，鉴权信息不存这里，放.env）
ALTER TABLE rc_ai_adapter
    ADD COLUMN IF NOT EXISTS adapter_type ENUM('webapi','database') DEFAULT 'webapi' COMMENT '适配器类型',
    ADD COLUMN IF NOT EXISTS base_url VARCHAR(500) DEFAULT NULL COMMENT 'API基地址（DB类不需要）',
    ADD COLUMN IF NOT EXISTS db_config JSON DEFAULT NULL COMMENT '数据库配置（WebAPI类不需要）',
    ADD COLUMN IF NOT EXISTS openapi_url VARCHAR(500) DEFAULT NULL COMMENT 'OpenAPI文档（远期）',
    ADD COLUMN IF NOT EXISTS status ENUM('active','inactive') DEFAULT 'active' COMMENT '状态';

-- rc_ai_skill
ALTER TABLE rc_ai_skill
    ADD COLUMN IF NOT EXISTS match_keywords JSON DEFAULT NULL COMMENT '匹配关键词',
    ADD COLUMN IF NOT EXISTS generated_by ENUM('manual','llm','domain_auto') DEFAULT 'manual' COMMENT '数据来源',
    ADD COLUMN IF NOT EXISTS discovery_status ENUM('draft','reviewed','published') DEFAULT 'published' COMMENT '审核状态',
    ADD COLUMN IF NOT EXISTS test_cases JSON DEFAULT NULL COMMENT '测试用例';

-- rc_ai_tool
ALTER TABLE rc_ai_tool
    ADD COLUMN IF NOT EXISTS generated_by ENUM('manual','llm') DEFAULT 'manual' COMMENT '数据来源';
```

### 6.2 新建表

```sql
CREATE TABLE IF NOT EXISTS rc_ai_execution_log (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    session_id VARCHAR(100) DEFAULT NULL COMMENT 'Redis Session ID',
    conversation_id BIGINT DEFAULT NULL COMMENT '对话ID',
    user_input TEXT COMMENT '用户原始输入',
    skill_id BIGINT DEFAULT NULL,
    tool_id BIGINT DEFAULT NULL,
    entity_id BIGINT DEFAULT NULL,
    action_id BIGINT DEFAULT NULL,
    adapter_id BIGINT DEFAULT NULL,
    input_params JSON COMMENT '打平的输入参数',
    output_data JSON COMMENT '打平的输出结果',
    user_context JSON COMMENT '用户上下文（不含headers）',
    success BOOLEAN COMMENT '是否成功',
    error_message TEXT DEFAULT NULL,
    duration_ms INT DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_session (session_id),
    INDEX idx_action (action_id),
    INDEX idx_success_created (success, created_at)
) COMMENT='执行日志（证据链 + 自发现反馈 + 小模型训练数据）';
```

### 6.3 数据补充

```sql
-- 填充河狸云 adapter 基础信息（鉴权信息在 .env，不存 DB）
UPDATE rc_ai_adapter SET
    adapter_type = 'webapi',
    base_url = 'https://beaver.ricent.com',
    status = 'active'
WHERE adapter_name = '河狸云';
```

**注意**：不再在 adapter 表存 `auth_config`。`APP_SECRET` 和 `APP_RETRIEVE_URL` 统一从 `.env` 读取。adapter 表的 `base_url` 仅供 Adapter 调业务 API 时用（即 `session.headers` 已有鉴权信息的场景，`base_url` 只提供域名前缀）。

---

## 七、.env 新增配置

```env
# ================================================================
# 在现有 .env 末尾追加以下内容
# ================================================================

# Beaver Cloud WebAPI（身份验证）
APP_SECRET=Ricent2026
APP_RETRIEVE_URL=https://beaver.ricent.com/api/v6/basic/session/retrieve
```

在代码中读取：

```python
# backend/app/config.py（新增或追加）
import os

APP_SECRET = os.getenv("APP_SECRET", "")
APP_RETRIEVE_URL = os.getenv("APP_RETRIEVE_URL", "")
```

同步更新 `.env.example`：

```env
# Beaver Cloud WebAPI
APP_SECRET=change-this
APP_RETRIEVE_URL=https://beaver.ricent.com/api/v6/basic/session/retrieve
```

---

## 八、代码实现

### 8.1 新增文件

```
backend/app/
├── session/
│   ├── __init__.py
│   ├── session_manager.py
│   └── ticket_handler.py
├── models/
│   └── execution_log.py
└── api/
    └── session_routes.py
```

### 8.2 SessionManager

```python
import json, uuid
from datetime import timedelta
from redis import asyncio as aioredis

class SessionManager:
    def __init__(self, redis: aioredis.Redis, ttl_hours: int = 24):
        self.redis = redis
        self.ttl = timedelta(hours=ttl_hours)

    async def create(self, user_vo: dict) -> dict:
        session_id = str(uuid.uuid4())
        session = {
            "session_id": session_id,
            "user_id": user_vo["userId"],
            "user_name": user_vo.get("userName", ""),
            "display_name": user_vo.get("displayName", ""),
            "mobile_no": user_vo.get("mobileNo", ""),
            "ou_name": user_vo.get("ouName", ""),
            "ou_type": user_vo.get("ouType"),
            "headers": user_vo.get("headers", {}),
        }
        ttl = int(self.ttl.total_seconds())
        pipe = self.redis.pipeline()
        pipe.setex(f"session:{session_id}", ttl, json.dumps(session, ensure_ascii=False))
        pipe.setex(f"user_session:{session['user_id']}", ttl, session_id)
        await pipe.execute()
        return session

    async def get(self, session_id: str) -> dict | None:
        data = await self.redis.get(f"session:{session_id}")
        return json.loads(data) if data else None

    async def get_by_user(self, user_id) -> dict | None:
        sid = await self.redis.get(f"user_session:{user_id}")
        if not sid:
            return None
        return await self.get(sid.decode() if isinstance(sid, bytes) else sid)

    async def refresh(self, user_id, new_vo: dict) -> dict | None:
        session = await self.get_by_user(user_id)
        if not session:
            return None
        session.update({
            "user_name": new_vo.get("userName", session["user_name"]),
            "display_name": new_vo.get("displayName", session["display_name"]),
            "mobile_no": new_vo.get("mobileNo", session["mobile_no"]),
            "ou_name": new_vo.get("ouName", session["ou_name"]),
            "ou_type": new_vo.get("ouType", session["ou_type"]),
            "headers": new_vo.get("headers", session["headers"]),
        })
        ttl = int(self.ttl.total_seconds())
        await self.redis.setex(
            f"session:{session['session_id']}", ttl,
            json.dumps(session, ensure_ascii=False)
        )
        return session

    async def delete_by_user(self, user_id):
        sid = await self.redis.get(f"user_session:{user_id}")
        if sid:
            s = sid.decode() if isinstance(sid, bytes) else sid
            pipe = self.redis.pipeline()
            pipe.delete(f"session:{s}")
            pipe.delete(f"user_session:{user_id}")
            await pipe.execute()
```

### 8.3 TicketHandler

```python
import httpx
from app.config import APP_SECRET, APP_RETRIEVE_URL

class TicketHandler:
    def __init__(self, session_manager: SessionManager):
        self.sm = session_manager

    async def handle_go(self, ticket: str) -> dict:
        """
        /go?ticket=xxx
        → 调 APP_RETRIEVE_URL 获取 UserSessionVo → 存 Session → 返回 session
        """
        user_vo = await self._retrieve(ticket)
        return await self.sm.create(user_vo)

    async def handle_refresh(self, ticket: str = None, user_id: int = None, app_secret: str = None):
        """
        /refresh（河狸云主动调用）
        有 ticket → 身份切换
        无 ticket → 退出
        """
        if app_secret != APP_SECRET:
            raise ValueError("Invalid appSecret")

        if ticket:
            new_vo = await self._retrieve(ticket)
            return await self.sm.refresh(user_id, new_vo)
        else:
            await self.sm.delete_by_user(user_id)
            return None

    async def _retrieve(self, ticket: str) -> dict:
        """调用河狸云 retrieve 接口获取 UserSessionVo"""
        url = f"{APP_RETRIEVE_URL}?ticket={ticket}&appSecret={APP_SECRET}"
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            return resp.json()
```

### 8.4 路由

```python
from fastapi import APIRouter, Depends, Query
from fastapi.responses import RedirectResponse, HTMLResponse

router = APIRouter()

@router.get("/go")
async def go(ticket: str, sm=Depends(get_session_manager)):
    handler = TicketHandler(sm)
    session = await handler.handle_go(ticket)
    return RedirectResponse(f"/chat?session_id={session['session_id']}")

@router.get("/refresh")
async def refresh(
    userId: int,
    appSecret: str,
    ticket: str = None,
    sm=Depends(get_session_manager)
):
    handler = TicketHandler(sm)
    result = await handler.handle_refresh(ticket=ticket, user_id=userId, app_secret=appSecret)
    return {"status": "refreshed" if result else "exited"}

@router.get("/chat")
async def chat_page(session_id: str = None, sm=Depends(get_session_manager)):
    if not session_id:
        return HTMLResponse("请从河狸云进入AI助手", status_code=403)
    session = await sm.get(session_id)
    if not session:
        return HTMLResponse("会话已过期，请从河狸云重新进入", status_code=403)
    return render_chat_page(session)
```

### 8.5 Adapter 使用 Session headers

```python
# 在现有 Adapter/ConnectorClient 调用 API 时：

async def call_api(self, adapter, method, path, params, session=None):
    url = f"{adapter.base_url}{path}"

    if session and session.get("headers"):
        headers = dict(session["headers"])   # 河狸云打包好的完整请求头
    else:
        headers = self._get_legacy_headers() # 兼容老方式

    if method.upper() == "GET":
        resp = await self.http.get(url, params=params, headers=headers)
    else:
        resp = await self.http.request(method, url, json=params, headers=headers)
    return resp.json()
```

### 8.6 ExecutionLog

```python
async def log_execution(session, user_input, skill, tool, action, input_params, output_data, success, error_msg, duration_ms):
    user_context = {
        "user_id": session.get("user_id"),
        "display_name": session.get("display_name"),
        "ou_name": session.get("ou_name"),
        "ou_type": session.get("ou_type"),
    } if session else None

    await ExecutionLog.create(
        session_id=session.get("session_id") if session else None,
        user_input=user_input,
        skill_id=getattr(skill, 'id', None),
        tool_id=getattr(tool, 'id', None),
        entity_id=getattr(action, 'entity_id', None),
        action_id=getattr(action, 'id', None),
        adapter_id=getattr(action, 'adapter_id', None),
        input_params=input_params,
        output_data=output_data,
        user_context=user_context,
        success=success,
        error_message=error_msg,
        duration_ms=duration_ms,
    )
```

---

## 九、一次性交付检查清单

```
□  1. .env 追加 APP_SECRET + APP_RETRIEVE_URL
□  2. .env.example 同步更新
□  3. config.py 新增读取这两个变量
□  4. 执行全部 ALTER TABLE SQL
□  5. 执行 CREATE TABLE rc_ai_execution_log
□  6. 执行 UPDATE adapter 填充 base_url
□  7. 创建 ExecutionLog Model
□  8. 创建 session/ 目录 + SessionManager + TicketHandler
□  9. 创建 /go + /refresh + /chat 路由
□ 10. Adapter 增加从 Session 获取 headers 的逻辑
□ 11. CallbackEngine 增加 execution_log 记录
□ 12. 验证：现有对话功能完全正常
□ 13. 验证：/go?ticket=mock 创建 Session 并跳转 chat
□ 14. 验证：直接访问 /chat 显示提示页
□ 15. 验证：/refresh 能刷新和销毁 Session
□ 16. 验证：execution_log 有数据
```

---

## 十、Java 团队配合点（仅 2 项）

### 配合点 1：确认 retrieve 返回格式（本周）

```
AI 侧的调用方式已确定：
  curl "{APP_RETRIEVE_URL}?ticket=xxxx&appSecret=Ricent2026"
  即：https://beaver.ricent.com/api/v6/basic/session/retrieve?ticket=xxxx&appSecret=Ricent2026

需确认返回的 JSON：
① 是否就是 UserSessionVo 的完整序列化？
② headers Map 包含哪些 key？
   Authorization? EnterpriseId? MemberId? Content-Type?
③ 是否需要加 enterpriseId / enterpriseName 独立字段？
   （对话中要展示"当前企业名称"给用户时需要）

Mock（Copilot 先用这个）：
{
    "userId": 10001,
    "userName": "zhangsan",
    "displayName": "张三",
    "mobileNo": "13800138000",
    "ouName": "XX监理公司",
    "ouType": 1,
    "headers": {
        "Authorization": "Bearer mock_token",
        "EnterpriseId": "100",
        "MemberId": "200",
        "Content-Type": "application/json"
    }
}
```

### 配合点 2：身份切换/退出时调 /refresh（下周）

```
河狸云需要在切换企业/退出时调用：

切换：GET {AI地址}/refresh?ticket=新ticket&userId=10001&appSecret=Ricent2026
退出：GET {AI地址}/refresh?userId=10001&appSecret=Ricent2026

需确认：
① 河狸云切换/退出时是否已有回调机制？
② AI 地址在河狸云哪里配置？
```

---

## 十一、设计原则速查

```
打平参数：Parameter 表 is_input/is_output，Adapter 内部组装
本体强耦合：Action 属于 Entity，Parameter 可关联 Property
身份河狸云驱动：AI 不判断身份，只存储 headers 并传递
配置外置：APP_SECRET + APP_RETRIEVE_URL 在 .env
两个入口：/admin(内置admin) + /go(河狸云跳转)

自发现预留：generated_by / discovery_status 每表都有
execution_log 三用：证据链 + 自发现反馈 + 小模型训练
兼容性：DEFAULT 值 + 不删表 + 不删代码

将来扩展触发条件：
  一个 Action 多个调用方式 → 加 action_mapping 表
  多宿主不同字段名 → 加 property_mapping 表
  自动发现接口结构 → 加 source_endpoint 表
```

---

## 十二、给 Java 团队的消息

```
Hi Java 团队，

AI Kernel 升级，需要确认 2 点：

【本周】retrieve 接口返回格式
AI 侧调用方式：
  curl "https://beaver.ricent.com/api/v6/basic/session/retrieve?ticket=xxxx&appSecret=Ricent2026"

问题：
1. 返回是否就是 UserSessionVo 的 JSON？
2. headers 里有哪些 key？（Authorization/EnterpriseId/MemberId/其他？）
3. 需要加 enterpriseId/enterpriseName 字段吗？
   还是 headers 里的 EnterpriseId 足够？

【下周】身份切换/退出回调
切换：GET {AI地址}/refresh?ticket=新ticket&userId=xxx&appSecret=Ricent2026
退出：GET {AI地址}/refresh?userId=xxx&appSecret=Ricent2026

问题：AI 地址在河狸云哪里配置？

AI 侧已用 Mock 开发中，确认后几分钟对接完。
```

---

> **文档结束。** 放入 `docs/toAI/05-Copilot执行指南-v6.md`
> 兼容性要求不可违反。够用就好，需要时再扩展。
