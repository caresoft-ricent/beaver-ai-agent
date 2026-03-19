"""归一化规则 + 参数转换器 配置模型

支持后台动态维护:
- 日期短语规则 (date_phrase)
- 状态枚举映射 (status_mapping)
- 参数转换器 (param_converter)
"""
from sqlalchemy import (
    Column, BigInteger, String, Text, DateTime, Integer, JSON, Boolean, func
)
from app.database import Base


class NormalizationRule(Base):
    """归一化规则配置"""
    __tablename__ = "rc_ai_normalization_rule"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    tenant_id = Column(BigInteger, nullable=False, index=True, default=0, comment="租户ID, 0=全局")
    category = Column(String(32), nullable=False, index=True,
                      comment="规则类别: date_phrase / status_mapping / param_converter")
    rule_code = Column(String(64), nullable=False, comment="规则编码(唯一标识)")
    rule_name = Column(String(128), nullable=False, comment="规则名称(中文)")
    pattern = Column(String(512), comment="匹配正则(date_phrase用)")
    domain = Column(String(64), comment="所属域(status_mapping用): order_status/bill_status等")
    source_value = Column(String(128), comment="源值(status_mapping用): 未完成/已支付等")
    target_value = Column(String(128), comment="目标值: pending/paid等")
    config = Column(JSON, comment="扩展配置JSON")
    sort_order = Column(Integer, default=0, comment="排序")
    is_active = Column(Boolean, default=True, comment="是否启用")
    description = Column(Text, comment="说明")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
