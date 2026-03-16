# 河狸云 AI Kernel 总纲

## 1. 系统定位

### 1.1 本系统是什么

本系统不是普通聊天机器人，也不是简单的模型接入层。

本系统的定位应明确为：

**河狸云 AI Kernel（智能内核） / Agent Platform（智能代理平台）**

它承担的职责不是替代河狸云主业务系统，而是作为河狸云未来所有 AI 场景的统一智能底座，负责：

- 业务语义理解
- Ontology（本体）建模与运行时驱动
- Capability（能力）注册与编排
- 策略控制（Policy）
- Agent Runtime（理解、规划、执行）
- Evidence（证据链）与 Eval（评测）
- 人机协同与场景化交付

### 1.2 它不是什么

本系统不应被定义为：

- 河狸云某个功能模块里的"AI按钮"
- 单一客户项目的聊天页
- 一个聚合 API 的对话层
- 依赖长 Prompt 的业务问答系统
- 直接嵌入 Java 主系统内部的"附属模块"

### 1.3 它与河狸云的关系

推荐明确为：

- **河狸云（Java Spring）**：System of Record
- **AI Kernel（Python）**：System of Intelligence

也就是说：

#### 河狸云负责
- 主业务系统
- 组织、租户、用户、权限主数据
- 正式业务流程与正式交易
- 业务 API 与数据主源
- 正式审计口径

#### AI Kernel 负责
- 业务理解与语义映射
- 本体与能力层抽象
- 对话式任务编排
- 智能规划与工具调用
- 多轮会话上下文
- 证据链与可解释输出
- 快速构建新 AI 场景

### 1.4 一句话定义

**河狸云 AI Kernel，是一个独立运行、可持续演进、以 Ontology + Capability + Policy + Evidence 为核心的企业级 Agent 平台，用于承载河狸云未来全部 AI 相关业务扩展。**

---

## 2. 现在：当前项目所处阶段

基于当前 `beaver-ai-agent` 代码与资料，可判断当前系统已经具备如下雏形：

- React + Ant Design 前端后台和聊天页面
- FastAPI + SQLAlchemy 后端
- 实体、属性、关系等基础本体配置
- 技能（Skill）与意图匹配
- 工具/API 调用
- 简单工作流编排（支持 6 种节点类型的有向图执行）
- 基础证据链与全链路日志
- 多租户雏形
- AG-UI 协议的 SSE 流式输出
- LLM 增强实体抽取与参数归一化

### 2.1 当前阶段的准确定义

当前项目应定义为：

**配置驱动业务 Agent 平台雏形，已具备完整执行链路，待升级为 Ontology-first 的 AI Kernel。**

### 2.2 当前阶段的优点

#### 1）方向是对的
不是长 Prompt 路线，而是配置驱动、工具驱动、业务语义驱动。

#### 2）已经具备本体意识
至少已经从"直接写接口 + prompt"进化到"业务对象 + 属性 + 动作"的模式。

#### 3）已经具备工具编排意识
不是纯回答系统，而是能够查询和执行。工作流引擎支持 tool_call / condition / parallel / confirm / llm_call / reply 六种节点。

#### 4）执行链路完整
流式引擎覆盖了意图识别 → LLM 增强实体抽取 → 参数归一化/转换 → 槽位校验/追问 → 工具链执行 → LLM 流式回复生成的全链路，每一步都有证据链记录和耗时统计。

#### 5）上下文管理处理了真实问题
中文日期短语归一化、状态枚举映射、属性级 normalization_config、名称→ID 的 mapping_config 转换，这些是踩过真实场景的坑之后的产物。

### 2.3 当前阶段的关键问题

#### 1）系统仍是 Skill-first，而不是 Ontology-first
Skill 表包含 18 个字段，混合了场景定义、执行编排、策略配置三层职责。运行时还是"命中技能 → 调工具"，而不是"识别语义对象 → 选能力 → 规划执行"。

#### 2）Action 更像接口包装，不是真正的 Capability
还没有把能力、接口、权限、确认、前后置条件解耦开。"是否需要确认"这个安全决策取决于配 Skill 的人记不记得加 `require_confirm`，而不是能力本身自带安全属性。

#### 3）Session Scope 严重缺失
DialogEngine 只接收 tenant_id（int）和 customer_id（str）。但河狸云的实际业务上下文远比这复杂——**企业 ID 是字符串编码（如 'RYSGS'、'BLOGI'）而非数字**，且需要 enterprise_id、org_id、member_id、ouid、当前模块、角色、数据域等完整上下文。

#### 4）双引擎代码重复严重
engine.py（415行）和 stream_engine.py（1055行）存在大量重复逻辑：意图识别、工具执行、模板渲染、LLM 配置获取、数据格式化等函数各写了一遍。任何业务逻辑修改都需要同步更新两处。

#### 5）零测试覆盖
整个项目没有 tests/ 目录，没有任何单元测试或集成测试。

---

## 3. 河狸云真实数据结构（事实基础）

> 以下信息来自河狸云生产环境的实际抓包，是所有后续设计的事实基础。

### 3.1 请求 Header 字段（每次 API 调用携带）

| Header 名 | 示例值 | 说明 |
|-----------|--------|------|
| Authorization | Bearer eyJ0eXAi… | JWT 登录态 |
| Enterpriseid | RYSGS | 当前企业编码（字符串，非数字 ID） |
| Membercode | 1583859697503438597 | 当前企业下的成员编码 |
| Memberid | 1583859697503438597 | 成员 ID |
| Orgid | RYSGS | 当前组织 ID |
| Ouid | 495232527520432 | 用户唯一 ID（跨企业不变） |
| Rcsign | d5839992acf83120… | 请求签名（防篡改） |
| Rctimestamp | 1773558987638 | 请求时间戳 |

### 3.2 rc_user.enterprises[] 结构

一个用户可属于多个企业（如中海地产、长隆集团、上海建工装饰等 10+ 家），每个企业结构如下：

```json
{
  "name": "中海地产集团",
  "id": "BLOGI",        // 企业 ID（字符串编码）
  "idCode": "BLOGI",    // 企业编码（与 id 相同）
  "mid": "1769928738350792139",  // 该用户在该企业下的成员 ID
  "type": 8,
  "tenantId": "BLOGI",  // 租户 ID = 企业 ID
  "roleType": 128,      // 角色类型位标记
  "regions": [],         // 数据域/区域权限
  "mName": "系统运维"    // 成员显示名
}
```

### 3.3 rc_enterprise 展开结构（关键字段）

```json
{
  "name": "瑞信 | 智慧建造",
  "id": "RYSGS",
  "isRoot": true,
  "job": "总经理,项目经理",
  "children": [{"id": "RYSGS0000F", "name": "华山国际", ...}],
  "roles": [{"name": "集团管理员", "group": "Enterprise"}],
  "roleType": 128,
  "regions": [],
  "mid": "1583859697503438597",
  "remark": "深圳瑞信建筑科技有限公司"
}
```

### 3.4 Referer URL 结构

```
https://beaver.ricent.com/org/{orgId}/enterprise/{enterpriseId}/{module}/{subModule}
```

例如 `/org/RYSGS/enterprise/RYSGS/approval/audit` 可解析出当前模块为"审批-审核"。

---

## 4. 核心设计：BeaverSessionScope

基于真实数据结构，定义 AI 会话的统一作用域模型：

| 字段名 | 类型 | 来源 | 说明 |
|--------|------|------|------|
| ouid | str | Header Ouid | 全局用户 ID，跨企业不变 |
| user_name | str | localStorage userName | 登录名 |
| display_name | str | rc_enterprise.mName | 当前企业下显示名 |
| enterprise_id | str | Header Enterpriseid | 当前企业编码（如 RYSGS） |
| enterprise_name | str | rc_enterprise.name | 企业显示名 |
| member_id | str | Header Memberid | 当前企业下成员 ID |
| org_id | str | Header Orgid | 当前组织 ID |
| job | str | rc_enterprise.job | 职位 |
| role_type | int | rc_enterprise.roleType | 角色类型位标记 |
| roles | list | rc_enterprise.roles | 角色列表 |
| regions | list | rc_enterprise.regions | 数据域/区域权限 |
| children_ids | list | rc_enterprise.children[].id | 子企业/项目 ID 列表 |
| current_module | str? | Referer URL 解析 | 当前页面模块 |
| token | str | Header Authorization | JWT，用于代理调用河狸云 API |
| exp | int | 签发时生成 | 过期时间戳 |

**关键设计决策：**
- **第一阶段**：直接从前端请求 Header 提取这些字段，Java 团队零改动
- **第二阶段**：升级为 Java 侧签发正式 AI Context Ticket

---

## 5. 未来：系统应演进成什么

### 5.1 目标形态

系统最终应演进成：

**河狸云统一 AI 内核 + 场景构建平台 + 能力编排平台**

这个目标形态下，系统具备以下能力：

#### A. 统一语义底座
项目、楼栋、楼层、房间、产线、工序、验收、巡检、问题、整改、复验、人员、组织、角色、数据域——这些业务对象都在统一本体体系下表达。

#### B. 统一能力注册中心
标准化能力如 `issue.query`、`issue.close`、`inspection.list`、`project.progress.summary`。

#### C. 统一策略层
访问策略、写操作确认策略、租户和数据域策略、风险控制策略。

#### D. 统一 Agent Runtime
理解（Understand）→ 规划（Plan）→ 执行（Act）→ 证据沉淀（Evidence）→ 回归评测（Eval）。

#### E. 统一场景构建能力
产品经理/项目经理未来在平台中配置业务语义、能力和场景。

---

## 6. 核心设计原则

### 6.1 独立运行原则
AI Kernel 必须独立部署、独立演进、独立维护。

### 6.2 解耦协作原则
AI 通过标准桥接协议获取用户上下文、当前作用域、可执行能力范围。第一阶段直接从 Header 提取，第二阶段升级为正式 Ticket。

### 6.3 Ontology-first 原则
语义对象、关系、状态、允许动作，应先于技能和页面配置存在。

### 6.4 Capability-first 原则
平台的核心是"业务能力"，不是"接口"和"技能"。

### 6.5 Policy 内建原则
权限、确认、数据域和风控，应进入平台设计，不依赖开发习惯。

### 6.6 Evidence 内建原则
所有关键决策、接口调用、结果结论都应有证据链。

### 6.7 Eval 内建原则
所有场景都应能回归测试。

---

## 7. 阶段目标（务实版）

> 核心原则：严格串行，做完一个阶段再启动下一个。每个阶段必须同时交付至少一个可跑通的客户场景。

### Stage 0：地基固化（第 1-2 周）

**目标：** 消除最大技术债，建立可回归的测试基线。

**产出：**
- 合并 engine.py 和 stream_engine.py 的重复逻辑，抽取 core/pipeline.py
- 建立 tests/ 目录，写 5 个场景级金样例测试

**完成标志：** 测试全部通过，核心逻辑单一源。

### Stage 1：Scope 接入（第 3-4 周）

**目标：** 让系统知道"谁在哪个企业做什么"。

**产出：**
- 实现 BeaverSessionScope，从 Header 提取
- 改造 stream_dialog 入口接收 Scope
- 日志和证据链记录 enterprise_id

**完成标志：** 引擎入口接收 Scope，API 调用携带正确的企业上下文。

### Stage 2：Capability 升级（第 5-8 周）

**目标：** 让写操作自带安全属性。

**产出：**
- Action 新增 capability_code / policy_config / side_effect_type
- 建立 CapabilityRegistry
- 3 个能力走通新模式，旧配置不破坏

**完成标志：** 写操作能力自带确认策略，不依赖 Skill 配置者记忆。

### Stage 3：桥接落地 + 场景交付（第 9-12 周）

**目标：** 对接 Java 侧 Capability Gateway，跑通 1 个客户场景。

**产出：**
- Java 侧 3-5 个核心能力网关
- 1 个客户环境稳定运行的 AI 场景

**完成标志：** 客户环境可稳定演示。

### Stage 4：平台化（第 13+ 周）

**目标：** 从可交付项目升级为可配置复用的平台。

**产出：**
- Skill 拆分为 Scenario + Playbook
- Eval 体系建立
- 场景模板库初版

**完成标志：** 新场景可通过模板复制，不需要从头开发。

---

## 8. 总体架构建议

```text
Beaver Cloud (Java / System of Record)
  ├─ Identity / Tenant / Org / Role / Data
  ├─ Business APIs
  ├─ AI Capability Gateway（Stage 3 落地）
  └─ Metadata / Dictionary APIs（Stage 3 落地）

AI Kernel (Python / System of Intelligence)
  ├─ Scope Layer（从 Header 提取，Stage 1）
  ├─ Ontology Layer
  ├─ Capability Layer（Stage 2 升级）
  ├─ Policy Layer（Stage 4）
  ├─ Agent Runtime（pipeline.py，Stage 0 收敛）
  ├─ Scenario / Workflow Layer
  ├─ Evidence & Eval Layer（Stage 4）
  └─ Admin / Config UI
```

---

## 9. 最终判断

### 本系统现在的价值
已经证明方向可行，具备完整的执行链路和企业级能力雏形。

### 本系统未来的价值
有机会成为河狸云未来所有 AI 相关业务扩展的统一底座。

### 成败关键
成败不在于再加多少技能，而在于：
1. **先固化地基**——合并双引擎、补测试
2. **再接入 Scope**——基于真实数据结构，Java 团队零改动
3. **再升级 Capability**——让能力自带安全属性
4. **每个阶段同时交付场景**——不允许架构升级脱离业务交付
