"""租户模型 - 多租户隔离的基础"""
from sqlalchemy import (
    Column, BigInteger, String, Text, DateTime, JSON, func
)
from app.database import Base


class Tenant(Base):
    """租户 - SaaS多租户隔离"""
    __tablename__ = "rc_ai_tenant"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    name = Column(String(128), nullable=False, comment="租户名称")
    code = Column(String(64), nullable=False, unique=True, comment="租户编码")
    description = Column(Text, comment="租户描述")
    status = Column(String(16), nullable=False, default="active", comment="active/disabled")
    config = Column(JSON, comment="租户级配置(JSON)")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class TenantApiKey(Base):
    """租户API密钥 - 租户访问本系统的凭据"""
    __tablename__ = "rc_ai_tenant_api_key"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    tenant_id = Column(BigInteger, nullable=False, index=True, comment="租户ID")
    key_name = Column(String(64), nullable=False, comment="密钥名称")
    api_key = Column(String(128), nullable=False, unique=True, comment="API Key")
    api_secret = Column(String(256), nullable=False, comment="API Secret (hashed)")
    status = Column(String(16), nullable=False, default="active", comment="active/revoked")
    created_at = Column(DateTime, server_default=func.now())
    expires_at = Column(DateTime, comment="过期时间，null为永不过期")
