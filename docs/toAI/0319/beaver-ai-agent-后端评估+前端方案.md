# 后端 v6 实现完整度评估 + 前端配置界面调整方案

---

## 一、后端实现完整度评估

### 检查清单

| # | v6 检查项 | 状态 | 证据 |
|---|---------|------|------|
| 1 | migrate_v6.sql | ✅ 完整 | 79行，7表ALTER + 1表CREATE + UPDATE |
| 2 | 表前缀统一 rc_ai_ | ✅ 已处理 | commit msg 明确标注 |
| 3 | 已存在字段智能跳过 | ✅ 已处理 | 注释标注 version/requires_confirmation/match_keywords/base_url/status already exists |
| 4 | DEFAULT 值兼容性 | ✅ 正确 | 所有新字段都有 DEFAULT |
| 5 | session/ 目录 | ✅ 已创建 | __init__.py + session_manager.py + ticket_handler.py |
| 6 | config.py 含 app_secret + app_retrieve_url | ✅ 已确认 | 第28-29行 Beaver Cloud WebAPI 注释段 |
| 7 | models/execution_log.py | ✅ 已创建 | models 目录下可见 |
| 8 | models/ 其他文件已更新 | ✅ 已更新 | action.py/ontology.py/config.py 等都显示 v6 commit |

### 需要 Copilot 进一步确认的项（请执行以下命令验证）

```bash
# 1. 确认 /go 和 /refresh 路由是否注册到 main.py
grep -r "go\|refresh\|session" backend/app/main.py

# 2. 确认 api/ 下是否有 session 路由
ls -la backend/app/api/
grep -r "session" backend/app/api/ --include="*.py"

# 3. 确认 execution_log 是否被 CallbackEngine/kernel 引用
grep -r "execution_log\|ExecutionLog" backend/app/ --include="*.py"

# 4. 确认 Adapter/ConnectorClient 是否增加了 session headers 逻辑
grep -r "session.*headers\|headers.*session" backend/app/ --include="*.py"

# 5. 确认 .env.example 是否更新
cat .env.example

# 6. 确认 tests/ 下是否有 session 测试
ls -la backend/tests/
grep -r "session\|go\|refresh" backend/tests/ --include="*.py"
```

### 可能缺失的集成点

| 项 | 风险 | 说明 |
|---|------|------|
| /go 路由未注册到 main.py | 中 | session_routes.py 可能已写但未 include 到 FastAPI app |
| execution_log 未嵌入 CallbackEngine | 中 | Model 可能已创建但执行时未调用 log_execution |
| Adapter 未读 session.headers | 低 | 可能还在用老的 header 透传方式（不影响功能，但未用上新能力） |
| /chat 入口保护未实现 | 低 | 前端页面可能还没有 session 校验中间件 |

---

## 二、前端现有页面清单（从代码库确认）

```
frontend/src/pages/
├── ChatApp.tsx          # H5移动端聊天页面
├── ChatEmbed.tsx        # 嵌入式聊天（iframe）
├── ChatPage.tsx         # 独立聊天页面
├── ConnectorList.tsx    # 连接器配置（Adapter 管理）
├── Dashboard.tsx        # 仪表盘（密码修改、历史对话）
├── EntityList.tsx       # 本体管理（Entity + Property + Relation + Action + Parameter）
├── LLMConfigList.tsx    # 大模型配置 + 本体/技能分类
├── Login.tsx            # 登录页
├── LogsPage.tsx         # 日志/证据链页面
├── NormalizationPage.tsx # 归一化规则配置
├── SkillList.tsx        # 技能管理（Skill + Tool）
├── TenantList.tsx       # 租户管理
├── WorkflowPage.tsx     # 流程编排器
```

---

## 三、前端配置界面调整方案

### 3.1 调整原则

```
1. 现有页面只做增量修改（加字段），不重写
2. 新增字段对应后端 v6 ALTER TABLE 的新列
3. generated_by / discovery_status 字段用统一的 Badge 展示样式
4. 新页面只加 1 个：ExecutionLog 查看页（如果 LogsPage 不够用）
5. 不新增独立的 Session 管理页（Session 在 Redis 中，不需要 UI 配置）
```

### 3.2 各页面具体调整

#### EntityList.tsx — 本体管理

**现有功能**：Entity 的 CRUD + Property / Relation / Action / Parameter 子表管理

**需新增的字段展示**：

```
Entity 列表/表单增加：
  ├─ generated_by      → 只读 Badge（manual=蓝色/llm=紫色/api_sync=绿色/domain_auto=橙色）
  ├─ confidence         → 只读进度条（0.00~1.00）
  ├─ discovery_status   → 可编辑 Select（draft/reviewed/published）
  └─ version           → 只读数字

Entity Property 子表单增加：
  ├─ semantic_role      → 可编辑 Select（identifier/status/scope/timestamp/metric/label/content）
  ├─ enum_values        → 可编辑 JSON 表格（[{value, label}] 形式）
  └─ generated_by      → 只读 Badge

Entity Relation 子表单增加：
  ├─ relation_type      → 可编辑 Select（belongs_to/has_many/references）
  ├─ join_property      → 可编辑 Input
  └─ generated_by      → 只读 Badge

Action 子表单增加：
  ├─ action_type        → 可编辑 Select（query/mutation）★重要★
  ├─ requires_confirmation → 可编辑 Switch（mutation 类建议默认 true）
  ├─ risk_level         → 可编辑 Select（low/medium/high）
  ├─ generated_by      → 只读 Badge
  └─ discovery_status   → 可编辑 Select

Action Parameter 子表单增加：
  ├─ default_value      → 可编辑 Input（如 source_type 默认 "inspection"）
  ├─ enum_values        → 可编辑 JSON 表格
  ├─ semantic_role      → 可编辑 Select
  └─ generated_by      → 只读 Badge
```

**UI 建议**：
- 新字段放在表单的「高级设置」折叠面板中，不影响现有使用体验
- generated_by=manual 的记录照常可编辑
- generated_by=llm 的记录标记为「AI生成」，编辑时弹提示「此记录由AI自动生成，修改后 generated_by 将变为 manual」
- discovery_status=draft 的记录在列表中用灰色背景标识

#### ConnectorList.tsx — 连接器/Adapter 管理

**现有功能**：Adapter 的 CRUD

**需新增的字段**：

```
Adapter 表单增加：
  ├─ adapter_type       → 可编辑 Select（webapi/database）
  ├─ base_url           → 可编辑 Input（adapter_type=webapi 时显示）
  ├─ db_config          → 可编辑 JSON 表单（adapter_type=database 时显示）
  │   包含：host, port, user, password, database
  ├─ openapi_url        → 可编辑 Input（远期用，标记为「高级」）
  └─ status             → 可编辑 Select（active/inactive）
```

**UI 建议**：
- adapter_type 切换时，联动显示/隐藏 base_url 或 db_config
- status=inactive 的 adapter 在列表中灰显

#### SkillList.tsx — 技能管理

**现有功能**：Skill 的 CRUD + Tool 子表管理

**需新增的字段**：

```
Skill 表单增加：
  ├─ match_keywords     → 已有（确认是否已展示）
  ├─ generated_by      → 只读 Badge
  ├─ discovery_status   → 可编辑 Select
  └─ test_cases         → 可编辑 JSON 表格
       每行：{ input: "帮我关闭这个问题", expected_skill: "close_issue", expected_params: {} }

Tool 子表单增加：
  └─ generated_by      → 只读 Badge
```

**UI 建议**：
- test_cases 编辑器用一个简单的表格（输入文本 + 期望 Skill + 期望参数 JSON）
- 将来可以加一个「运行测试」按钮，用 test_cases 做回归验证

#### LogsPage.tsx — 日志/执行记录

**现有功能**：证据链展示

**需确认**：LogsPage 当前是否已经对接了 rc_ai_execution_log 表？如果是，只需增加新字段展示：

```
如果已对接 execution_log：
  列表增加：user_input, skill_id, duration_ms, success 状态标识
  详情增加：input_params JSON 展示, output_data JSON 展示, user_context

如果未对接（仍在用老日志）：
  需要新建或改造为读取 rc_ai_execution_log 表
  列表字段：时间, 用户输入, 匹配Skill, 执行Action, 成功/失败, 耗时
  详情弹窗：完整的 input_params + output_data + user_context
  筛选条件：按 success/skill_id/action_id/时间范围
```

#### LLMConfigList.tsx — 大模型配置

**调整**：无，v6 不涉及 LLM 配置变更。

#### Login.tsx / Dashboard.tsx / WorkflowPage.tsx / NormalizationPage.tsx

**调整**：无，v6 不涉及这些页面。

#### ChatPage.tsx / ChatEmbed.tsx / ChatApp.tsx — 对话页面

**需增加**：
```
1. Session 校验：
   - ChatPage 和 ChatApp 加载时检查 URL 参数 session_id
   - 调用后端验证 session 有效性
   - 无效时显示「请从河狸云进入AI助手」

2. Session 信息展示（可选）：
   - 在对话页头部显示当前用户名 + 组织名
   - 从 session 中读取 display_name + ou_name
```

### 3.3 通用 UI 组件需求

```
1. GeneratedByBadge 组件
   - manual → 蓝色 Badge "手动"
   - llm → 紫色 Badge "AI生成"
   - api_sync → 绿色 Badge "接口同步"
   - domain_auto → 橙色 Badge "领域自动"

2. DiscoveryStatusTag 组件
   - draft → 灰色 Tag "草稿"
   - reviewed → 黄色 Tag "已审核"
   - published → 绿色 Tag "已发布"

3. SemanticRoleSelect 组件
   - 下拉选项：标识符/状态/范围/时间/指标/标签/内容

4. EnumValuesEditor 组件
   - 可增删改的表格：value 列 + label 列
   - 支持 JSON 导入/导出

5. ConfidenceBar 组件
   - 0.00~1.00 的进度条
   - <0.5 红色, 0.5~0.8 黄色, >0.8 绿色
```

---

## 四、前端调整的优先级排序

| 优先级 | 页面 | 改动量 | 说明 |
|-------|------|--------|------|
| P0 | ChatPage / ChatEmbed | 小 | Session 校验 + 提示页 |
| P1 | EntityList | 中 | Action 的 action_type / requires_confirmation 最重要 |
| P1 | ConnectorList | 小 | adapter_type + base_url + db_config |
| P2 | LogsPage | 中 | 对接 execution_log 表 |
| P2 | SkillList | 小 | generated_by + discovery_status + test_cases |
| P3 | 通用组件 | 小 | Badge / Tag / Select / Editor 组件 |

建议执行顺序：先做通用组件（P3），再做 P0（对话页 Session 校验），然后 P1，最后 P2。

---

## 五、给 Copilot 的前端执行指令

```
任务：前端配置界面 v6 适配

一、新增通用组件（frontend/src/components/v6/）
1. GeneratedByBadge.tsx — generated_by 字段的 Badge 展示
2. DiscoveryStatusTag.tsx — discovery_status 字段的 Tag 展示
3. SemanticRoleSelect.tsx — semantic_role 字段的 Select
4. EnumValuesEditor.tsx — enum_values 字段的可编辑表格
5. ConfidenceBar.tsx — confidence 字段的进度条

二、ChatPage.tsx / ChatEmbed.tsx Session 校验
1. 页面加载时检查 URL 参数 session_id
2. 调用 GET /api/session/{session_id} 验证有效性
3. 无效时显示提示页「请从河狸云进入AI助手」
4. 有效时在页面头部显示 display_name + ou_name

三、EntityList.tsx 增加 v6 字段
1. Entity 列表增加 generated_by Badge 列
2. Entity 编辑表单增加「高级设置」折叠面板
   - discovery_status Select
   - confidence 只读进度条
   - version 只读
3. Action 子表单增加 action_type Select + requires_confirmation Switch + risk_level Select
4. Parameter 子表单增加 default_value Input + enum_values Editor + semantic_role Select
5. Property 子表单增加 semantic_role Select + enum_values Editor
6. Relation 子表单增加 relation_type Select + join_property Input

四、ConnectorList.tsx 增加 v6 字段
1. 增加 adapter_type Select（webapi/database）
2. adapter_type=webapi 时显示 base_url Input
3. adapter_type=database 时显示 db_config JSON 表单
4. 增加 status Select（active/inactive）

五、SkillList.tsx 增加 v6 字段
1. Skill 表单增加 generated_by Badge + discovery_status Select
2. 增加 test_cases 编辑器

六、LogsPage.tsx 对接 execution_log
1. API 改为读取 rc_ai_execution_log 表
2. 列表展示 user_input / skill / action / success / duration_ms
3. 详情弹窗展示完整 input_params + output_data JSON

兼容性要求：
- 所有新字段放在「高级设置」折叠面板或表单底部
- 不改变现有字段的位置和交互方式
- 新增的 Select 组件必须有合理默认值
- generated_by=manual 的记录保持完全可编辑
```

---

## 六、后端需要补充的 API（供前端调用）

```
如果以下 API 尚未存在，需要后端补充：

1. GET /api/session/{session_id}
   → 返回 Session 信息（不含 headers 敏感信息）
   → 用于前端校验 Session 有效性

2. GET /api/execution-logs
   → 分页查询 rc_ai_execution_log
   → 支持按 success / skill_id / action_id / 时间范围筛选
   → 用于 LogsPage 展示

3. 现有 Entity/Action/Skill/Adapter CRUD API
   → 需确认是否已包含 v6 新增字段的读写
   → 如果 SQLAlchemy Model 已更新，API 一般自动包含
```
