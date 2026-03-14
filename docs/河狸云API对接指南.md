# 河狸云 API 对接指南

> 本文档面向后端同事，说明如何将 AI 智能客服系统从 Mock 模式切换到河狸云真实 API。  
> 日期：2026-03-14

---

## 一、当前状态

系统已完成全部基础功能开发，**目前以 Mock 模式运行**：

| 组件 | 状态 | 说明 |
|------|------|------|
| 连接器 | ✅ Mock模式 | base_url 已配置，mock_enabled=1 |
| 业务本体 | ✅ 已配置 | 产线(production_line)、现场人员(field_staff) |
| 操作/Action | ✅ Mock数据 | 每个 Action 有 mock_response |
| 对话引擎 | ✅ 正常工作 | 关键词匹配 → 工具链 → Mock数据 → 回复 |
| 河狸云客户端 | ✅ 已开发 | `backend/app/clients/beaver_cloud.py` |

**目标**：将 Mock 数据替换为河狸云真实 API 返回的数据。

---

## 二、需要河狸云侧准备的内容

### 2.1 API 认证信息

| 项目 | 说明 | 示例 |
|------|------|------|
| **OpenAPI 基地址** | 河狸云 API 的根地址 | `https://openapi.beavercloud.com/v1` |
| **认证方式** | Bearer Token 还是 API Key？Header 名是什么？ | `Authorization: Bearer xxx` |
| **API Key / Token** | 实际的认证凭证 | `sk-xxxxxxxxxxxxxxxx` |
| **健康检查路径** | 可选，用于连接测试 | `/health` 或 `/ping` |

### 2.2 需要确认的 API 接口

我们当前需要对接以下业务场景，请确认河狸云是否有对应接口：

#### 场景一：查询产线/交货进度

```
请求：GET /production/lines?customer_id={customer_id}
      或 GET /production/progress?line_code={line_code}

期望返回字段：
  - line_code    产线编号（如 25B1339-G）
  - line_name    产线名称
  - progress     进度百分比
  - status       状态（生产中/已完成/已排产）
  - delivery_date  预计交货日期
```

#### 场景二：查询驻厂/现场人员

```
请求：GET /field/staff?line_code={line_code}

期望返回字段：
  - name         姓名
  - role         角色（质检/工程/项目经理）
  - phone        联系电话
  - line_code    关联产线编号
```

#### 场景三：（后续扩展）

- 投诉提交：`POST /complaints`
- 返修申请：`POST /repair-requests`
- 订单查询：`GET /orders`

### 2.3 河狸云 API 响应格式确认

我们的客户端默认处理以下标准响应格式：

```json
{
  "code": 0,           // 0=成功，非0=错误
  "message": "ok",
  "data": {            // 业务数据
    "items": [...],    // 列表数据
    "total": 100       // 可选：总数
  }
}
```

**请确认**：河狸云的实际响应格式是否与此一致？如不一致，请提供实际格式示例。

---

## 三、对接步骤（配置操作）

一旦拿到上述信息，按以下步骤操作（无需改代码）：

### 步骤 1：更新连接器配置

打开管理后台 → 连接器管理 → 编辑"河狸云"连接器：

| 字段 | 操作 |
|------|------|
| Base URL | 改为真实 API 地址，如 `https://openapi.beavercloud.com/v1` |
| 认证方式 Header名 | 填写认证头名称，通常为 `Authorization` |
| 认证密钥/Token | 填写实际的 API Key，如 `Bearer sk-xxxx` |
| Mock模式 | **关闭**（取消勾选） |
| 健康检查路径 | 填写 `/health` 或留空 |

配置完后点击「测试连接」验证是否能通。

### 步骤 2：更新 Action 的 API 路径

打开管理后台 → 业务本体 → 选择"产线" → 点击「属性/操作」：

**产线实体的操作**：
| 字段 | 当前值(Mock) | 改为 |
|------|-------------|------|
| API路径 | — | `production/lines` 或河狸云实际路径 |
| HTTP方法 | GET | 根据实际情况 |
| mock_response | 有Mock数据 | 保留（作为降级兜底） |

**现场人员实体的操作**：
| 字段 | 当前值(Mock) | 改为 |
|------|-------------|------|
| API路径 | — | `field/staff` 或河狸云实际路径 |
| HTTP方法 | GET | 根据实际情况 |

> **提示**：Action 的 `mock_response` 可以保留！当真实 API 调用失败时，系统会自动降级到 Mock 数据。

### 步骤 3：配置响应映射（如需）

如果河狸云返回的字段名与我们本体属性名不一致，需要配置 `response_mapping`。

**示例**：假设河狸云返回 `productionLineCode` 但我们的属性叫 `line_code`

```json
{
  "line_code": "data.items.productionLineCode",
  "line_name": "data.items.productionLineName", 
  "progress": "data.items.completionRate"
}
```

此配置在数据库 `ai_action` 表的 `response_mapping` 字段中设置。目前需要直接在数据库操作，后续会增加页面编辑功能。

```sql
-- 示例：更新产线查询操作的响应映射
UPDATE ai_action SET 
  api_path = 'production/lines',
  response_mapping = '{"line_code":"data.productionLineCode","line_name":"data.productionLineName","progress":"data.completionRate"}'
WHERE action_code = 'query_production_progress';
```

### 步骤 4：验证

1. **连接测试**：连接器管理页 → 点击「测试连接」
2. **对话测试**：打开对话页面（/chat），发送"帮我看看交货进度"
3. **对比确认**：返回数据应来自真实 API 而非 Mock

---

## 四、技术细节（开发参考）

### 4.1 系统架构图

```
用户消息 "帮我看看交货进度"
    │
    ▼
对话引擎 (engine.py)
    │  ① 关键词匹配 → QUERY_PROGRESS 技能
    │  ② 加载工具链 → entity=产线, action=查询进度
    │  ③ 加载连接器配置
    ▼
ConnectorClient (connector_client.py)
    │  判断 mock_enabled?
    │  ├── 是 → 返回 mock_response
    │  └── 否 → 调用真实 API ↓
    ▼
BeaverCloudClient (beaver_cloud.py)
    │  GET {base_url}/production/lines
    │  Authorization: Bearer {api_key}
    ▼
河狸云 OpenAPI 服务器
    │  返回 {"code":0, "data":{...}}
    ▼
响应映射 → 回答生成 → 返回用户
```

### 4.2 核心文件说明

| 文件 | 职责 |
|------|------|
| `backend/app/core/engine.py` | 对话引擎，串联意图识别→工具链→回复生成 |
| `backend/app/clients/connector_client.py` | 通用连接器客户端，处理认证、Mock降级、请求模板 |
| `backend/app/clients/beaver_cloud.py` | 河狸云专用客户端，处理河狸云特有的响应格式 |
| `backend/app/models/action.py` | Action 模型，存储 api_path、request_template、response_mapping |
| `backend/app/models/config.py` | Connector 模型，存储 base_url、auth_config、mock_enabled |

### 4.3 数据库相关表

```sql
-- 连接器配置
SELECT id, name, type, base_url, auth_type, auth_config, mock_enabled 
FROM ai_connector;

-- 业务本体
SELECT id, entity_code, entity_name, entity_mode, connector_id 
FROM ai_entity;

-- 操作配置 (关键！需要更新 api_path)
SELECT id, entity_id, action_code, action_name, http_method, api_path, 
       request_template, response_mapping, mock_response 
FROM ai_action;
```

### 4.4 Mock 降级机制

`connector_client.py` 内置了自动降级逻辑：

```python
# 如果 API 调用失败且有 mock_response，自动使用 mock 数据
try:
    resp = client.get(url, headers=headers, params=params)
    resp.raise_for_status()
    ...
except httpx.HTTPError as e:
    if mock_response:
        return {"data": mock_response, "source": "mock_fallback", "error": str(e)}
    raise
```

所以即使真实 API 暂时不可用，系统也不会完全崩溃，会降级到 Mock 回复并标记来源为 `mock_fallback`。

---

## 五、常见问题

### Q: 如果河狸云的响应格式不是 `{code, message, data}` 怎么办？

修改 `beaver_cloud.py` 中的 `request()` 方法适配实际格式。或者直接使用通用的 `ConnectorClient`（它不假设响应格式）。

### Q: 如果需要 POST 请求带请求体怎么办？

在 Action 的 `request_template` 字段配置模板：

```json
{
  "customer_id": "${customer_id}",
  "page": 1,
  "page_size": 50
}
```

系统会自动用用户参数替换 `${变量}` 后发送请求。

### Q: 如何添加新的业务场景（如订单查询）？

1. 在「业务本体」页面新建实体（如 "订单"），关联连接器
2. 配置属性（order_no、amount、status...）
3. 配置操作（GET orders）
4. 在「技能管理」新建技能（如 "查询订单"），配关键词 "订单, 下单, 购买"
5. 在技能的工具链中关联 订单实体 → 查询操作
6. 发布实体 + 发布技能
7. 在对话中测试 "我的订单情况怎样"

### Q: API 需要传递 customer_id 参数怎么办？

对话引擎会自动从用户上下文传递 `customer_id`（对话请求中的字段）。如果需要从用户消息中提取参数（如产线编号），可以：

1. 配置实体属性 `is_input=true`
2. 系统会自动尝试从用户消息中提取该参数
3. 也可以配置"澄清交互"让系统追问用户

---

## 六、对接时间线建议

| 阶段 | 工作内容 | 预期产出 |
|------|---------|---------|
| **第一步** | 向河狸云团队申请 OpenAPI 权限和文档 | API 地址、Key、接口文档 |
| **第二步** | 用 Postman/curl 验证 API 可达性和返回格式 | 确认接口正常、字段定义 |
| **第三步** | 在管理后台配置连接器（关闭Mock） | 连接器测试通过 |
| **第四步** | 更新 Action 的 api_path 和 response_mapping | 对话能返回真实数据 |
| **第五步** | 端到端测试（对话页面完整流程） | 所有场景验证通过 |

---

## 七、联调测试命令

拿到真实 API 后，可以用以下命令快速验证：

```bash
# 1. 测试 API 直连（替换为真实地址和 Key）
curl -H "Authorization: Bearer YOUR_API_KEY" \
  https://openapi.beavercloud.com/v1/production/lines

# 2. 测试连接器（在管理后台配置后）
curl -X POST http://localhost:8000/api/admin/connectors/1/test

# 3. 测试完整对话流程
curl -X POST http://localhost:8000/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"tenant_id":1,"customer_id":"C001","message":"帮我看看交货进度"}'

# 观察返回中的 source 字段：
#   "source": "api"          ← 真实 API 数据 ✅
#   "source": "mock"         ← Mock 数据（还未切换）
#   "source": "mock_fallback" ← API 失败降级到 Mock
```

---

## 附录：当前 Mock 数据参考

以下是目前 Mock 模式返回的数据结构，真实 API 的返回应尽量对齐此格式（或通过 response_mapping 映射）：

**产线进度 Mock**：
```json
[
  {"line_code":"25B1339-G","line_name":"25B1339-G产线","progress":75,"status":"生产中","delivery_date":"2026-04-15"},
  {"line_code":"25B1340-H","line_name":"25B1340-H产线","progress":30,"status":"已排产","delivery_date":"2026-05-01"},
  {"line_code":"25A1201-F","line_name":"25A1201-F产线","progress":100,"status":"已完成","delivery_date":"2026-03-01"}
]
```

**现场人员 Mock**：
```json
[
  {"name":"张伟","role":"质检工程师","phone":"138-0000-1001","line_code":"25B1339-G"},
  {"name":"李娜","role":"项目经理","phone":"139-0000-1002","line_code":"25B1339-G"},
  {"name":"王磊","role":"驻厂工程师","phone":"137-0000-1003","line_code":"25B1340-H"}
]
```
