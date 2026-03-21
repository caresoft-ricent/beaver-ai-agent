"""
操作模型 - 本体上的操作(API调用)

rc_ai_action           → Action (操作)
rc_ai_action_parameter → ActionParameter (操作参数)
"""
from sqlalchemy import (
    Column, BigInteger, String, Text, DateTime, Integer, Boolean, JSON, func
)
from app.database import Base


class Action(Base):
    """操作 - API调用定义，必须关联本体 (殷明: rc_ai_action)"""
    __tablename__ = "rc_ai_action"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    tenant_id = Column(BigInteger, nullable=False, index=True, comment="租户ID")
    entity_id = Column(BigInteger, nullable=False, index=True, comment="所属本体ID")
    connector_id = Column(BigInteger, nullable=True, index=True, comment="关联连接器ID(独立操作时必填)")
    action_code = Column(String(64), nullable=False, comment="操作编码")
    action_name = Column(String(128), nullable=False, comment="操作名称")
    action_description = Column(Text, comment="操作描述(给AI理解用)")
    category = Column(String(64), default="", comment="分类标签: 用于归类管理")
    tags = Column(JSON, comment="标签(JSON数组): 便于搜索筛选")
    http_method = Column(String(8), default="GET", comment="HTTP方法: GET/POST/PUT/DELETE")
    api_path = Column(String(512), comment="API路径(相对于连接器base_url)")
    request_template = Column(JSON, comment="请求模板(JSON)")
    response_mapping = Column(JSON, comment="响应映射(JSON): 将API返回映射到本体属性")
    response_description = Column(Text, comment="响应数据说明: 描述API返回字段的业务含义，如枚举值映射等，提交给LLM辅助生成回复")
    # ── Stage 2: Capability 注册字段 ──
    capability_code = Column(String(128), nullable=True, index=True, comment="能力编码: entity_code.action_code 格式, 如 issue.close")
    side_effect_type = Column(String(16), nullable=True, default="read", comment="副作用类型: read/write/delete")
    input_schema = Column(JSON, nullable=True, comment="输入参数 JSON Schema")
    output_schema = Column(JSON, nullable=True, comment="输出参数 JSON Schema")
    # ── Stage 3: Policy 配置字段 ──
    requires_confirmation = Column(Boolean, nullable=True, default=False, comment="是否需要用户确认(写/删操作)")
    policy_config = Column(JSON, nullable=True, comment="安全策略配置(JSON): scope_check, preconditions, rate_limit等")
    cache_ttl = Column(Integer, default=0, comment="缓存时间(秒), 0=不缓存")
    mock_response = Column(JSON, comment="Mock响应数据(JSON)")
    # v6 新增字段
    action_type = Column(String(16), default="query", comment="查询/写操作: query/mutation")
    risk_level = Column(String(16), default="low", comment="风险等级: low/medium/high")
    generated_by = Column(String(16), default="manual", comment="数据来源: manual/llm/api_sync")
    discovery_status = Column(String(16), default="published", comment="审核状态: draft/reviewed/published")
    # 2.0 新增
    domain_id = Column(BigInteger, comment="所属 Domain（冗余，方便查询）")
    evidence_schema = Column(JSON, comment="证据项定义")
    response_type = Column(String(16), default="text", comment="默认输出形式: text/table/card/confirm/mixed")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class ActionParameter(Base):
    """操作参数 - 操作的输入输出参数定义 (殷明: rc_ai_action_parameter)"""
    __tablename__ = "rc_ai_action_parameter"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    action_id = Column(BigInteger, nullable=False, index=True, comment="所属操作ID")
    property_id = Column(BigInteger, comment="关联本体属性ID")
    name = Column(String(64), nullable=False, comment="API参数名(实际发送给API的字段名)")
    source_property = Column(String(64), comment="来源属性名(本体/上下文中的语义字段名, 如为空则与name相同)")
    type = Column(String(32), nullable=False, comment="参数类型")
    title = Column(String(128), comment="参数标题(中文)")
    param_description = Column(Text, comment="参数说明")
    is_input = Column(Boolean, default=False, comment="是否为输入参数")
    is_output = Column(Boolean, default=False, comment="是否为输出参数")
    direction = Column(String(8), default="input", comment="方向(兼容旧数据): input/output")
    is_required = Column(Boolean, default=False, comment="是否必填")
    default_value = Column(String(256), comment="默认值")
    value_type = Column(String(32), default="none", comment="取值方式: none/fixed/count/sum/local_func")
    # v6 新增字段
    enum_values = Column(JSON, comment="枚举值")
    semantic_role = Column(String(16), comment="语义角色: identifier/status/scope/timestamp/metric/label/content")
    generated_by = Column(String(16), default="manual", comment="数据来源: manual/llm")
    # 2.0 映射字段
    filter_type = Column(String(50), comment="河狸云 filterType: String/Integer/Long/Decimal/Boolean/Date/Time/DateTime/set")
    filter_condition = Column(String(50), comment="河狸云条件类型: equals/contains/greaterThan/lessThan/inRange 等")
    value_mode = Column(String(20), default="filter", comment="值传递模式: filter/values/range/date_range")
    agg_func = Column(String(50), comment="聚合函数: sum/count/distinctCount/avg/max/min/first/last/percent/formula")
    sort_order = Column(String(4), comment="排序方式: asc/desc")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
