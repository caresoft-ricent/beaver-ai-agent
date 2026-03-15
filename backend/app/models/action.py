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
    __tablename__ = "ai_action"

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
    cache_ttl = Column(Integer, default=0, comment="缓存时间(秒), 0=不缓存")
    mock_response = Column(JSON, comment="Mock响应数据(JSON)")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class ActionParameter(Base):
    """操作参数 - 操作的输入输出参数定义 (殷明: rc_ai_action_parameter)"""
    __tablename__ = "ai_action_parameter"

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
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
