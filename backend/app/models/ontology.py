"""
业务本体模型 - 对应殷明设计的核心ER

rc_ai_entity          → Entity (本体)
rc_ai_entity_property → EntityProperty (本体属性)
rc_ai_entity_relation → EntityRelation (本体关系)
rc_ai_base_property   → BaseProperty (基础属性模板)
"""
from sqlalchemy import (
    Column, BigInteger, String, Text, DateTime, Boolean, Integer, JSON, Numeric, func
)
from app.database import Base


class BaseProperty(Base):
    """基础属性模板 - 跨本体复用的属性定义 (殷明: rc_ai_base_property)"""
    __tablename__ = "rc_ai_base_property"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    tenant_id = Column(BigInteger, nullable=False, index=True, comment="租户ID")
    code = Column(String(64), nullable=False, comment="属性编码")
    type = Column(String(32), nullable=False, comment="数据类型: string/number/date/boolean/json")
    name = Column(String(64), nullable=False, comment="属性名(英文)")
    title = Column(String(128), comment="属性标题(中文)")
    base_description = Column(Text, comment="属性描述(给AI理解用)")
    required_description = Column(Text, comment="必填时的说明")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class Entity(Base):
    """业务本体 - 业务实体抽象 (殷明: rc_ai_entity)"""
    __tablename__ = "rc_ai_entity"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    tenant_id = Column(BigInteger, nullable=False, index=True, comment="租户ID")
    entity_mode = Column(String(32), nullable=False, default="api",
                         comment="调用方式: api/database/mock")
    entity_code = Column(String(64), nullable=False, comment="本体编码")
    entity_name = Column(String(128), nullable=False, comment="本体名称")
    category = Column(String(64), default="", comment="分类标签: 用于归类管理")
    entity_description = Column(Text, comment="本体描述(给AI理解用)")
    connector_id = Column(BigInteger, comment="关联连接器ID")
    status = Column(String(16), nullable=False, default="draft", comment="draft/published")
    version = Column(Integer, default=1, comment="配置版本号")
    # v6 新增字段
    generated_by = Column(String(16), default="manual", comment="数据来源: manual/llm/api_sync/domain_auto")
    confidence = Column(Numeric(3, 2), default=1.00, comment="可信度")
    discovery_status = Column(String(16), default="published", comment="审核状态: draft/reviewed/published")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class EntityProperty(Base):
    """本体属性 - 本体的字段定义 (殷明: rc_ai_entity_property)"""
    __tablename__ = "rc_ai_entity_property"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    entity_id = Column(BigInteger, nullable=False, index=True, comment="所属本体ID")
    base_property_id = Column(BigInteger, comment="关联基础属性ID(可选)")
    type = Column(String(32), nullable=False, comment="数据类型")
    name = Column(String(64), nullable=False, comment="属性名(英文)")
    title = Column(String(128), comment="属性标题(中文)")
    is_input = Column(Boolean, default=False, comment="是否为输入参数")
    is_output = Column(Boolean, default=False, comment="是否为输出字段")
    is_required = Column(Boolean, default=False, comment="是否必填")
    property_description = Column(Text, comment="属性描述")
    required_description = Column(Text, comment="必填说明")
    # ── 大模型增强字段 ──
    llm_description = Column(Text, comment="给大模型看的描述(用于精确理解此参数含义)")
    extract_expression = Column(Text, comment="参数兜底提取规则(正则或表达式)")
    normalization_config = Column(JSON, comment="归一化配置: 同义词/日期/枚举转换规则(JSON)")
    mapping_config = Column(JSON, comment="参数映射配置: 转换规则如名称→ID(JSON)")
    # v6 新增字段
    semantic_role = Column(String(16), comment="语义角色: identifier/status/scope/timestamp/metric/label/content")
    enum_values = Column(JSON, comment="枚举值")
    generated_by = Column(String(16), default="manual", comment="数据来源: manual/llm")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class EntityRelation(Base):
    """本体关系 - 本体之间的关联 (殷明: rc_ai_entity_relation)"""
    __tablename__ = "rc_ai_entity_relation"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    entity_id = Column(BigInteger, nullable=False, index=True, comment="源本体ID")
    ref_entity_id = Column(BigInteger, nullable=False, index=True, comment="目标本体ID")
    property_id = Column(BigInteger, comment="源属性ID(关联字段)")
    ref_property_id = Column(BigInteger, comment="目标属性ID(关联字段)")
    relation_type = Column(String(16), default="1:N", comment="关系类型: belongs_to/has_many/references")
    description = Column(Text, comment="关系描述")
    # v6 新增字段
    join_property = Column(String(200), comment="关联字段")
    generated_by = Column(String(16), default="manual", comment="数据来源: manual/llm")
    created_at = Column(DateTime, server_default=func.now())
