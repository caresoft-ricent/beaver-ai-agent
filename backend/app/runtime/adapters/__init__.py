"""Adapter Registry + 映射层

2.0 的核心新增: 把 ConnectorClient 的「一个类做所有事」拆分为:
  - AdapterRegistry: 按 adapter_type 分发
  - WebApiAdapter: HTTP 调用 + 请求/响应映射
  - DatabaseAdapter: 只读 SQL 查询（远期）
  - Mapper 层: Passthrough / BeaverDataset
"""
