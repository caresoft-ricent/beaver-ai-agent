"""后台管理员模型"""
from sqlalchemy import (
    Column, BigInteger, String, DateTime, func
)
from app.database import Base


class AdminUser(Base):
    """管理员用户"""
    __tablename__ = "rc_ai_admin_user"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    username = Column(String(64), nullable=False, unique=True, comment="用户名")
    password_hash = Column(String(256), nullable=False, comment="密码哈希")
    display_name = Column(String(64), comment="显示名")
    role = Column(String(16), nullable=False, default="admin", comment="角色: superadmin/admin")
    status = Column(String(16), nullable=False, default="active", comment="active/disabled")
    last_login_at = Column(DateTime, comment="最后登录时间")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class OperationLog(Base):
    """操作审计日志"""
    __tablename__ = "rc_ai_operation_log"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    admin_user_id = Column(BigInteger, nullable=False, index=True)
    action = Column(String(64), nullable=False, comment="操作: create/update/delete/publish")
    resource_type = Column(String(32), nullable=False, comment="资源类型: entity/skill/connector等")
    resource_id = Column(BigInteger, comment="资源ID")
    detail = Column(String(512), comment="操作详情")
    created_at = Column(DateTime, server_default=func.now())
