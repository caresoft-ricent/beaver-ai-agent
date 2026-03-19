# Beaver-AI-Agent Copilot 执行指南（最终版 v5）

> **版本**：v5.0
> **更新**：2026-03-19
> **用途**：Copilot 每个新会话的完整上下文

---

## 一、项目定位

beaver-ai-agent（AI Kernel）是独立运行的企业级 Agent 平台，以 Ontology 驱动，承载河狸云及未来更多宿主系统的 AI 场景。

**两个系统的关系**：
- 河狸云（Java）= System of Record，负责业务数据、权限、身份、API
- AI Kernel（Python）= System of Intelligence，负责语义理解、本体建模、对话编排、证据链

**三阶段路线**：
1. 当前：Skill/Tool 手动配置驱动（已完成，效果不错）
2. 中期：ContextEngine + 本体 DAG 自动发现 Skill/Tool
3. 远期：LLM 解析 API 文档/数据字典自动生成本体（半自动 + 人工审核）

**市场对标**：Palantir AIP（Ontology 驱动 Agent）、Salesforce Semantic Layer、MCP 协议

---

## 二、核心设计哲学

```
1. 打平参数：Action 输入输出统一为扁平 key-value（rc_ai_action_parameter 表）
   无论底层 WebAPI 还是数据库，Kernel 看到的格式一样
   Adapter 内部负责组装成具体请求格式

2. 本体强耦合：Action 属于 Entity（entity_id FK）
   Parameter 通过 property_id 关联回本体属性
   一个 Action 的语义 = 它属于哪个 Entity + 它的 Parameter 列表

3. 身份由河狸云驱动：AI Kernel 不自主切换身份
   河狸云提供 UserSessionVo（含 headers）
   AI 侧只存储和使用，Adapter 调 API 直接用 session.headers

4. 最少改动：扩展现有表 + 只新建 1 张 execution_log
   现有配置成果完全保留

5. 一次性交付：全部改完统一验证，预计 3-5 天
```

---

## 三、系统入口模型

系统有两个独立入口，互不干扰：

### 后台管理（/admin）
- 用系统内置 admin 账号登录（用户名密码）
- 做本体配置（Entity / Property / Relation / Action / Parameter）
- 做 Skill / Tool / Adapter 配置
- 查看 execution_log
- **不涉及河狸云身份体系**

### Chat 对话（/go?ticket=xxx）
- **唯一入口**：必须从河狸云跳转过来，携带 ticket
- 没有独立登录页——直接访问 chat URL 时显示提示「请从河狸云进入」
- ticket 换取 Session 后进入对话界面
- Session 过期后同样提示「请从河狸云重新进入」

---

## 四、身份模型

### 4.1 河狸云提供的 UserSessionVo

```java
public class UserSessionVo {
    private Long userId;              // 用户Id
    private String userName;          // 登录名
    private String displayName;       // 姓名
    private String mobileNo;          // 手机号
    private String ouName;            // 组织名称
    private Integer ouType;           // 组织类型：1监理 2施工 8甲方
    private Map<String, String> headers;  // 请求头（Adapter 调 API 直接用）
}
```

**headers 设计要点**：
- 河狸云把 Adapter 调 API 需要的所有请求头打包好（Authorization、EnterpriseId、MemberId 等）
- AI 侧调用任何河狸云 API 时直接注入 `session.headers`，不拼不改
- 身份切换时河狸云刷新 headers 内容，AI 侧只管替换存储

### 4.2 身份流程

```
登录 → 河狸云前端点击「AI助手入口」
     → 河狸云后端创建票据
     → 跳转 AI 后端 /go?ticket=xxx
     → AI 后端用 ticket 调河狸云 retrieve
     → 河狸云返回 UserSessionVo（含 headers）
     → AI 后端存入 Redis Session
     → 跳转 Chatbox

切换身份 → 河狸云后端调 AI 后端 /refresh?ticket=新ticket&userId=xxx&appSecret=xxx
         → AI 后端用新 ticket 重新调 retrieve
         → 拿到新的 UserSessionVo（含新 headers）
         → 替换 Redis Session

退出 → 河狸云后端调 AI 后端 /refresh?userId=xxx&appSecret=xxx（无 ticket）
     → AI 后端销毁 Redis Session
```

**核心原则**：AI 侧不做任何身份判断，全部由河狸云驱动。

### 4.3 Session 数据结构（Redis）

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

不存时间戳，Redis TTL 管理过期（默认 24 小时）。

---

## 五、兼容性硬性要求

```
1. 所有 ALTER TABLE 新增字段必须有 DEFAULT 值 → 现有数据自动兼容
2. 不删除任何现有表、字段、代码
3. 现有 Skill/Tool/Action/Adapter 配置完全保留，效果不变
4. execution_log 是纯新增，不影响现有流程
5. Session 模块是纯新增，不修改现有鉴权逻辑
6. Adapter 获取 headers 增加从 Session 读取的能力，保留老方式兼容
```

---

## 六、数据库改造（一次性执行）

### 6.1 全部 SQL

```sql
-- ================================================================
--  一次性执行，所有 DEFAULT 值确保现有数据自动兼容
--  执行后启动系统，现有功能必须完全正常
-- ================================================================

-- rc_ai_entity
ALTER TABLE rc_ai_entity
    ADD COLUMN IF NOT EXISTS generated_by ENUM('manual','llm','api_sync','domain_auto') DEFAULT 'manual' COMMENT '数据来源',
    ADD COLUMN IF NOT EXISTS confidence DECIMAL(3,2) DEFAULT 1.00 COMMENT '可信度',
    ADD COLUMN IF NOT EXISTS discovery_status ENUM('draft','reviewed','published') DEFAULT 'published' COMMENT '审核状态',
    ADD COLUMN IF NOT EXISTS version INT DEFAULT 1 COMMENT '版本号';

-- rc_ai_entity_property
ALTER TABLE rc_ai_entity_property
    ADD COLUMN IF NOT EXISTS semantic_role ENUM('identifier','status','scope','timestamp','metric','label','content') DEFAULT NULL COMMENT '语义角色',
    ADD COLUMN IF NOT EXISTS enum_values JSON DEFAULT NULL COMMENT '枚举值 [{"value":"1","label":"待处理"}]',
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

-- rc_ai_adapter（扩展为宿主系统注册）
ALTER TABLE rc_ai_adapter
    ADD COLUMN IF NOT EXISTS adapter_type ENUM('webapi','database') DEFAULT 'webapi' COMMENT '适配器类型',
    ADD COLUMN IF NOT EXISTS base_url VARCHAR(500) DEFAULT NULL COMMENT 'API基地址',
    ADD COLUMN IF NOT EXISTS auth_config JSON DEFAULT NULL COMMENT '鉴权配置',
    ADD COLUMN IF NOT EXISTS db_config JSON DEFAULT NULL COMMENT '数据库配置',
    ADD COLUMN IF NOT EXISTS openapi_url VARCHAR(500) DEFAULT NULL COMMENT 'OpenAPI文档地址（远期）',
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

-- ================================================================
--  新建执行日志表
-- ================================================================
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
    user_context JSON COMMENT '用户上下文（不含headers敏感信息）',
    success BOOLEAN COMMENT '是否成功',
    error_message TEXT DEFAULT NULL,
    duration_ms INT DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_session (session_id),
    INDEX idx_action (action_id),
    INDEX idx_success_created (success, created_at)
) COMMENT='执行日志（证据链 + 自发现反馈 + 小模型训练数据）';
```

### 6.2 数据补充

```sql
-- 填充河狸云 adapter 的连接信息
UPDATE rc_ai_adapter SET
    adapter_type = 'webapi',
    base_url = 'https://beaver.ricent.com',
    auth_config = '{"type":"appSecret","appSecret":"实际值","retrieve_url":"/api/v6/basic/session/retrieve"}',
    status = 'active'
WHERE adapter_name = '河狸云';

-- 按需标记 mutation 类 Action
-- UPDATE rc_ai_action SET action_type='mutation', requires_confirmation=TRUE WHERE code IN ('close','assign');
```

---

## 七、代码实现

### 7.1 新增文件

```
backend/app/
├── session/
│   ├── __init__.py
│   ├── session_manager.py    # Redis Session CRUD
│   └── ticket_handler.py     # /go + /refresh
├── models/
│   └── execution_log.py      # SQLAlchemy Model
└── api/
    └── session_routes.py     # /go, /refresh 路由
```

### 7.2 SessionManager

```python
import json, uuid
from datetime import timedelta
from redis import asyncio as aioredis

class SessionManager:
    def __init__(self, redis: aioredis.Redis, ttl_hours: int = 24):
        self.redis = redis
        self.ttl = timedelta(hours=ttl_hours)

    async def create(self, user_vo: dict, ticket: str) -> dict:
        """从河狸云 UserSessionVo 创建 Session"""
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
        ttl_sec = int(self.ttl.total_seconds())
        await self.redis.setex(f"session:{session_id}", ttl_sec, json.dumps(session, ensure_ascii=False))
        await self.redis.setex(f"user_session:{session['user_id']}", ttl_sec, session_id)
        return session

    async def get(self, session_id: str) -> dict | None:
        data = await self.redis.get(f"session:{session_id}")
        return json.loads(data) if data else None

    async def get_by_user(self, user_id) -> dict | None:
        sid = await self.redis.get(f"user_session:{user_id}")
        return await self.get(sid.decode() if isinstance(sid, bytes) else sid) if sid else None

    async def refresh(self, user_id, new_vo: dict):
        """河狸云驱动的身份刷新：替换 Session 内容（含新 headers）"""
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
        ttl_sec = int(self.ttl.total_seconds())
        await self.redis.setex(f"session:{session['session_id']}", ttl_sec, json.dumps(session, ensure_ascii=False))
        return session

    async def delete_by_user(self, user_id):
        sid = await self.redis.get(f"user_session:{user_id}")
        if sid:
            s = sid.decode() if isinstance(sid, bytes) else sid
            await self.redis.delete(f"session:{s}", f"user_session:{user_id}")
```

### 7.3 TicketHandler

```python
class TicketHandler:
    def __init__(self, session_manager: SessionManager):
        self.sm = session_manager

    async def handle_go(self, ticket: str) -> dict:
        """
        /go?ticket=xxx
        → 调河狸云 retrieve → 存 Session → 返回 session_id（前端跳转 chat）
        """
        adapter = await self._get_beaver_adapter()
        auth = adapter.auth_config
        url = f"{adapter.base_url}{auth['retrieve_url']}?ticket={ticket}&appSecret={auth['appSecret']}"
        user_vo = await http_get(url)
        return await self.sm.create(user_vo, ticket)

    async def handle_refresh(self, ticket: str = None, user_id: int = None, app_secret: str = None):
        """
        /refresh（河狸云主动调用，AI 侧被动接收）
        有 ticket → 身份切换
        无 ticket → 退出
        """
        adapter = await self._get_beaver_adapter()
        if app_secret != adapter.auth_config.get("appSecret"):
            raise AuthError("Invalid appSecret")

        if ticket:
            auth = adapter.auth_config
            url = f"{adapter.base_url}{auth['retrieve_url']}?ticket={ticket}&appSecret={auth['appSecret']}"
            new_vo = await http_get(url)
            return await self.sm.refresh(user_id, new_vo)
        else:
            await self.sm.delete_by_user(user_id)
            return None

    async def _get_beaver_adapter(self):
        return await AdapterModel.query.filter_by(adapter_type='webapi', status='active').first()
```

### 7.4 路由

```python
# backend/app/api/session_routes.py

@router.get("/go")
async def go(ticket: str, session_manager=Depends(get_session_manager)):
    """河狸云跳转入口 → 创建 Session → 重定向到 chat 页面"""
    handler = TicketHandler(session_manager)
    session = await handler.handle_go(ticket)
    # 重定向到 chat 页面，携带 session_id
    return RedirectResponse(f"/chat?session_id={session['session_id']}")

@router.get("/refresh")
async def refresh(
    userId: int,
    appSecret: str,
    ticket: str = None,
    session_manager=Depends(get_session_manager)
):
    """河狸云回调 → 刷新或销毁 Session"""
    handler = TicketHandler(session_manager)
    result = await handler.handle_refresh(ticket=ticket, user_id=userId, app_secret=appSecret)
    if result:
        return {"status": "refreshed", "session_id": result["session_id"]}
    else:
        return {"status": "exited"}
```

### 7.5 Chat 页面入口保护

```python
# chat 页面的前置校验中间件或路由守卫

@router.get("/chat")
async def chat_page(session_id: str = None, session_manager=Depends(get_session_manager)):
    if not session_id:
        return HTMLResponse("请从河狸云进入AI助手", status_code=403)

    session = await session_manager.get(session_id)
    if not session:
        return HTMLResponse("会话已过期，请从河狸云重新进入", status_code=403)

    # 正常渲染 chat 页面
    return render_chat_page(session)
```

### 7.6 Adapter 使用 Session headers

```python
# 在现有 Adapter/ConnectorClient 中增强 headers 获取方式

async def call_api(self, adapter, method, path, params, session=None):
    url = f"{adapter.base_url}{path}"

    if session and session.get("headers"):
        # 优先：从 Session 获取河狸云打包好的完整 headers
        headers = dict(session["headers"])
    else:
        # 兼容：无 Session 时用老方式
        headers = self._get_legacy_headers()

    if method.upper() == "GET":
        resp = await self.http.get(url, params=params, headers=headers)
    else:
        resp = await self.http.request(method, url, json=params, headers=headers)

    return resp.json()
```

### 7.7 ExecutionLog 记录

```python
async def log_execution(session, user_input, skill, tool, action, input_params, output_data, success, error_msg, duration_ms):
    """嵌入 CallbackEngine 流程，异步写入，不阻塞主流程"""
    # user_context 不含 headers（避免存储敏感鉴权信息）
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

## 八、一次性交付检查清单

```
□  1. 执行全部 ALTER TABLE SQL
□  2. 执行 CREATE TABLE rc_ai_execution_log
□  3. 执行 UPDATE 填充 adapter 扩展字段
□  4. 创建 ExecutionLog SQLAlchemy Model
□  5. 创建 session/ 目录 + SessionManager + TicketHandler
□  6. 创建 /go 和 /refresh 路由
□  7. 创建 /chat 入口保护（无 session 则提示从河狸云进入）
□  8. Adapter 增加从 Session 获取 headers 的逻辑（保留老逻辑兼容）
□  9. CallbackEngine 增加 execution_log 记录
□ 10. 验证：启动系统，现有对话功能完全正常（admin 后台 + 已有配置）
□ 11. 验证：/go?ticket=mock_ticket 创建 Session 并跳转 chat
□ 12. 验证：直接访问 /chat 显示「请从河狸云进入」
□ 13. 验证：execution_log 表有数据写入
□ 14. 验证：/refresh 能刷新和销毁 Session
```

预计工作量：**3-5 天**（一个开发者一次性完成）

---

## 九、Java 团队配合点（仅 2 项）

### 配合点 1：确认 retrieve 返回格式（本周内）

```
接口：GET /api/v6/basic/session/retrieve?ticket=xxx&appSecret=xxx

需确认：
① 返回 JSON 是否就是 UserSessionVo 的序列化？
② headers Map 包含哪些 key？
   （Authorization? EnterpriseId? MemberId? Content-Type? 其他?）
③ ouType 枚举：1=监理 2=施工 8=甲方，还有其他值吗？
④ 是否需要在 UserSessionVo 加 enterpriseId / enterpriseName 独立字段？
   （还是 headers 里的 EnterpriseId 足够？
     AI 对话中需要展示"当前企业名称"的话，需要 enterpriseName）

Mock 数据（Copilot 先用这个开发）：
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

### 配合点 2：身份切换/退出时调用 AI 的 /refresh（下周）

```
切换身份时：
  GET {AI后端地址}/refresh?ticket=新ticket&userId=10001&appSecret=xxx

退出时：
  GET {AI后端地址}/refresh?userId=10001&appSecret=xxx

需确认：
① 河狸云切换企业/退出时是否已有回调机制？
② AI 后端地址在河狸云哪里配置？
③ appSecret 的值从哪里获取？
```

### Copilot 不等 Java 的策略

```
全部用 Mock 数据开发和自测
等 Java 确认后：
  - retrieve 格式：确认字段名是否一致，不一致则改映射（几分钟）
  - refresh 回调：配置 AI 后端地址给河狸云（一个配置项）
```

---

## 十、设计原则速查

```
打平参数：
  Action 输入输出 = Parameter 表 is_input/is_output 行
  Adapter 内部组装请求格式，Kernel 不关心

本体强耦合：
  Action 属于 Entity（entity_id FK）
  Parameter 可关联 Entity Property（property_id FK）

身份由河狸云驱动：
  AI 不做身份切换判断
  Session 存 UserSessionVo + headers
  Adapter 直接用 session.headers

两个入口：
  /admin → 内置 admin 账号 → 配置管理
  /go?ticket=xxx → 河狸云跳转 → Chat 对话

自发现预留：
  每张表有 generated_by / discovery_status
  现有数据 = manual + published
  将来自动生成 = llm/domain_auto + draft

execution_log 三重用途：
  ① 证据链 ② 自发现反馈 ③ 小模型训练数据

兼容性：
  所有新字段有 DEFAULT 值
  不删表不删字段不删代码
  现有功能零影响

将来扩展触发条件：
  一个 Action 绑多个调用方式 → 加 action_mapping 表
  多宿主不同字段名 → 加 property_mapping 表
  自动发现接口结构 → 加 source_endpoint 表
  当前不需要，不提前建
```

---

## 十一、给 Java 团队的消息（可直接复制）

```
Hi Java 团队，

AI Kernel 升级中，需要确认 2 个点：

【本周内确认】retrieve 接口返回格式
接口：GET /api/v6/basic/session/retrieve?ticket=xxx&appSecret=xxx
问题：
1. 返回 JSON 是否就是 UserSessionVo 的完整序列化？
2. headers Map 包含哪些 key？
3. 是否需要加 enterpriseId/enterpriseName 独立字段？
   （对话中要展示"当前企业"给用户看的话需要）

【下周确认】身份切换/退出回调
问题：
1. 河狸云切换企业/退出时，是否已有回调外部系统的机制？
2. AI 后端地址（/refresh）在河狸云哪里配置？
3. appSecret 的值从哪里配置和获取？

AI 侧已用 Mock 数据并行开发，不阻塞。确认后几分钟对接完成。
```

---

> **文档结束。** 放入 `docs/toAI/05-Copilot执行指南-v5.md`
> 每个 Copilot 新会话作为上下文输入。
> 兼容性要求不可违反。够用就好，需要时再扩展。
