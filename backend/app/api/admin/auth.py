"""认证接口 - 登录、初始化管理员、修改密码"""
import re
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from pydantic import BaseModel, field_validator
from passlib.hash import bcrypt
from jose import jwt
from datetime import datetime, timedelta

from app.database import get_db
from app.models.admin import AdminUser
from app.config import get_settings
from app.schemas.common import ResponseBase

router = APIRouter()


class LoginRequest(BaseModel):
    username: str
    password: str


class InitAdminRequest(BaseModel):
    username: str = "admin"
    password: str = "beaver2026"
    display_name: str = "超级管理员"


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("密码长度不能少于 8 位")
        if len(v) > 64:
            raise ValueError("密码长度不能超过 64 位")
        if not re.search(r"[A-Z]", v):
            raise ValueError("密码必须包含至少一个大写字母")
        if not re.search(r"[a-z]", v):
            raise ValueError("密码必须包含至少一个小写字母")
        if not re.search(r"\d", v):
            raise ValueError("密码必须包含至少一个数字")
        if not re.search(r"[!@#$%^&*()_+\-=\[\]{};':\",./<>?\\|`~]", v):
            raise ValueError("密码必须包含至少一个特殊字符")
        return v


def _get_current_user(db: Session, token_str: str) -> AdminUser:
    """从 Authorization header 解析当前用户"""
    settings = get_settings()
    try:
        payload = jwt.decode(token_str, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        user_id = int(payload["sub"])
    except Exception:
        raise HTTPException(status_code=401, detail="无效的认证令牌")
    user = db.query(AdminUser).filter(AdminUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="用户不存在")
    return user


@router.post("/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(AdminUser).filter(AdminUser.username == req.username).first()
    if not user or not bcrypt.verify(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    if user.status != "active":
        raise HTTPException(status_code=403, detail="用户已禁用")

    settings = get_settings()
    token = jwt.encode(
        {"sub": str(user.id), "exp": datetime.utcnow() + timedelta(minutes=settings.jwt_expire_minutes)},
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )
    user.last_login_at = datetime.utcnow()
    db.commit()

    return ResponseBase(data={
        "token": token,
        "user": {"id": user.id, "username": user.username, "display_name": user.display_name, "role": user.role},
    })


@router.post("/init")
def init_admin(req: InitAdminRequest, db: Session = Depends(get_db)):
    """初始化管理员(仅当无管理员时可用)"""
    existing = db.query(AdminUser).first()
    if existing:
        raise HTTPException(status_code=400, detail="管理员已存在，不可重复初始化")

    admin = AdminUser(
        username=req.username,
        password_hash=bcrypt.hash(req.password),
        display_name=req.display_name,
        role="superadmin",
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    return ResponseBase(data={"id": admin.id, "username": admin.username})


@router.post("/change-password")
def change_password(
    req: ChangePasswordRequest,
    authorization: str = Header(default=""),
    db: Session = Depends(get_db),
):
    """修改密码 - 需要提供旧密码验证，新密码需满足强度要求"""
    token_str = authorization.replace("Bearer ", "") if authorization else ""
    if not token_str:
        raise HTTPException(status_code=401, detail="未提供认证令牌")

    user = _get_current_user(db, token_str)

    if not bcrypt.verify(req.old_password, user.password_hash):
        raise HTTPException(status_code=400, detail="原密码错误")

    if req.old_password == req.new_password:
        raise HTTPException(status_code=400, detail="新密码不能与原密码相同")

    user.password_hash = bcrypt.hash(req.new_password)
    db.commit()
    return ResponseBase(message="密码修改成功")


@router.post("/reset-password")
def reset_password(db: Session = Depends(get_db)):
    """重置管理员密码为默认值 (仅开发/应急使用)

    重置条件: 数据库中仅有一个管理员账户时可用
    重置后密码: admin123
    """
    users = db.query(AdminUser).all()
    if len(users) != 1:
        raise HTTPException(status_code=403, detail="仅单管理员环境支持重置")
    user = users[0]
    user.password_hash = bcrypt.hash("admin123")
    db.commit()
    return ResponseBase(message=f"已重置用户 {user.username} 的密码为 admin123，请立即修改")
