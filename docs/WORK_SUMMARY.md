# 河狸云 AI 智能客服门户 —— 开发工作总结

> 项目代号：beaver-ai-agent  
> 仓库地址：`git@gitlab.ricent.com:ricent/beaver-ai-agent.git`（main 分支）  
> 截止日期：2026-03-14

---

## 一、项目概述

为东威科技客户打造的 **AI 智能客服门户**，对接河狸云 SaaS 平台。  
客户通过对话交互，可以查询产线进度、现场人员等业务数据，系统根据配置的技能和连接器自动识别意图、调用后端服务、返回结构化回答。

**核心设计理念：配置驱动，而非硬编码。**  
管理员通过后台配置连接器、业务本体、技能规则，对话引擎运行时动态加载配置来处理用户问题。

---

## 二、技术架构

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────┐
│  React + Antd    │────▶│  FastAPI (8000)   │────▶│  MySQL 8.0   │
│  Vite (3000)     │ /api│  对话引擎 + 管理API │     │  (Docker:13306)│
└──────────────────┘     └────────┬─────────┘     └──────────────┘
                                  │
                         ┌────────▼─────────┐
                         │   Redis 7        │
                         │  (Docker:16379)  │
                         └──────────────────┘
```

| 层次 | 技术选型 | 说明 |
|------|---------|------|
| 前端 | React 19 + TypeScript + Ant Design 6 + Vite 8 | 管理后台 + 对话测试页面 |
| 后端 | Python + FastAPI + SQLAlchemy + Alembic | RESTful API + 对话引擎 |
| 数据库 | MySQL 8.0 (Docker) | 17 张表，完整数据模型 |
| 缓存 | Redis 7 (Docker) | 会话缓存/限流（预留） |
| 部署 | Docker Compose | 一键拉起 MySQL + Redis |

---

## 三、完成的功能模块

### 3.1 管理后台（前端 7 个页面）

| 页面 | 路由 | 功能 |
|------|------|------|
| 登录 | `/login` | 用户名密码登录，JWT 鉴权 |
| 仪表盘 | `/` | 实时统计（租户数/连接器/大模型/技能数量） |
| 租户管理 | `/tenants` | 多租户 CRUD |
| 连接器 | `/connectors` | 河狸云 API 连接配置，支持 Mock 模式 |
| 大模型配置 | `/llm` | LLM 提供商/模型/API Key 管理 |
| 业务本体 | `/ontology` | 实体定义（产线、人员等）、属性、操作 |
| 技能/意图 | `/intents` | 意图规则配置（关键词、正则、回复模板） |
| **对话测试** | `/chat` | **本次新增** — 完整聊天界面 |

### 3.2 对话引擎（核心）

**处理流程：**
```
用户输入 → 意图识别（关键词得分排序 → LLM 兜底）
        → 技能工具链加载
        → 连接器调用 / Mock 数据返回
        → 回复生成（模板 / LLM / 文本格式化）
```

**意图匹配算法（多关键词得分排序）：**
- 每个关键词命中 +0.1 分，基础分 0.7，上限 0.98
- 正则匹配得分 0.9（可与关键词叠加取高）
- 多个候选按得分降序排列，取最高分
- 无命中时降级到 LLM 意图识别（如已配置）

**已支持的对话场景（均已测试验证）：**

| 用户输入 | 匹配技能 | 回复 |
|---------|---------|------|
| "帮我看看交货进度" | QUERY_PROGRESS | 返回 3 条产线数据（编号/进度/状态） |
| "驻厂人员都有谁" | QUERY_STAFF | 返回 3 名人员（姓名/角色/电话） |
| "25B1339-G产线的驻厂人员有哪些" | QUERY_STAFF | 正确匹配到人员而非产线（多关键词胜出） |
| "你好" / "谢谢" | CHITCHAT | 友好问候 + 功能引导 |
| "今天天气怎么样" | 无匹配 | 提示无法理解 + 推荐可用功能 |

### 3.3 对话测试页面（本次核心交付）

**新增文件：** `frontend/src/pages/ChatPage.tsx`

**功能清单：**
- 左侧会话列表：显示所有历史会话，支持点击切换
- 新建对话按钮：一键开启新会话
- 消息气泡：用户（蓝色右对齐）/ AI（白色左对齐）
- 意图标签：AI 回复下方显示识别到的意图 Code
- 快捷引导：空白状态展示推荐问题标签，点击即填入
- 加载状态：发送时显示"思考中..."动画
- 键盘快捷键：Enter 发送，Shift+Enter 换行
- 会话续聊：同一会话内多轮对话，保持 session_id

### 3.4 后端 API 清单

**管理端（`/api/admin/*`）—— 需 JWT 鉴权：**
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/admin/auth/login` | 登录 |
| POST | `/admin/auth/init` | 初始化管理员 |
| GET | `/admin/stats` | **新增** — 仪表盘统计 |
| CRUD | `/admin/tenants` | 租户管理 |
| CRUD | `/admin/connectors` | 连接器管理 |
| CRUD | `/admin/llm-configs` | 大模型配置 |
| CRUD | `/admin/ontologies/*` | 本体/实体/操作管理 |
| CRUD | `/admin/intents/*` | 技能/意图管理 |

**对话端（`/api/v1/chat/*`）—— 客户侧使用：**
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/v1/chat/completions` | 对话主接口 |
| POST | `/v1/chat/actions` | 动作执行接口 |
| GET | `/v1/chat/sessions` | **新增** — 会话列表（分页） |
| GET | `/v1/chat/sessions/{id}/history` | 会话历史消息 |

### 3.5 数据库迁移（Alembic）

- 已初始化 Alembic 配置（`backend/alembic/`）
- 自动读取应用数据库地址，无需重复配置
- 初始迁移已生成并标记为当前版本
- **后续修改模型后执行：**
  ```bash
  cd backend
  alembic revision --autogenerate -m "描述"
  alembic upgrade head
  ```

### 3.6 演示数据

脚本：`backend/scripts/seed_demo.py`（可重复执行，幂等）

预置数据：
- 1 个连接器（河狸云 Mock 模式）
- 2 个业务实体：产线（7 属性）、现场人员（5 属性）
- 2 个操作：查询产线进度（3 条 Mock 数据）、查询现场人员（3 条 Mock 数据）
- 3 个技能：QUERY_PROGRESS、QUERY_STAFF、CHITCHAT

---

## 四、如何运行项目

### 4.1 前置条件

- macOS / Linux
- Docker（用于 MySQL + Redis）
- Python 3.9+
- Node.js 18+

### 4.2 启动步骤

```bash
# 1. 克隆仓库
git clone git@gitlab.ricent.com:ricent/beaver-ai-agent.git
cd beaver-ai-agent

# 2. 启动数据库（Docker）
docker compose up -d
# 验证：docker ps 应看到 beaver-ai-mysql 和 beaver-ai-redis 均 healthy

# 3. 启动后端
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
# 后端启动时自动建表

# 4. 插入演示数据（首次）
python3 scripts/seed_demo.py

# 5. 启动前端
cd ../frontend
npm install
npm run dev
# 访问 http://localhost:3000
```

### 4.3 数据库连接信息

| 项目 | 值 |
|------|---|
| Host | 127.0.0.1 |
| Port | 13306 |
| User | root |
| Password | beaver2026 |
| Database | beaver_ai |

### 4.4 首次登录

1. 打开 http://localhost:3000/login
2. 系统会提示初始化管理员（设置用户名密码）
3. 登录后可看到仪表盘

---

## 五、项目目录结构

```
beaver-ai-agent/
├── docker-compose.yml          # MySQL + Redis 容器
├── .env                        # 环境变量（数据库连接等）
├── backend/
│   ├── app/
│   │   ├── main.py             # FastAPI 入口
│   │   ├── config.py           # 配置读取
│   │   ├── database.py         # SQLAlchemy 连接
│   │   ├── models/             # 17 个数据模型
│   │   │   ├── tenant.py       # 租户 + API Key
│   │   │   ├── config.py       # LLM配置 + 连接器
│   │   │   ├── ontology.py     # 实体 + 属性 + 关系
│   │   │   ├── action.py       # 操作 + 参数
│   │   │   ├── intent.py       # 技能 + 工具链
│   │   │   ├── chat.py         # 会话 + 消息 + 日志
│   │   │   └── admin.py        # 管理员 + 操作日志
│   │   ├── schemas/            # Pydantic Schema
│   │   ├── api/
│   │   │   ├── admin/          # 管理后台接口
│   │   │   └── v1/             # 客户对话接口
│   │   ├── core/
│   │   │   └── engine.py       # ⭐ 对话引擎核心
│   │   └── clients/
│   │       ├── llm_client.py   # LLM 调用封装
│   │       └── connector_client.py  # 连接器调用封装
│   ├── scripts/
│   │   └── seed_demo.py        # 演示数据脚本
│   ├── alembic/                # 数据库迁移
│   └── requirements.txt
└── frontend/
    ├── src/
    │   ├── App.tsx             # 路由配置
    │   ├── layouts/
    │   │   └── AdminLayout.tsx # 侧边栏布局
    │   ├── pages/
    │   │   ├── Dashboard.tsx   # 仪表盘
    │   │   ├── ChatPage.tsx    # ⭐ 对话测试页面
    │   │   ├── TenantList.tsx
    │   │   ├── ConnectorList.tsx
    │   │   ├── LLMConfigList.tsx
    │   │   ├── EntityList.tsx
    │   │   └── SkillList.tsx
    │   └── api/
    │       ├── client.ts       # Axios HTTP 客户端
    │       └── admin.ts        # 管理 API 封装
    ├── vite.config.ts
    └── package.json
```

---

## 六、后续可参与的工作

| 优先级 | 任务 | 说明 |
|--------|------|------|
| P0 | 接入真实 LLM | 配置 LLM API Key 后，意图识别和回复生成将由大模型处理 |
| P0 | 对接河狸云真实 API | 将连接器的 Mock 模式切换为真实 API 调用 |
| P1 | 多轮对话上下文 | 当前每轮独立，需实现上下文记忆/槽位填充 |
| P1 | 投诉/反馈技能 | 新增投诉提交、返修申请等写操作技能 |
| P2 | 客户侧独立页面 | 当前 Chat 在管理后台内，可抽出为独立 H5/小程序 |
| P2 | 权限体系 | 基于租户的权限控制，API Key 鉴权 |
| P3 | 监控报表 | 对话量/意图分布/响应时间等运营数据 |
| P3 | 流式输出 | SSE 流式返回，提升用户体验 |

---

## 七、Git 提交记录

```
eb051d7 feat: 对话测试页面 + 会话列表API
b39d029 feat: 对话引擎优化 + 统计接口 + Alembic 迁移
8a20199 feat: 初始项目搭建 - 完整后端+前端+Docker
```

---

## 八、测试验证记录

所有以下场景均通过 `curl` 命令和前端页面双重验证：

```bash
# 产线进度查询
curl -X POST http://localhost:8000/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"tenant_id":1,"customer_id":"C001","message":"帮我看看交货进度"}'
# ✅ 返回 3 条产线数据

# 现场人员查询
curl -X POST http://localhost:8000/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"tenant_id":1,"customer_id":"C001","message":"驻厂人员都有谁"}'
# ✅ 返回 3 名人员信息

# 多关键词意图消歧
curl -X POST http://localhost:8000/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"tenant_id":1,"customer_id":"C001","message":"25B1339-G产线的驻厂人员有哪些"}'
# ✅ 正确匹配 QUERY_STAFF（3 个关键词 > 1 个正则）

# 闲聊
curl -X POST http://localhost:8000/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"tenant_id":1,"customer_id":"C001","message":"你好"}'
# ✅ 返回友好问候

# 无法识别
curl -X POST http://localhost:8000/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"tenant_id":1,"customer_id":"C001","message":"今天天气怎么样"}'
# ✅ 返回引导提示

# 会话列表
curl 'http://localhost:8000/api/v1/chat/sessions?tenant_id=1'
# ✅ 返回分页会话列表

# 会话历史
curl 'http://localhost:8000/api/v1/chat/sessions/{session_id}/history'
# ✅ 返回该会话所有消息

# 仪表盘统计
curl http://localhost:8000/api/admin/stats
# ✅ 返回 {"tenants":1,"connectors":1,"llm_configs":0,"skills":3}
```
