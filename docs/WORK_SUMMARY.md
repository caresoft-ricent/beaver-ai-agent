# 河狸云 AI 智能客服门户 —— 系统功能说明与技术实现文档

> 项目代号：beaver-ai-agent
> 仓库地址：`git@gitlab.ricent.com:ricent/beaver-ai-agent.git`（main 分支）
> 最后更新：2026-03-15

---

## 一、项目概述

为东威科技客户打造的 **AI 智能客服门户**，对接河狸云 SaaS 平台。
客户通过对话交互，可以查询产线进度、现场人员等业务数据，系统根据配置的技能和连接器自动识别意图、调用后端服务、返回结构化回答。

**核心设计理念：配置驱动，而非硬编码。**
管理员通过后台配置连接器、业务本体、技能规则，对话引擎运行时动态加载配置来处理用户问题。

---

## 二、技术架构

### 2.1 架构总览

```
┌─────────────────────────────────────────────────────────────┐
│              React 19 + Ant Design 前端 (Vite:3000)         │
│   Dashboard | Chat | 本体管理 | 技能管理 | 大模型配置 | 日志  │
│   流程编排可视化编辑器 (React Flow)                          │
├─────────────────────────────────────────────────────────────┤
│              FastAPI 后端 (Port:8000)                        │
├────────────────────┬────────────────────────────────────────┤
│ 管理 API (admin)   │ 对话 API (v1)                          │
│ - 50+ CRUD 端点    │ - completions (同步)                    │
│ - 配置管理         │ - stream (AG-UI SSE 流式)               │
│ - 认证鉴权         │ - actions, sessions                     │
├────────────────────┴────────────────────────────────────────┤
│                    核心处理层                                 │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ DialogEngine (同步) | StreamEngine (异步SSE)              │ │
│ ├─────────────────────────────────────────────────────────┤ │
│ │ 意图识别 → 实体抽取 → 归一化 → 工具执行 → 回答生成       │ │
│ │ WorkflowExecutor (有向图流程编排)                         │ │
│ ├─────────────────────────────────────────────────────────┤ │
│ │ ContextManager | EvidenceCollector | LLMClient           │ │
│ └─────────────────────────────────────────────────────────┘ │
├────────────────────┬────────────────────────────────────────┤
│ SQLAlchemy ORM     │ ConnectorClient (外部调用)              │
├────────┬───────────┴────────────────────────────────────────┤
│ MySQL 8.0 (Docker:13306)  │  Redis 7 (Docker:16379)         │
│ - 17张表配置驱动           │  - 会话缓存(预留)                │
└───────────────────────────┴──────────────────────────────────┘
```

### 2.2 技术选型

| 层次 | 技术选型 | 版本 | 说明 |
|------|---------|------|------|
| 前端框架 | React + TypeScript | 19.2.4 / 5.9 | SPA 管理后台 + 对话页面 |
| UI 组件库 | Ant Design | 6.3.2 | 全量企业组件 |
| 构建工具 | Vite | 8.x | 极速 HMR 开发 |
| 路由 | react-router-dom | 7.13.1 | 声明式路由 |
| 流程编辑器 | @xyflow/react (React Flow) | 12.10.1 | 可视化有向图编辑 |
| HTTP 客户端 | axios | 1.13.6 | 封装 API 请求 |
| Markdown | react-markdown | 10.1.0 | AI 回答中 Markdown 渲染 |
| 后端框架 | FastAPI | - | RESTful API + SSE 流式 |
| ORM | SQLAlchemy + Alembic | - | 数据模型 + 迁移 |
| 数据校验 | Pydantic v2 | - | 请求/响应结构化校验 |
| 数据库 | MySQL | 8.0 | Docker 运行，端口 13306 |
| 缓存 | Redis | 7 | Docker 运行，端口 16379 |

---

## 三、功能模块详解

### 3.1 管理后台（12 个页面）

| 页面 | 路由 | 功能说明 |
|------|------|---------|
| 登录 | `/login` | 用户名密码登录，JWT 鉴权，首次访问自动引导初始化管理员 |
| 仪表盘 | `/` | 实时统计卡片：租户数 / 连接器 / 大模型 / 业务本体 / 已发布技能 |
| 租户管理 | `/tenants` | 多租户 CRUD，搜索、分页、状态切换 |
| 连接器配置 | `/connectors` | 河狸云 API 连接配置，Mock 开关，认证方式，连接测试 |
| 大模型配置 | `/llm` | LLM 提供商选择、模型配置、API Key 管理、模型在线测试 |
| 业务本体 | `/ontology` | 实体定义 + 属性管理 + 操作管理 + 连接器关联 + 发布管理 |
| 技能/意图 | `/intents` | 意图规则（关键词 + 正则 + 回答模板）、工具链管理、发布管理 |
| 流程编排 | `/intents/:id/workflow` | 全屏可视化有向图编辑器，拖拽节点、连线编排、JSON 导出/导入 |
| 对话测试 | `/chat` | 完整聊天界面，会话管理，意图标签展示，快捷引导 |
| 独立聊天 | `/chat-embed` | iframe 可嵌入的独立对话界面，支持租户/客户参数 |
| 日志查询 | `/logs` | 动作日志、消息日志、错误日志三类查询 |
| 归一化规则 | `/normalization` | 日期短语 / 状态映射 / 参数转换规则维护 |

### 3.2 流程编排器（重点模块）

全屏可视化流程编辑器，基于 React Flow v12 实现，商业级 UI 设计。

**六种节点类型：**

| 节点类型 | 配色 | 功能 |
|---------|------|------|
| 工具调用 (tool_call) | #2563EB 蓝色 | 调用本体操作 / 外部 API |
| 条件判断 (condition) | #F59E0B 琥珀色 | 多条件分支路由，支持默认分支 |
| 并行执行 (parallel) | #7C3AED 紫色 | 同时执行多个子节点 |
| 用户确认 (confirm) | #10B981 翠绿色 | 暂停流程，等待用户确认/拒绝 |
| AI 生成 (llm_call) | #EC4899 粉色 | 调用大模型生成文本 |
| 文本回复 (reply) | #06B6D4 青色 | 模板文本直接输出 |

**编辑器特性：**

- **节点卡片**：220px 宽度、12px 圆角、顶部 4px 色带、白底阴影、左输入/右输出端口
- **左侧面板**：240px 可折叠至 48px 图标模式，分组（流程控制 / 交互与输出）、节点搜索、拖拽添加
- **画布交互**：点阵网格背景、贝塞尔曲线连线、框选、吸附网格、右键上下文菜单
- **快捷键**：Ctrl/Cmd+D 复制节点、Delete/Backspace 删除节点
- **右侧属性面板**：色带头部、节点 ID 展示、表单编辑、节点选择器显示名称
- **工具栏**：返回、保存、JSON 导出/导入、操作帮助

### 3.3 对话引擎

#### 同步引擎 (DialogEngine)

```
用户输入
  → Step 1: 加载上下文（会话历史、实体、turn_count）
  → Step 2: 意图识别
      - 规则匹配：关键词得分排序 + 正则匹配
      - LLM 兜底：规则无匹配时调用大模型
  → Step 3: 实体抽取 + 归一化 + 参数转换
  → Step 4: 加载工具链（技能关联的本体操作）
  → Step 5: 工具执行
      - 简单技能：按工具链顺序执行
      - 流程技能：由 WorkflowExecutor 执行有向图
  → Step 6: 回答生成（模板 / LLM / 文本格式化）
  → 返回结果 + 保存上下文
```

**意图匹配算法：**
- 基础得分 0.7，每命中一个关键词 +0.1，上限 0.98
- 正则匹配得分 0.9（与关键词可叠加取高）
- 多候选按得分降序，取最高
- 意图切换检测：本轮意图与上轮不同时清除旧实体

#### 流式引擎 (StreamEngine)

遵循 AG-UI SSE 协议，事件流：

```
RUN_STARTED
  → STEP_STARTED(intent_recognition) → CUSTOM(意图结果)
  → STEP_STARTED(entity_extraction)
  → STEP_STARTED(tool_execution)
    → TOOL_CALL_START → TOOL_CALL_ARGS → TOOL_CALL_END → TOOL_CALL_RESULT
  → STEP_STARTED(reply_generation)
    → TEXT_MESSAGE_START → TEXT_MESSAGE_CONTENT(流式文本片段) → TEXT_MESSAGE_END
  → STEP_FINISHED
RUN_FINISHED
```

支持：实体抽取、参数归一化、槽位校验（追问缺失字段）、上下文摘要（turn_count > 20）、证据链记录。

#### 流程编排引擎 (WorkflowExecutor)

```
有向图遍历：start_node → 执行当前节点 → 按 next 跳转 → 直到无下一节点或达到最大步数
```

- **tool_call**：通过连接器调用外部 API，结果存入 `tool_results[node_id]`
- **condition**：按 `field` 取值依次匹配分支条件，走 `branches[].next` 或 `default_next`
- **parallel**：并行执行 `parallel_nodes` 列表中的所有节点
- **confirm**：暂停流程设置 `paused=true`，等待用户确认后继续或走 `reject_next`
- **llm_call**：调用 LLM 生成文本，prompt 支持模板变量 `${tool_results.node_1.xxx}`
- **reply**：直接输出文本，支持模板替换
- 防死循环：MAX_STEPS=50

### 3.4 归一化引擎

三种规则类型：

| 类型 | 说明 | 示例 |
|------|------|------|
| 日期短语 | 将自然语言日期转换为标准日期 | "上个月" → 2026-02-01~2026-02-28 |
| 状态映射 | 将口语化状态映射到系统枚举值 | "在做了" → "进行中" |
| 参数转换 | 将抽取的实体值转换为 API 所需格式 | 产线编号格式化 |

---

## 四、数据模型（17 张表）

| 表名 | 模型类 | 用途 | 关键字段 |
|------|--------|------|---------|
| ai_tenant | Tenant | 租户基础信息 | id, name, code, status, config |
| ai_tenant_api_key | TenantApiKey | 租户 API 密钥 | tenant_id, api_key, api_secret |
| ai_llm_config | LLMConfig | 大模型配置 | tenant_id, provider, model_name, api_url, usage |
| ai_connector | Connector | 连接器配置 | tenant_id, name, base_url, auth_type, mock_enabled |
| ai_base_property | BaseProperty | 基础属性模板 | tenant_id, code, type, name, title |
| ai_entity | Entity | 业务本体 | tenant_id, entity_code, entity_name, connector_id, status |
| ai_entity_property | EntityProperty | 本体属性 | entity_id, name, type, is_input, is_output |
| ai_entity_relation | EntityRelation | 本体关系 | entity_id_a, entity_id_b, relation_type |
| ai_action | Action | 本体操作 | entity_id, action_code, http_method, api_path |
| ai_action_parameter | ActionParameter | 操作参数 | action_id, param_name, param_type |
| ai_skill | Skill | 技能/意图 | tenant_id, skill_code, skill_name, match_keywords, workflow_config |
| ai_skill_tool | SkillTool | 技能工具关联 | skill_id, entity_id, action_id, tools_mode, config |
| ai_chat_session | ChatSession | 对话会话 | session_id, tenant_id, customer_id, message_count |
| ai_chat_message | ChatMessage | 消息记录 | session_id, role, content, intent, entities |
| ai_action_log | ActionLog | 动作日志 | session_id, action_type, status, result, error_message |
| ai_admin_user | AdminUser | 管理员 | username, password_hash, role, status |
| ai_normalization_rule | NormalizationRule | 归一化规则 | tenant_id, category, rule_code, pattern, config |

---

## 五、API 接口清单

### 5.1 管理端接口 (`/api/admin/*` — 需 JWT 鉴权)

| 类别 | 方法 | 路由 | 功能 |
|------|------|------|------|
| 认证 | POST | `/auth/login` | 用户登录，返回 JWT |
| | POST | `/auth/init` | 初始化管理员账号 |
| | POST | `/auth/change-password` | 修改密码 |
| 统计 | GET | `/stats` | 仪表盘统计数据 |
| 租户 | GET/POST | `/tenants` | 列表（分页+搜索） / 创建 |
| | GET/PUT/DELETE | `/tenants/{id}` | 详情 / 更新 / 删除 |
| 连接器 | GET/POST | `/connectors` | 列表 / 创建 |
| | GET/PUT/DELETE | `/connectors/{id}` | 详情 / 更新 / 删除 |
| | POST | `/connectors/{id}/test` | 连接测试 |
| 大模型 | GET/POST | `/llm-configs` | 列表 / 创建 |
| | GET/PUT/DELETE | `/llm-configs/{id}` | 详情 / 更新 / 删除 |
| | POST | `/llm-configs/{id}/test` | 模型测试 |
| 本体 | GET/POST | `/ontologies/entities` | 实体列表 / 创建 |
| | GET/PUT/DELETE | `/ontologies/entities/{id}` | 详情 / 更新 / 删除 |
| | POST | `/ontologies/entities/{id}/publish` | 发布实体 |
| | CRUD | 属性 & 关系端点 | 属性管理、关系管理 |
| | GET/POST | `/ontologies/entities/{id}/actions` | 操作列表 / 创建 |
| | GET/POST | `/ontologies/actions/{id}/parameters` | 参数列表 / 创建 |
| | GET/POST | `/ontologies/base-properties` | 基础属性列表 / 创建 |
| 技能 | GET/POST | `/intents` | 技能列表 / 创建 |
| | GET/PUT/DELETE | `/intents/{id}` | 详情 / 更新 / 删除 |
| | POST | `/intents/{id}/publish` | 发布技能 |
| | CRUD | 工具链端点 | 技能工具关联管理 |
| 日志 | GET | `/logs/action-logs` | 动作日志列表 |
| | GET | `/logs/message-logs` | 消息日志列表 |
| | GET | `/logs/error-logs` | 错误日志列表 |
| | DELETE | `/logs/clear` | 清除日志 |
| 归一化 | GET/POST | `/normalization` | 规则列表 / 创建 |
| | GET/PUT/DELETE | `/normalization/{id}` | 详情 / 更新 / 删除 |
| | GET | `/normalization/categories` | 规则分类列表 |
| | POST | `/normalization/initialize` | 初始化默认规则 |

### 5.2 对话端接口 (`/api/v1/chat/*`)

| 方法 | 路由 | 功能 |
|------|------|------|
| POST | `/completions` | 对话主接口（同步） |
| POST | `/stream` | 流式对话（AG-UI SSE） |
| POST | `/actions` | 执行动作 |
| GET | `/sessions` | 会话列表（分页） |
| GET | `/sessions/{session_id}/history` | 会话历史消息 |
| DELETE | `/sessions/{session_id}` | 删除会话 |

---

## 六、项目目录结构

```
beaver-ai-agent/
├── docker-compose.yml              # MySQL + Redis 容器编排
├── .env                            # 环境变量配置
├── docs/                           # 项目文档
│   ├── WORK_SUMMARY.md             # 系统功能说明与技术文档（本文件）
│   ├── 使用手册.md                  # 系统使用手册
│   ├── usage-guide.md              # 快速启动指南
│   ├── tool-design.md              # 工具设计文档
│   ├── 河狸云API对接指南.md         # API 对接步骤
│   ├── 河狸云API对接方案.md         # 技术对接方案
│   └── 流程编排器UI优化-Copilot提示词.md  # 编排器UI设计规范
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI 入口
│   │   ├── config.py               # 配置读取
│   │   ├── database.py             # SQLAlchemy 连接
│   │   ├── models/                 # 数据模型（17 张表）
│   │   │   ├── tenant.py           # 租户 + API Key
│   │   │   ├── config.py           # LLM 配置 + 连接器
│   │   │   ├── ontology.py         # 实体 + 属性 + 关系
│   │   │   ├── action.py           # 操作 + 参数
│   │   │   ├── intent.py           # 技能 + 工具链
│   │   │   ├── chat.py             # 会话 + 消息 + 日志
│   │   │   ├── admin.py            # 管理员 + 操作日志
│   │   │   └── normalization.py    # 归一化规则
│   │   ├── schemas/                # Pydantic 请求/响应 Schema
│   │   ├── api/
│   │   │   ├── admin/              # 管理后台接口（50+端点）
│   │   │   └── v1/                 # 客户对话接口
│   │   ├── core/
│   │   │   ├── engine.py           # 同步对话引擎
│   │   │   ├── stream_engine.py    # 流式对话引擎 (AG-UI SSE)
│   │   │   └── workflow_engine.py  # 流程编排执行引擎
│   │   └── clients/
│   │       ├── llm_client.py       # LLM 调用封装
│   │       ├── connector_client.py # 连接器调用封装
│   │       └── beaver_cloud.py     # 河狸云 API 专用客户端
│   ├── scripts/
│   │   └── seed_demo.py            # 演示数据脚本（幂等）
│   ├── alembic/                    # 数据库迁移
│   └── requirements.txt
└── frontend/
    ├── src/
    │   ├── App.tsx                 # 路由配置（含认证守卫）
    │   ├── layouts/
    │   │   └── AdminLayout.tsx     # 管理后台侧边栏布局
    │   ├── pages/                  # 12 个页面
    │   │   ├── Login.tsx           # 登录页
    │   │   ├── Dashboard.tsx       # 仪表盘
    │   │   ├── TenantList.tsx      # 租户管理
    │   │   ├── ConnectorList.tsx   # 连接器管理
    │   │   ├── LLMConfigList.tsx   # 大模型配置
    │   │   ├── EntityList.tsx      # 业务本体管理
    │   │   ├── SkillList.tsx       # 技能/意图管理
    │   │   ├── WorkflowPage.tsx    # 流程编排页面（全屏）
    │   │   ├── ChatPage.tsx        # 对话测试
    │   │   ├── ChatEmbed.tsx       # 独立聊天（iframe）
    │   │   ├── LogsPage.tsx        # 日志查询
    │   │   └── NormalizationPage.tsx  # 归一化规则
    │   ├── components/
    │   │   └── WorkflowEditor.tsx  # 流程编排可视化编辑器组件
    │   └── api/
    │       ├── client.ts           # Axios HTTP 客户端
    │       └── admin.ts            # 管理 API 封装
    ├── vite.config.ts              # Vite 配置 + API 代理
    └── package.json
```

---

## 七、运行与部署

### 7.1 前置条件

- macOS / Linux
- Docker（MySQL + Redis）
- Python 3.9+
- Node.js 18+

### 7.2 启动步骤

```bash
# 1. 克隆仓库
git clone git@gitlab.ricent.com:ricent/beaver-ai-agent.git
cd beaver-ai-agent

# 2. 启动数据库
docker compose up -d

# 3. 启动后端
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# 4. 插入演示数据（首次）
python3 scripts/seed_demo.py

# 5. 启动前端
cd ../frontend
npm install
npm run dev
# 访问 http://localhost:3000
```

### 7.3 数据库连接

| 项目 | 值 |
|------|---|
| Host | 127.0.0.1 |
| Port | 13306 |
| User | root |
| Password | beaver2026 |
| Database | beaver_ai |

### 7.4 首次登录

1. 打开 `http://localhost:3000/login`
2. 系统提示初始化管理员（设置用户名密码）
3. 登录后进入仪表盘

### 7.5 数据库迁移

```bash
cd backend
alembic revision --autogenerate -m "描述"
alembic upgrade head
```

---

## 八、已验证的对话场景

| 用户输入 | 匹配技能 | 预期结果 |
|---------|---------|---------|
| "帮我看看交货进度" | QUERY_PROGRESS | 返回 3 条产线数据 |
| "驻厂人员都有谁" | QUERY_STAFF | 返回 3 名人员信息 |
| "25B1339-G产线的驻厂人员有哪些" | QUERY_STAFF | 正确消歧（多关键词胜出） |
| "你好" / "谢谢" | CHITCHAT | 友好问候 + 功能引导 |
| "今天天气怎么样" | 无匹配 | 提示无法理解 + 推荐功能 |

---

## 九、后续规划

| 优先级 | 任务 | 说明 |
|--------|------|------|
| P0 | 对接河狸云真实 API | 需要河狸云团队提供 API Key，详见对接指南 |
| P0 | 接入真实 LLM | 配置 API Key 后意图识别和回复将由大模型处理 |
| P1 | 投诉/反馈技能 | 新增投诉提交、返修申请等写操作技能 |
| P2 | 权限体系 | 基于租户的权限控制，API Key 鉴权 |
| P2 | 流程编排调试模式 | 可视化单步执行 + 变量查看 |
| P3 | 监控报表 | 对话量 / 意图分布 / 响应时间等运营数据 |
| P3 | 版本历史 | 流程编排文件的版本对比与回滚 |
