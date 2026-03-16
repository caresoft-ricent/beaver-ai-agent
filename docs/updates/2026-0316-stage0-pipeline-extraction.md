# Stage 0：测试基础 + Pipeline 抽取 + 双引擎合并

> 迭代日期：2026-03-16  
> Git 范围：`stage0-pre` (16ce2f8) → `stage0-done` (be7a4ac)  
> 统计：20 files changed, +3164 / −282

---

## 1. 迭代目标

Stage 0 是架构改造 5 阶段路线图的起点，核心目标：

1. **建立测试安全网** — 为后续重构提供回归保障
2. **抽取共享逻辑** — 消除 stream_engine / engine 之间的代码重复
3. **确保零回归** — 所有改动不影响现有功能

## 2. 前置准备

### 2.1 数据库备份

```bash
docker exec beaver-ai-mysql mysqldump -u root -pbeaver2026 beaver_ai \
  > backup/beaver_ai_20260316_stage0_pre.sql
```

- 备份文件：`backup/beaver_ai_20260316_stage0_pre.sql`（690 行）
- 当前 Alembic 版本：`d85c257bb470`
- `backup/` 已加入 `.gitignore`

### 2.2 数据资产快照

| 表名 | 记录数 | 说明 |
|------|--------|------|
| ai_entity | 6 | 业务本体 |
| ai_entity_property | 44 | 本体属性 |
| ai_skill | 9 | 技能配置 |
| ai_skill_tool | 8 | 技能-工具链 |
| ai_action | 6 | 操作定义 |
| ai_action_parameter | 4 | 操作参数 |
| ai_connector | 2 | 连接器 |
| ai_llm_config | 4 | LLM 配置 |
| ai_action_log | 68 | 操作日志 |

### 2.3 Git 标签

```
stage0-pre   → 16ce2f8 (改造前快照)
stage0-done  → be7a4ac (Stage 0 完成)
```

---

## 3. 实现详情

### 3.1 新增：pipeline.py（共享处理管道）

**文件**：`backend/app/core/pipeline.py`（201 行）

从 stream_engine.py 和 engine.py 中提取 5 个完全重复的纯逻辑函数，合并为单一数据源：

| 函数 | 用途 | 关键逻辑 |
|------|------|----------|
| `recognize_intent(db, tenant_id, message, skills, ctx)` | 意图识别 | 规则优先（关键词+正则得分排序）→ LLM 兜底 → 返回 4-tuple `(skill, confidence, entities, detail)` |
| `render_template(template, data, entities)` | 模板渲染 | `str.format(**context)` 展平查询结果 |
| `format_data_as_text(data)` | 无 LLM 文本格式化 | 将嵌套 `{data: {items: [...]}}` 格式化为可读文本 |
| `get_llm_config(db, tenant_id, usage)` | LLM 配置查询 | 按 usage 查询，fallback 到 "general" |
| `build_param_mapping(db, action_id)` | 参数名映射 | 从 ActionParameter 的 `source_property` 构建 `{api_name: entity_name}` |

**意图识别算法**（核心逻辑）：

```
1. 遍历所有 published skills
2. 关键词匹配：命中 n 个 → score = 0.7 + min(n×0.1, 0.28)
3. 正则匹配：命中 → score = max(score, 0.9)，同时通过 groupdict() 抽取实体
4. 按 score 降序，取最高分候选
5. 若无候选 → LLM 兜底（confidence > 0.6 才采纳）
6. 若 LLM 也失败 → 返回 None
```

### 3.2 重构：stream_engine.py

**文件**：`backend/app/core/stream_engine.py`（1055 → 925 行，减少 130 行）

5 个函数替换为 pipeline 委托：

```python
from app.core import pipeline

def _recognize_intent(db, tenant_id, message, skills, ctx=None):
    """委托给 pipeline.recognize_intent"""
    return pipeline.recognize_intent(db, tenant_id, message, skills, ctx)

def _build_param_mapping(db, action_id):
    return pipeline.build_param_mapping(db, action_id)

def _render_template(template, data, entities):
    return pipeline.render_template(template, data, entities)

def _format_data_as_text(data):
    return pipeline.format_data_as_text(data)

def _get_llm_config(db, tenant_id, usage):
    return pipeline.get_llm_config(db, tenant_id, usage)
```

**保留在 stream_engine 的函数**（SSE 专有逻辑）：

- `stream_dialog()` — 主入口，SSE 事件流
- `_stream_dialog_inner()` — 完整处理链
- `_stream_text()` — 文本拆分为流式事件
- `_enhanced_entity_extraction()` — LLM 增强实体抽取
- `_get_entity_definitions()` — 实体定义查询
- `_execute_tool_with_events()` — 工具执行（带 AG-UI 事件）
- `_apply_output_aggregation()` — 输出聚合
- `_stream_llm_reply()` — 流式 LLM 回复
- `_build_card_event()` / `_build_quick_actions()` / `_build_confirm_fields()` — UI 卡片构建

### 3.3 重构：engine.py

**文件**：`backend/app/core/engine.py`（415 → 295 行，减少 120 行）

5 个 `DialogEngine` 方法替换为 pipeline 委托：

```python
from app.core import pipeline

class DialogEngine:
    def _recognize_intent(self, message, skills, ctx=None):
        """委托给 pipeline，丢弃第 4 个返回值 (detail)"""
        skill, confidence, entities, _detail = pipeline.recognize_intent(
            self.db, self.tenant_id, message, skills, ctx,
        )
        return skill, confidence, entities

    def _build_param_mapping(self, action_id):
        return pipeline.build_param_mapping(self.db, action_id)

    def _render_template(self, template, data, entities):
        return pipeline.render_template(template, data, entities)

    def _format_data_as_text(self, data):
        return pipeline.format_data_as_text(data)

    def _get_llm_config(self, usage):
        return pipeline.get_llm_config(self.db, self.tenant_id, usage)
```

> **兼容性说明**：engine.py 的 `_recognize_intent` 返回 3-tuple（向后兼容），而 stream_engine.py 返回 4-tuple（含 detail 用于全链路日志）。pipeline 统一返回 4-tuple，engine 端忽略第 4 项。

### 3.4 新增：测试基础设施

#### conftest.py（240 行）

**文件**：`backend/tests/conftest.py`

- **测试数据库**：MySQL `beaver_ai_test`（与生产同 Docker 实例，独立库）
- **隔离策略**：事务回滚（每个测试在 SAVEPOINT 内执行，结束后 ROLLBACK）
- **技术选型**：最初尝试 SQLite in-memory，因 BigInteger 自增主键不兼容而放弃

**Factory 类**（10 个工厂方法）：

| 方法 | 创建对象 | 关键参数 |
|------|----------|----------|
| `connector()` | Connector | base_url, auth_type, mock_enabled |
| `llm_config()` | LLMConfig | usage, provider, model |
| `entity()` | Entity | entity_code, connector |
| `entity_property()` | EntityProperty | entity, name, type |
| `action()` | Action | entity, connector, http_method, api_path |
| `action_parameter()` | ActionParameter | action, name, source_property |
| `chat_session()` | ChatSession | session_id |
| `skill()` | Skill | skill_code, keywords, patterns |
| `skill_tool()` | SkillTool | skill, entity, action, tools_mode |

#### 测试文件（5 个，共 40 个测试用例）

| 文件 | 测试数 | 覆盖范围 |
|------|--------|----------|
| `test_01_intent_recognition.py` | 8 | 关键词匹配(单/多)、得分排序、正则+实体抽取、无匹配、LLM fallback、低置信度拒绝、LLM 异常降级 |
| `test_02_entity_extraction.py` | 9 | 实体合并(覆盖/空/None 保护)、日期归一化(近两周/今天/无日期)、状态映射、convert_params |
| `test_03_tool_execution.py` | 8 | entity+action 模式、无 connector mock 回退、事件生命周期、api_config 模式、参数映射、聚合(count/sum) |
| `test_04_slot_check.py` | 7 | 必填参满足、缺失必填、默认值填充、固定参数跳过、可选参数、追问文本生成 |
| `test_05_e2e_dialog.py` | 8 | 完整链路(关键词→mock→回复)、模板响应、无技能、无匹配、槽位追问、跨轮上下文保持、意图切换清除实体 |

**执行结果**：40/40 通过，0.73 秒

```
tests/test_01_intent_recognition.py ........        [20%]
tests/test_02_entity_extraction.py .........        [42%]
tests/test_03_tool_execution.py ........            [62%]
tests/test_04_slot_check.py .......                 [80%]
tests/test_05_e2e_dialog.py ........                [100%]
============================== 40 passed in 0.73s ==============================
```

### 3.5 新增：战略文档

`docs/0316/` 目录下新增 8 篇战略规划文档和 1 篇兼容性分析：

| 编号 | 文件 | 定位 |
|------|------|------|
| 01 | 河狸云AI-Kernel-总纲.md | 整体架构路线图（5 阶段） |
| 02 | 面向Copilot与AI开发的改造指南.md | AI 辅助开发规范 |
| 03 | 面向开发团队的协作与改造指南.md | 团队协作流程 |
| 04 | 面向客户的能力说明与价值主张.md | 产品价值包装 |
| 05 | 面向我自己的指挥手册.md | 项目管理决策框架 |
| 06 | beaver-ai-agent-代码改造意见.md | 代码层面具体改造建议 |
| 07 | 改造兼容性分析.md | 升级安全性分析 + SOP |
| — | beaver_ai_docs_overview.md | 文档全局索引 |

---

## 4. 架构变化图

### 重构前

```
stream_engine.py (1055行)        engine.py (415行)
├── _recognize_intent()          ├── _recognize_intent()     ← 重复
├── _render_template()           ├── _render_template()      ← 重复
├── _format_data_as_text()       ├── _format_data_as_text()  ← 重复
├── _get_llm_config()            ├── _get_llm_config()       ← 重复
├── _build_param_mapping()       ├── _build_param_mapping()  ← 重复
├── _stream_text()               ├── _execute_tool()
├── _enhanced_entity_extraction()├── _generate_reply_with_llm()
├── _execute_tool_with_events()  └── execute_action()
└── ... (SSE 专有逻辑)
```

### 重构后

```
pipeline.py (201行) ← 单一数据源
├── recognize_intent()
├── render_template()
├── format_data_as_text()
├── get_llm_config()
└── build_param_mapping()
         ↑                    ↑
stream_engine.py (925行)     engine.py (295行)
├── _recognize_intent()      ├── _recognize_intent()
│   → pipeline.recognize_intent()  → pipeline.recognize_intent() [丢弃detail]
├── _render_template()       ├── _render_template()
│   → pipeline.*             │   → pipeline.*
├── ... (SSE专有逻辑)        ├── _execute_tool()     (引擎专有)
└── 卡片/事件/流式           └── _generate_reply()   (引擎专有)
```

---

## 5. 遇到的问题与解决

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| SQLite 测试失败 | BigInteger 主键在 SQLite 无法自增 | 改用 MySQL `beaver_ai_test` 库 |
| 上下文保持测试失败 (39/40) | `save_context()` 需要预创建 `ChatSession` 行 | Factory 新增 `chat_session()` 工厂方法 |
| LLM mock 失效 (3/40) | `_recognize_intent` 委托 pipeline 后，mock 目标路径变了 | `app.core.stream_engine.call_llm_for_intent` → `app.core.pipeline.call_llm_for_intent` |
| 07 文档损坏 | 下载到的是 Cloudflare challenge HTML | 删除后手写 Markdown |

---

## 6. 风险与注意事项

- **测试数据库**：`beaver_ai_test` 与生产共用同一 MySQL 实例（端口 13306），但库完全隔离
- **事务隔离**：测试使用 SAVEPOINT 回滚，不会污染测试库
- **engine.py 兼容性**：`_recognize_intent` 返回 3-tuple（丢弃 detail），调用方代码无需修改
- **stream_engine.py 内部引用**：`_enhanced_entity_extraction()` 中调用 `_get_llm_config()` 已自动走 pipeline
- **备份策略**：每个大版本升级前执行 mysqldump → `backup/` 目录

---

## 7. 下一步：Stage 1

Stage 1 目标：**统一数据模型层**

- 引入 `BaseModel` 统一基类（含 tenant_id, created_at, updated_at 等公共字段）
- Schema 层分离（Request/Response/Internal DTO）
- Alembic 迁移脚本标准化
- 测试扩展至数据模型层

参考文档：`docs/0316/06-beaver-ai-agent-代码改造意见.md` Stage 1 章节
