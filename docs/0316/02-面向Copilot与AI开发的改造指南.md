# 面向 Copilot 与 AI 开发的改造指南

> 目标：让当前 Python 项目变成一个未来可持续扩展、可由你持续指挥 AI 协作开发的 AI Kernel，而不是随着功能增多逐步失控的项目。

## 1. 为什么必须改造

你未来希望的开发模式不是传统研发线性写代码，而是：

- 你定义方向和边界
- AI 负责大量实现
- 产品/项目经理负责配置扩展
- Java 团队继续维护河狸云主业务

这个模式是否成立，关键不是"AI 会不会写代码"，而是：

**你的代码库是否适合被 AI 长期接手、扩展、修正。**

---

## 2. 当前代码的核心问题（基于代码审计）

### 2.1 双引擎重复是最大技术债

engine.py（415行）和 stream_engine.py（1055行）存在大量重复逻辑——意图识别、工具执行、模板渲染、LLM 配置获取、数据格式化等函数各写了一遍。**任何业务逻辑修改都需要同步更新两处，这是 bug 的温床。**

### 2.2 Skill 表职责过载

当前 Skill 表 18 个字段混合了三层职责：
- **场景定义**：match_keywords / match_patterns / skill_description
- **执行编排**：flow_type / workflow_config / max_tool_calls
- **策略配置**：clarification_config / max_response_tokens / summary_threshold

同一个能力（如"问题关闭"）在不同场景中无法复用，必须重复配置。

### 2.3 Session Scope 缺失

DialogEngine 只接收 `tenant_id: int` 和 `customer_id: str`。但河狸云的企业 ID 是字符串编码（如 'RYSGS'），且实际上下文需要 enterprise_id、org_id、member_id、ouid、角色、数据域等完整信息。

### 2.4 零测试

没有 tests/ 目录，没有任何测试。对于 1000+ 行核心引擎代码的系统，这意味着任何重构都是在"碰运气"。

---

## 3. 改造路线：严格串行的 5 个 Stage

> 核心原则：做完一个再启动下一个。不并行。

### Stage 0：地基固化（第 1-2 周）

#### 任务 1：合并双引擎，抽取 core/pipeline.py

**目标：** 将 engine.py 和 stream_engine.py 的共享逻辑抽取到 pipeline.py。

**具体做法：**
- 抽取为独立函数：`recognize_intent()`、`execute_tool()`、`render_template()`、`get_llm_config()`、`format_data_as_text()`
- engine.py 变成调用 pipeline 后同步返回
- stream_engine.py 变成调用 pipeline 后包装 SSE 事件
- 预计可消除约 300 行重复代码

**边界：** 只改 core/ 目录下的引擎文件，不改 models、api、前端。

**验收：** 现有所有功能不受影响，核心逻辑只有一份。

#### 任务 2：建立测试体系

**目标：** 建立 tests/ 目录，写 5 个场景级金样例。

**建议场景：**
1. 查询工序验收问题（命中关键词 → 实体抽取 → 工具调用 → 回复生成）
2. 关闭巡检问题（写操作 → 槽位校验 → 确认 → 执行）
3. 查询项目概况（简单查询 → 模板回复）
4. 意图切换（先查进度 → 再查人员 → 旧实体应被清除）
5. 缺参数追问（缺必填参数 → 追问 → 补充后执行）

**验收：** `pytest tests/` 全部通过。

### Stage 1：Scope 接入（第 3-4 周）

#### 任务 3：实现 BeaverSessionScope

**目标：** 从前端请求 Header 提取完整的企业上下文。

**新增文件：** `backend/app/kernel/scope.py`

```python
class BeaverSessionScope(BaseModel):
    ouid: str                    # Header Ouid，全局用户 ID
    enterprise_id: str           # Header Enterpriseid，如 'RYSGS'
    member_id: str               # Header Memberid
    org_id: str                  # Header Orgid
    token: str                   # Header Authorization（去掉 Bearer 前缀）
    display_name: str = ""       # 从缓存的 rc_enterprise.mName 获取
    enterprise_name: str = ""    # 从缓存的 rc_enterprise.name 获取
    job: str = ""                # 从缓存的 rc_enterprise.job 获取
    role_type: int = 0           # 从缓存的 rc_enterprise.roleType 获取
    roles: list = []             # 从缓存的 rc_enterprise.roles 获取
    regions: list = []           # 从缓存的 rc_enterprise.regions 获取
    children_ids: list = []      # 从缓存的 rc_enterprise.children[].id 获取
    current_module: str = ""     # 从 Referer URL 解析
    exp: int = 0                 # 过期时间
```

**边界：** 只新增 scope 模块，不修改现有 models。

#### 任务 4：改造引擎入口接收 Scope

**目标：** stream_dialog 的参数从 `tenant_id: int, customer_id: str` 改为 `scope: BeaverSessionScope`。

**关键变更：**
- chat.py 的 `/stream` 端点从 Header 提取 Scope
- stream_dialog 用 scope.enterprise_id 替代 tenant_id
- 证据链记录 enterprise_id、member_id
- 注意：企业 ID 是字符串，代码中涉及 `tenant_id: int` 的地方需要逐步迁移

**验收：** 引擎正常运行，日志中可见 enterprise_id。

### Stage 2：Capability 升级（第 5-8 周）

#### 任务 5：Action → Capability

**目标：** 让能力自带安全属性，不依赖 Skill 配置者记忆。

**Action 表新增字段：**
- `capability_code: str` — 标准能力编码，如 `issue.close`
- `input_schema: JSON` — 输入参数的 JSON Schema
- `output_schema: JSON` — 输出参数的 JSON Schema
- `policy_config: JSON` — 包含 `requires_confirmation`、`scope_check`、`preconditions`
- `side_effect_type: str` — `read` / `write` / `delete`

**新增 CapabilityRegistry：**
- 按 capability_code 查找
- 按 scope 过滤（基于 enterprise_id、role_type）
- 按 side_effect_type 分类

**兼容策略：** 旧 Action 配置继续运行，新增字段默认值兼容旧行为。

**验收：** 3 个能力走通新模式，旧配置不破坏。

### Stage 3：桥接落地（第 9-12 周）

- 与 Java 团队对接 Capability Gateway
- 跑通 1 个客户场景
- 详见 03-协作指南

### Stage 4：平台化（第 13+ 周）

- Skill 拆分为 Scenario + Playbook
- Eval 体系建立
- 场景模板库
- 配置版本化

---

## 4. 必须建立的开发纪律

### 4.1 一切核心对象 schema 化
不要让关键上下文用 dict 裸传。至少建立：BeaverSessionScope、CapabilityInput/OutputSchema、EvidenceRecordSchema。

### 4.2 一切能力注册化
禁止把新功能直接塞进 engine 主流程；必须通过 capability registry 扩展。

### 4.3 一切上下文作用域化
任何执行入口都不得绕过 Session Scope。

### 4.4 一切对外集成适配器化
不在 planner、runtime、scenario 中直接写河狸云接口细节。

### 4.5 一切结果证据化
回复生成逻辑不得仅依赖 LLM 自由总结，要有 evidence 输入。

### 4.6 一切关键场景可回归测试
任何改动没有通过场景测试，不允许合并。

---

## 5. 你应该如何给 Copilot / AI 下任务

### 正确指令模板

```text
任务名称：合并双引擎重复逻辑
目标：将 engine.py 和 stream_engine.py 的共享逻辑抽取到 core/pipeline.py
边界：只改 backend/app/core/ 目录，不改 models、api、前端
输出：
1. pipeline.py（核心逻辑）
2. engine.py（简化为同步包装）
3. stream_engine.py（简化为 SSE 包装）
4. 测试用例
验收：
- 现有所有功能不受影响
- 核心逻辑只有一份
- 测试通过
禁止：
- 不得修改数据模型
- 不得修改 API 接口签名
- 不得修改前端
```

---

## 6. AI 开发时必须遵守的边界规则

1. 不允许直接在 engine 主流程里写大量业务分支
2. 不允许直接在 runtime 层拼河狸云 header
3. 不允许绕过 schema 裸传关键上下文
4. 不允许新增功能不写测试
5. 不允许修改核心模型不写 migration 说明
6. 不允许把 Skill 继续做成万能核心
7. 不允许把 prompt 当唯一业务规则
8. 不允许"先实现效果，后面再整理"成为常态

---

## 7. 最终结论

你未来能不能持续指挥 AI 开发，核心不在模型本身，而在这三件事：

1. 代码结构有没有清晰边界
2. 核心模型有没有 schema 化、注册化、策略化
3. 每次新增功能有没有被收敛到平台模式里

所以当前最重要的，不是继续加功能，而是：

**先走稳 Stage 0 和 Stage 1，把地基打好，再往上盖楼。**
