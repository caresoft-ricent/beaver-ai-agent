"""API dependencies - 数据库会话、认证等"""
from fastapi import Depends, HTTPException, Header
from sqlalchemy.orm import Session
from typing import Optional

from app.database import get_db
from app.models.admin import AdminUser
from app.config import get_settings


def get_current_admin(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> AdminUser:
    """简单token认证 - 后续可切换为JWT"""
    if not authorization:
        raise HTTPException(status_code=401, detail="未登录")

    from jose import jwt, JWTError
    settings = get_settings()
    token = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else authorization
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="无效token")
    except JWTError:
        raise HTTPException(status_code=401, detail="无效token")

    user = db.query(AdminUser).filter(AdminUser.id == int(user_id)).first()
    if not user or user.status != "active":
        raise HTTPException(status_code=401, detail="用户不存在或已禁用")
    return user
