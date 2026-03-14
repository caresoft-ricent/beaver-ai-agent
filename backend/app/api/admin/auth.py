"""认证接口 - 登录、初始化管理员"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
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
