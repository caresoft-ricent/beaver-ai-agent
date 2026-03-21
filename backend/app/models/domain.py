"""业务域模型 — rc_ai_domain

2.0 运行时第一装载对象。
Domain 是对一组 Entity/Action 的业务聚合，
Planner 的第一步是确定 Domain，而不是匹配 Skill。
"""
from sqlalchemy import (
    Column, BigInteger, String, Text, DateTime, Integer, Boolean, JSON, Numeric, func
)
from app.database import Base


class Domain(Base):
    """业务域"""
    __tablename__ = "rc_ai_domain"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    tenant_id = Column(BigInteger, nullable=False, index=True, comment="租户ID")
    code = Column(String(100), nullable=False, unique=True, comment="域编码")
    name = Column(String(200), nullable=False, comment="域名称")
    description = Column(Text, comment="域描述（给 LLM 和 Planner 读的）")
    version = Column(Integer, default=1, comment="版本号")
    status = Column(String(16), default="draft", comment="发布状态: draft/reviewed/published/deprecated")
    generated_by = Column(String(16), default="manual", comment="来源: manual/llm/leiden/domain_auto")
    confidence = Column(Numeric(3, 2), default=1.00, comment="置信度")
    default_risk_level = Column(String(8), default="low", comment="域默认风险等级: low/medium/high")
    requires_scope_check = Column(Boolean, default=True, comment="是否强制 scope 校验")
    response_style = Column(String(8), default="mixed", comment="默认输出风格: text/card/table/mixed")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
