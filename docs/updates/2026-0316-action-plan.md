# 河狸云 AI-Kernel 架构改造行动计划

> 创建日期：2026-03-16  
> 基于文档：`docs/0316/01-总纲.md` ~ `07-兼容性分析.md`  
> 当前进度：Stage 0 ✅ → Stage 1 ✅ → Stage 1.5 (引擎合并) ✅

---

## 总览：5 阶段路线图

| 阶段 | 名称 | 目标 | 核心产出 | 状态 |
|------|------|------|----------|------|
| Stage 0 | 测试基础 + Pipeline 抽取 | 安全网 + 消除重复 | pipeline.py + 40 测试 | ✅ 完成 |
| Stage 1 | Scope 接入 | 让系统知道"谁在哪个企业做什么" | BeaverSessionScope + 引擎改造 | ✅ 完成 (stage1-done) |
| Stage 1.5 | 引擎合并 | 同步引擎合并到流式 | /completions 走 stream_dialog | ✅ 完成 |
| Stage 2 | Capability 注册 | 统一能力注册体系 | CapabilityRegistry + 声明式能力 | ⬜ 待启动 |
| Stage 3 | Policy Guard | 安全执行策略 | PolicyGuard + 确认/权限/前置条件 | ⬜ 待启动 |
| Stage 4 | Orchestrator 升级 | 智能编排 | Orchestrator + 多步推理 | ⬜ 待启动 |

---

## Stage 0（已完成）

**Git**: `stage0-pre` → `stage0-done` (be7a4ac)  
**详细文档**: `docs/updates/2026-0316-stage0-pipeline-extraction.md`

### 交付物

1. `backend/app/core/pipeline.py` — 5 个共享函数，双引擎单一数据源
2. `backend/tests/` — 40 个金样例测试（0.73s 全通过）
3. `docs/0316/` — 8 篇战略文档 + 兼容性分析
4. `backup/` — 数据库备份 + `.gitignore`

### 完成标志 ✅

- [x] pipeline.py 5 函数从两引擎抽取
- [x] stream_engine.py / engine.py 委托 pipeline
- [x] 40/40 测试通过
- [x] FastAPI 应用正常启动（78 routes）

---

## Stage 1：Scope 接入

**目标**: 让系统知道"谁在哪个企业做什么"

### 背景

河狸云前端请求携带标准 Header：

| Header | 类型 | 示例 | 说明 |
|--------|------|------|------|
| Authorization | str | Bearer eyJ0eX... | JWT 登录态 |
| Enterpriseid | str | RYSGS | 企业编码（字符串！） |
| Memberid | str | 1583859... | 成员 ID |
| Orgid | str | RYSGS | 组织 ID |
| Ouid | str | 495232... | 全局用户 ID |

### 实施计划

| 步骤 | 内容 | 影响文件 |
|------|------|----------|
| 1.1 | 新增 `kernel/` 模块 + `scope.py` | 新文件 |
| 1.2 | 实现 `BeaverSessionScope` 数据类 | kernel/scope.py |
| 1.3 | 实现 `extract_scope()` 从请求 Header 提取 | kernel/scope.py |
| 1.4 | 改造对话 API 端点提取 Scope 并传递给引擎 | api/v1/chat.py |
| 1.5 | 改造 stream_engine 接收 scope 参数 | core/stream_engine.py |
| 1.6 | 改造 DialogEngine 接收 scope 参数 | core/engine.py |
| 1.7 | 改造 EvidenceCollector 记录企业上下文 | core/evidence.py |
| 1.8 | 新增测试覆盖 Scope 提取 + 引擎集成 | tests/ |

### 兼容性策略

- **tenant_id 不改类型**：当前 DB 中 tenant_id 为 BigInteger，本阶段保持不变
- **Scope 可选**：无 Header 时 Scope 降级为默认值，现有 API 继续正常工作
- **渐进增强**：Scope 信息先记录到日志和证据链，后续 Stage 逐步用于权限校验

### 完成标志

- [x] `BeaverSessionScope` 类可从请求 Header 提取
- [x] 引擎入口接收 Scope
- [x] 日志和证据链记录 enterprise_id
- [x] 测试全部通过 (57 tests → stage1-done)

---

## Stage 1.5：引擎合并（已完成）

**目标**: 同步引擎 `engine.py` 的生产路径合并到流式引擎 `stream_engine.py`

### 改动

- `/completions` 端点改为 async，调用 `stream_dialog()` 同步收集 SSE 事件
- `/actions` 端点内联 stub 逻辑，不再依赖 `DialogEngine`
- `chat.py` 移除 `from app.core.engine import DialogEngine`
- `engine.py` 保留供测试使用，生产流量统一走 `stream_engine`

### 收益

- `/completions` 和 `/stream` 走完全相同的处理链路
- 增强实体抽取、LLM 交互记录、上下文摘要等新功能自动覆盖 `/completions`
- 无需维护两套引擎逻辑

### 完成标志

- [x] `/completions` 使用 `stream_dialog` 收集结果
- [x] `chat.py` 无 `DialogEngine` 依赖
- [x] 77/77 测试通过

---

## Stage 2：Capability 注册（规划）

**目标**: 统一能力注册体系

### 核心概念

```python
class Capability:
    code: str              # "issue.close"
    display_name: str      # "关闭工单"
    side_effect: str       # "read" | "write" | "delete"
    input_schema: dict     # JSON Schema
    output_schema: dict    # JSON Schema
    policy_config: dict    # 安全策略
```

### 实施计划

- Action 模型扩展 `capability_code`, `side_effect_type`, `input_schema`, `output_schema`
- 实现 CapabilityRegistry 注册与查询
- 技能工具链通过 capability_code 引用能力
- Alembic 迁移脚本

---

## Stage 3：Policy Guard（规划）

**目标**: 安全执行策略

### 核心机制

- 写操作自动确认 (`requires_confirmation`)
- 企业级权限校验 (`scope_check: "enterprise"`)
- 前置条件检查 (`preconditions`)
- 频率限制

---

## Stage 4：Orchestrator 升级（规划）

**目标**: 智能编排引擎

### 核心能力

- 多步推理 + 自动分解
- 能力组合编排
- 上下文感知的能力选择
- 失败重试与降级策略

---

## 升级 SOP（每个 Stage 通用）

```
1. 备份数据库 → backup/
2. 创建 Git 标签: stageN-pre
3. 实施改造
4. 运行测试: pytest tests/ -v
5. 验证服务启动: FastAPI + 前端
6. 创建 Git 标签: stageN-done
7. 更新文档: updates/ + WORK_SUMMARY.md + 使用手册.md
```

## 风险红线

| 编号 | 红线 | 说明 |
|------|------|------|
| R1 | 不删已有字段 | 只新增，不改名不删列 |
| R2 | 新字段 nullable 或有默认值 | 确保旧数据兼容 |
| R3 | API 路由不改 | 前端无需修改 |
| R4 | 每 Stage 前备份 | mysqldump + git tag |
| R5 | 测试通过率 100% | 不允许跳过或忽略失败用例 |
