# 河狸云 AI 助手 — 使用指引

> 本文档说明如何配置和体验完整的 AI 对话效果（含大模型智能回答），即使河狸云 API 尚未对接也能看到全流程。

## 一、快速启动

### 1. 启动后端

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

### 2. 初始化演示数据（首次）

```bash
cd backend
python scripts/seed_demo.py
```

这会创建：
- 连接器（Mock 模式，模拟河狸云接口）
- 本体：产线、现场人员（含 Mock 数据）
- 技能：查产线进度、查现场人员、闲聊
- **大模型配置**：MiniMax（意图识别 + 回答生成）、LM Studio 本地模型 × 2

### 3. 启动前端

```bash
cd frontend
npm run dev
```

访问 http://localhost:3000

---

## 二、已配置的大模型

系统已预置 4 个大模型配置（管理后台 → 大模型配置 可查看和编辑）：

| 配置名称 | 厂商 | 模型 | 用途 | 默认状态 |
|---------|------|------|------|---------|
| MiniMax-意图识别 | minimax | MiniMax-Text-01 | intent（意图识别） | ✅ active |
| MiniMax-回答生成 | minimax | MiniMax-Text-01 | response（回答生成） | ✅ active |
| LMStudio-Qwen3-Coder | lmstudio | qwen/qwen3-coder-next | intent（意图识别） | ⬜ disabled |
| LMStudio-Qwen3.5-122B | lmstudio | qwen3.5-122b-a10b | general（通用） | ⬜ disabled |

### 大模型用途说明

| 用途 (usage) | 作用 | 触发时机 |
|-------------|------|---------|
| `intent` | 意图识别 | 用户输入无法通过关键词/正则匹配时，调用 LLM 判断意图 |
| `response` | 回答生成 | 工具查询到数据后，调用 LLM 生成自然语言回答 |
| `general` | 通用 | 作为 intent/response 的兜底，任何需要 LLM 时都可使用 |
| `entity` | 实体抽取 | 预留：从用户输入中提取结构化实体 |

---

## 三、体验完整效果（无需河狸云 API）

系统已配置 **Mock 模式**，所有工具调用会返回模拟数据，配合大模型可看到完整流程。

### 对话示例

打开前端 Chat 页面，尝试以下对话：

#### 示例 1：查产线进度（关键词匹配 → Mock 数据 → LLM 回答）
```
用户：我想看一下产线进度
```
流程：
1. **意图识别**：命中关键词"进度""产线" → 匹配 `QUERY_PROGRESS`
2. **工具调用**：执行 `production_line.query_progress` → 返回 Mock 产线数据
3. **回答生成**：LLM 根据 Mock 数据生成自然语言汇总

#### 示例 2：查现场人员
```
用户：25B1339-G 产线有哪些驻厂人员？
```

#### 示例 3：闲聊（LLM 智能回答）
```
用户：你好
用户：你能做什么？
用户：帮我介绍一下河狸云
```
流程：
1. **意图识别**：命中关键词"你好" → 匹配 `CHITCHAT`
2. **LLM 回答**：调用 MiniMax 生成智能回答（而不是固定模板）

#### 示例 4：LLM 意图识别（无关键词命中时）
```
用户：最近那批货什么时候能发？
```
流程：
1. **意图识别**：无关键词精确命中 → 调用 MiniMax 意图识别
2. LLM 判断意图为 `QUERY_PROGRESS` → 执行工具查询

### 流式效果

Chat 页面使用 AG-UI SSE 协议，可看到：
- 🔄 步骤指示器：「识别意图…」→「执行查询…」→「生成回答…」
- 🔧 工具调用进度：显示正在调用哪个接口
- 💬 逐字流式输出：文字逐段出现（带闪烁光标）

---

## 四、切换到本地模型（LM Studio）

如需使用本地模型替代 MiniMax：

### 1. 启动 LM Studio
- 打开 LM Studio，加载模型（如 `qwen3.5-122b-a10b`）
- 启动 Local Server，确保运行在 `http://127.0.0.1:1234`

### 2. 在管理后台切换
访问：大模型配置 页面

**操作步骤：**
1. 将 `MiniMax-意图识别` 状态改为 `disabled`
2. 将 `MiniMax-回答生成` 状态改为 `disabled`
3. 将 `LMStudio-Qwen3.5-122B` 状态改为 `active`（usage=general，会兜底 intent 和 response）

或者精细配置：
- `LMStudio-Qwen3-Coder` → `active`，usage=`intent`（快速意图识别）
- `LMStudio-Qwen3.5-122B` → `active`，usage=`response`（大模型生成回答）

### 3. 测试连通性
在大模型配置列表点击「测试」按钮，会发送 "你好，请简短回复" 测试消息。

---

## 五、对接真实河狸云 API

当河狸云 API 准备好后：

### 1. 更新连接器
管理后台 → 连接器管理：
- 修改「河狸云(Mock)」的 `base_url` 为真实地址
- 将 `mock_enabled` 改为 `0`
- 配置真实的认证信息（API Key / JWT）

### 2. 更新操作
管理后台 → 操作管理：
- 检查 `api_path` 是否匹配真实接口路径
- 更新 `request_template`（请求体模板）
- 更新 `response_mapping`（响应字段映射）

### 3. 使用「接口调用包装」模式（推荐）
参见 [tool-design.md](tool-design.md)，可在技能工具中直接配置 `api_config`，无需拆分 Entity + Action。

---

## 六、管理后台功能一览

| 页面 | 路径 | 功能 |
|------|------|------|
| 仪表盘 | `/dashboard` | 数据概览 |
| 大模型配置 | `/llm-configs` | 配置/测试大模型 API |
| 连接器管理 | `/connectors` | 外部系统接入配置 |
| 本体管理 | `/entities` | 业务实体定义 |
| 操作管理 | `/actions` | 接口操作定义 |
| 技能管理 | `/skills` | 意图+工具链+回答模板 |
| 对话页面 | `/chat` | AI 对话体验 |

---

## 七、架构简图

```
用户消息
  ↓
[关键词/正则匹配] ──命中──→ 确定意图
  │ 未命中
  ↓
[LLM 意图识别] ← usage=intent 的模型配置
  ↓
确定意图（技能）
  ↓
[执行工具链] ← 连接器 → 河狸云API / Mock数据
  ↓
[LLM 生成回答] ← usage=response 的模型配置
  ↓
流式返回（AG-UI SSE）
```

## 八、常见问题

**Q: 对话时出现"系统正在配置中"？**
A: 没有已发布的技能。运行 `python scripts/seed_demo.py` 初始化数据。

**Q: 回答没有使用 LLM，直接返回了模板文字？**
A: 检查是否有 `active` 状态的大模型配置。管理后台 → 大模型配置，确保至少有 usage=response 或 usage=general 的配置为 active。

**Q: LM Studio 本地模型连不上？**
A: 确认 LM Studio 的 Local Server 已启动，端口 1234 未被占用。可在大模型配置页面用「测试」按钮验证。

**Q: 如何切换为其他大模型？**
A: 管理后台 → 大模型配置 → 新建配置。系统兼容所有 OpenAI 格式的 API（包括 DeepSeek、GLM、千问、Ollama 等），只要填对 api_url 和 api_key 即可。
