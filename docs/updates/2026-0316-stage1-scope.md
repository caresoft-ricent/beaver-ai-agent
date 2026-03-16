# Stage 1：Scope 接入 — BeaverSessionScope

> 迭代日期：2026-03-16  
> Git 范围：`stage1-pre` (fb847f7) → `stage1-done`  
> 前置：Stage 0 完成（pipeline 抽取 + 40 测试）

---

## 1. 迭代目标

让系统知道「谁在哪个企业做什么」——从河狸云前端请求 Header 中提取用户/企业上下文，贯穿引擎全链路。

### 完成标志

- [x] `BeaverSessionScope` 类可从请求 Header 正确提取
- [x] 双引擎入口（stream_dialog / DialogEngine）接收 Scope 参数
- [x] 证据链和日志自动记录 enterprise_id / ouid
- [x] 无 Header 时优雅降级（兼容现有调用方）
- [x] 57/57 测试全部通过

---

## 2. 实现详情

### 2.1 新增：kernel/scope.py

**文件**：`backend/app/kernel/scope.py`（~90 行）

#### BeaverSessionScope 数据类

```python
class BeaverSessionScope(BaseModel):
    # 核心身份（从 Header 提取）
    ouid: str = ""                # 全局用户 ID
    enterprise_id: str = ""       # 企业编码（RYSGS / BLOGI）
    member_id: str = ""           # 成员 ID
    org_id: str = ""              # 组织 ID
    token: str = ""               # JWT（去掉 Bearer）

    # 扩展上下文（后续通过缓存补充）
    display_name: str = ""        # 用户名
    enterprise_name: str = ""     # 企业名
    current_module: str = ""      # 当前模块（从 Referer 解析）

    # 内部映射
    tenant_id: Optional[int] = None   # 兼容现有 int 体系
```

**关键属性**：

| 属性 | 返回值 | 说明 |
|------|--------|------|
| `is_authenticated` | bool | enterprise_id 和 ouid 都非空 |
| `log_identity` | str | `"RYSGS/495232"` 或 `"anonymous"` |

#### extract_scope(request) 函数

从 FastAPI Request 的 Header 提取 Scope：

```
Authorization: Bearer eyJ... → token = "eyJ..."
Enterpriseid: RYSGS          → enterprise_id = "RYSGS"
Memberid: 1583859             → member_id = "1583859"
Orgid: RYSGS                  → org_id = "RYSGS"
Ouid: 495232                  → ouid = "495232"
Referer: .../enterprise/RYSGS/service/list → current_module = "service/list"
```

兼容策略：Header 不存在时字段为空字符串，不抛异常。

### 2.2 改造：对话 API 端点

**文件**：`backend/app/api/v1/chat.py`

三个端点均改造为提取和传递 Scope：

| 端点 | 改动 |
|------|------|
| `POST /completions` | 新增 `request: Request` 参数 → `extract_scope()` → 传给 DialogEngine |
| `POST /stream` | `extract_scope()` → 传给 `stream_dialog()` |
| `POST /actions` | 传递默认空 Scope（兼容） |

### 2.3 改造：引擎入口

**stream_engine.py** — `stream_dialog()` 新增 `scope: BeaverSessionScope = None` 参数：
- 默认值 `None` → 自动创建空 Scope（向后兼容）
- 传递给 `EvidenceCollector`

**engine.py** — `DialogEngine.__init__()` 新增 `scope` 参数：
- 存储为 `self.scope`
- 传递给 `EvidenceCollector`

### 2.4 改造：证据链

**evidence.py** — `EvidenceCollector.__init__()` 新增 `scope` 参数：

- 日志增强：`═══ 对话链路开始 ═══ session=xxx customer=xxx enterprise=RYSGS`
- `to_dict()` 输出增强：认证 Scope 自动包含 `scope` 字段

```json
{
  "session_id": "sess_001",
  "total_duration_ms": 123,
  "scope": {
    "enterprise_id": "RYSGS",
    "ouid": "495232",
    "member_id": "1583859",
    "org_id": "RYSGS",
    "current_module": "service/list"
  },
  "steps": [...],
  "errors": [...]
}
```

---

## 3. 测试验证

### 3.1 新增测试：test_06_scope.py（17 个用例）

| 测试类 | 用例数 | 覆盖范围 |
|--------|--------|----------|
| TestBeaverSessionScope | 4 | 默认值、认证判断、部分字段、tenant_id 映射 |
| TestExtractScope | 7 | 完整 Header、空 Header、Bearer 剥离（大小写）、非 Bearer、Referer 解析、无 enterprise |
| TestEvidenceWithScope | 3 | 认证 Scope 写入证据链、无 Scope、匿名 Scope |
| TestEngineWithScope | 3 | 引擎接受 Scope、默认 Scope、带 Scope 端到端对话 |

### 3.2 回归结果

```
tests/test_01_intent_recognition.py ........                  [14%]
tests/test_02_entity_extraction.py .........                  [29%]
tests/test_03_tool_execution.py ........                      [43%]
tests/test_04_slot_check.py .......                           [57%]
tests/test_05_e2e_dialog.py ........                          [70%]
tests/test_06_scope.py .................                      [100%]
============================== 57 passed in 0.83s ==============================
```

- Stage 0 原有 40 测试：**全部通过**（零回归）
- Stage 1 新增 17 测试：**全部通过**
- FastAPI 应用正常加载：78 routes

---

## 4. 兼容性说明

| 场景 | 处理方式 |
|------|----------|
| 无 Header 请求（开发环境） | Scope 所有字段为空字符串，`is_authenticated = False` |
| 现有 tenant_id: int 体系 | 不变，Scope.tenant_id 为可选 int 映射字段 |
| API 路由 | 未改动任何路由，前端无需修改 |
| 数据库 | 无 Schema 变更，无需 Alembic 迁移 |

---

## 5. 变更文件清单

| 文件 | 变化类型 | 行数变化 |
|------|----------|----------|
| `backend/app/kernel/__init__.py` | 新增 | +0（空文件） |
| `backend/app/kernel/scope.py` | 新增 | +90 |
| `backend/app/core/stream_engine.py` | 修改 | +5 |
| `backend/app/core/engine.py` | 修改 | +5 |
| `backend/app/core/evidence.py` | 修改 | +15 |
| `backend/app/api/v1/chat.py` | 修改 | +10 |
| `backend/tests/test_06_scope.py` | 新增 | +195 |
| `docs/WORK_SUMMARY.md` | 更新 | 架构图/目录/改造进度 |
| `docs/使用手册.md` | 更新 | 新增第十二章 Scope 说明 |
| `docs/updates/2026-0316-action-plan.md` | 新增 | 5 阶段行动计划 |

---

## 6. 下一步：Stage 2

Stage 2 目标：**Capability 注册体系**

- Action 模型扩展 `capability_code`, `side_effect_type`
- 实现 CapabilityRegistry 注册与查询
- input_schema / output_schema (JSON Schema)
- 技能通过 capability_code 引用能力

参考文档：`docs/0316/06-beaver-ai-agent-代码改造意见.md` Stage 2 章节
