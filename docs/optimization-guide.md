# 河狸云 AI Agent — 全链路配置分析与优化指南

## 一、当前配置链路分析

### 1.1 完整处理链

```
用户输入 ─→ [1]加载上下文 ─→ [2]意图识别 ─→ [3]实体抽取 ─→ [4]参数归一化
  ─→ [5]参数转换 ─→ [6]槽位校验 ─→ [7]工具执行(API调用) ─→ [8]回复生成 ─→ 输出
```

### 1.2 以"产线概况"为例的链路走查

| 步骤 | 当前状态 | 分析 |
|------|---------|------|
| **意图识别** | 关键词"产线概况,总览" → `QUERY_PROGRESS_OVER`，置信度0.95 | ✅ 正常，关键词命中效率高 |
| **实体抽取** | 返回空 (entities={}) | ✅ 正常——该查询不需要输入参数 |
| **参数归一化** | 跳过 (无实体) | ✅ 正常 |
| **槽位校验** | complete=true | ⚠️ 需关注——`groupCount`标记为`is_required=True`+`value_type=count`，当前因count类型被跳过而不追问，逻辑正确但配置有歧义 |
| **工具执行** | POST /api/v6/bi/query/bi_stage_all → 200, 2075ms | ✅ 成功，但无`request_template` |
| **回复生成** | LLM生成，返回20条产线数据 | ⚠️ 无`response_mapping`，全量数据发给LLM |

### 1.3 发现的配置问题

#### 问题1: POST 请求无 `request_template`
**现象**: `bi_stage_all` 是 POST 接口，但未配置 `request_template`。当前所有 entities + customer_id 都作为请求体发送。

**风险**: 多余的参数(如customer_id)被发送到业务API，可能导致接口报错或查询异常。

**建议配置**:
```json
{
  "page": 1,
  "pageSize": 100
}
```
如果API不需要任何参数，可配置空对象 `{}`。

#### 问题2: 无 `response_mapping`
**现象**: API返回完整JSON（含items、分页信息、元数据等），全部传给LLM生成回复。

**影响**:
- LLM接收大量冗余数据，消耗更多token
- 回复生成更慢
- LLM可能因数据量大而遗漏关键信息

**建议配置**:
```json
{
  "items": "data.items",
  "total": "data.total"
}
```
或更精确地只提取需要的字段。

#### 问题3: `groupCount` 参数配置歧义
**现象**: `groupCount` 同时标记为 `is_input=True`, `is_required=True`, `value_type=count`。

**分析**: `value_type=count` 表示这是一个输出聚合字段（统计items数量），不应该是输入参数。

**建议**: 将 `is_input` 改为 `False`，仅保留 `is_output=True`。或者如果确实需要传入 `groupCount` 参数，则去掉 `value_type=count`。

---

## 二、全链路日志系统说明

### 2.1 日志架构

系统采用 **双通道日志** 设计：

1. **Evidence Chain（证据链）** — 结构化JSON，存入 `ActionLog` 表，供管理后台查询
2. **Python Logger（服务端日志）** — 实时输出到控制台/日志文件，便于开发调试

### 2.2 日志命名空间

| Logger | 内容 |
|--------|------|
| `beaver.evidence` | 对话链路开始/结束、每步骤摘要 |
| `beaver.engine` | 引擎内部决策过程 |
| `beaver.connector` | HTTP API调用详情 |
| `beaver.llm` | LLM调用（模型、token消耗） |

### 2.3 Evidence Chain 字段说明

每次对话的证据链包含以下步骤，每步都记录 `detail` 和 `duration_ms`：

| Step | Detail字段 |
|------|-----------|
| `load_context` | turn, existing_entities, last_intent, has_summary, history_intents |
| `intent_recognition` | skill, skill_name, confidence, rule_entities, match_method, candidates, user_message |
| `intent_switch` | from, to, cleared_entities |
| `llm_entity_extraction` | llm_raw, merged_result |
| `normalize_entities` | before, after |
| `entity_extraction` | context_entities, rule_entities, after_merge, after_normalize, after_convert, final_entities |
| `slot_check` | complete, missing/missing_detail, provided_entities |
| `tool_{name}` | source, status_code, response_time_ms, request(method/path/params_keys/...), response_preview, aggregated |
| `tool_execution` | tools_count, results_count, tools_detail |
| `reply_generation` | method(template/llm/text_format/empty_result), model, prompt_preview, data_size |

### 2.4 查看日志

**服务端控制台**: 启动后端后，每次对话会输出类似：
```
10:30:01 [beaver.evidence] INFO ═══ 对话链路开始 ═══ session=abc123 customer=user1
10:30:01 [beaver.evidence] INFO ── [load_context] 2ms {"turn": 1, ...}
10:30:02 [beaver.evidence] INFO ── [intent_recognition] 999ms {"skill": "QUERY_PROGRESS_OVER", ...}
10:30:04 [beaver.evidence] INFO ── [tool_product_line.bi_stage_all] 2075ms {"source": "api", ...}
10:30:06 [beaver.evidence] INFO ═══ 对话链路结束 ═══ session=abc123 status=success total=5000ms
```

**管理后台**: ActionLog 表存储完整证据链JSON，可在操作日志页面按session_id查询。

---

## 三、系统优化方法论

### 3.1 意图识别优化

#### 关键词策略
- **核心词**: 每个技能配置 3-5 个高区分度关键词
- **同义词扩展**: 如"产线概况"可加"产线总览"、"生产线概况"、"产线情况"
- **避免冲突**: 不同技能的关键词不应重叠，否则低优先级技能会被淹没

#### 正则模式
适用于结构化输入，如 `(?P<line_name>\w+线)的(进度|概况)`

#### LLM兜底
- 配置 `intent_prompt` 为每个技能添加意图提示语
- 当关键词和模式都无法匹配时，LLM根据语义判断

#### 优化检查清单
- [ ] 查看日志中 `intent_recognition.candidates`，确认是否有多个高分候选（表示关键词冲突）
- [ ] 检查 `match_method` — 如果频繁走LLM兜底，说明关键词覆盖不足
- [ ] 通过 `confidence` 值分布调校阈值

### 3.2 实体抽取优化

#### 属性级配置
- **`llm_description`**: 为每个属性写清楚的自然语言描述，帮助LLM理解
- **`extract_expression`**: 正则表达式，用于直接从文本中提取值
- **`normalization_config`**: 同义词/枚举映射，将口语化输入转为标准值

#### 优化检查清单
- [ ] 查看日志中 `entity_extraction.after_merge` vs `after_normalize` vs `after_convert`，确认每步转换是否正确
- [ ] 如果LLM抽取结果为空但用户确实提到了参数，检查 `entity_definitions` 中的 description 是否足够明确
- [ ] 通过 `llm_entity_extraction.llm_raw` 检查LLM原始返回，判断是LLM理解问题还是后处理问题

### 3.3 API调用优化

#### request_template
- POST 接口**必须**配置 `request_template`，明确发送哪些参数
- 使用 `${param_name}` 语法引用参数
- 不需要输入参数的查询可配置 `{"page": 1, "pageSize": 100}`

#### response_mapping
- 配置从API响应中提取的字段路径
- 支持嵌套路径: `data.items`, `data.total`
- 减少传递给LLM的数据量，提升回复速度和质量

#### param_mapping (参数名映射)
- 当语义参数名(如 `line_code`)与API参数名(如 `regionId`)不同时配置
- 在 ActionParameter 的 `source_property` 字段指定语义参数名

#### 优化检查清单
- [ ] 查看日志中 `tool_*.request`，确认发送的参数是否正确
- [ ] 查看 `tool_*.response_time_ms`，如果超过3秒需优化API或添加mock降级
- [ ] 检查 `tool_*.status_code`，非200表示配置问题
- [ ] 如果 `response_preview` 数据量过大，配置 `response_mapping` 精简

### 3.4 回复生成优化

#### 模板回复 vs LLM回复
- **模板回复** (`response_template`): 速度快、确定性强，适合固定格式输出
- **LLM回复** (`response_prompt`): 灵活、自然，适合复杂数据解读

#### response_prompt 编写要点
1. 明确角色和口吻（如"你是河狸云客户服务助手"）
2. 指定数据解读方式（如"重点关注状态异常的产线"）
3. 限制回复长度（通过 `max_response_tokens` 控制）
4. 提供输出格式示例

#### 优化检查清单
- [ ] 查看日志中 `reply_generation.method` — 确认走的是预期的生成路径
- [ ] 如果用LLM, 检查 `data_size` — 超过10KB应配置 `response_mapping` 缩减
- [ ] 通过实际对话测试回复质量，调整 `response_prompt`

### 3.5 持续优化工作流

```
1. 测试对话 → 查看控制台全链路日志
2. 检查 Evidence Chain:
   - intent_recognition: 匹配是否准确？
   - entity_extraction: 参数提取是否完整？
   - slot_check: 是否有不必要的追问？
   - tool_*: API调用是否成功？耗时是否合理？
   - reply_generation: 回复方式是否最优？
3. 针对发现的问题调整配置
4. 重复测试验证
```

### 3.6 常见问题排查

| 症状 | 可能原因 | 检查点 |
|------|---------|--------|
| 意图识别错误 | 关键词冲突或覆盖不足 | `intent_recognition.candidates` |
| 实体抽取为空 | entity_definitions 定义不足 | `entity_extraction.final_entities` |
| 不必要的追问 | is_required 配置过多 | `slot_check.missing_detail` |
| API返回空 | request_template 配置错误 | `tool_*.request` |
| 回复质量差 | 数据量过大或prompt不够明确 | `reply_generation.data_size` |
| 回复缓慢 | API耗时长或LLM token过多 | `tool_*.response_time_ms` |

---

## 四、密码重置

如果忘记管理员密码，可通过API重置（仅单管理员环境）：
```bash
curl -X POST http://localhost:8000/api/admin/auth/reset-password
```
重置后密码为 `admin123`，请立即修改。
