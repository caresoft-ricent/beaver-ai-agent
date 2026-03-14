"""业务接口路由 - 对话、动作"""
from fastapi import APIRouter
from app.api.v1 import chat

router = APIRouter()
router.include_router(chat.router, prefix="/chat", tags=["对话"])
