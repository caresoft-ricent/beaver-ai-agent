"""Session 路由 — /go, /refresh, /chat 入口保护

/go?ticket=xxx        → 河狸云跳转入口，创建 Session 后重定向
/refresh              → 河狸云回调，刷新或销毁 Session
/chat?session_id=xxx  → Chat 入口保护，无 session 提示从河狸云进入
"""
from __future__ import annotations
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse, HTMLResponse
from redis import asyncio as aioredis

from app.config import get_settings
from app.session.session_manager import SessionManager
from app.session.ticket_handler import TicketHandler

logger = logging.getLogger("beaver.session")
router = APIRouter()

# Redis 连接单例
_redis_pool: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis:
    global _redis_pool
    if _redis_pool is None:
        settings = get_settings()
        _redis_pool = aioredis.from_url(settings.redis_url, decode_responses=True)
    return _redis_pool


async def get_session_manager() -> SessionManager:
    redis = await get_redis()
    return SessionManager(redis)


@router.get("/go")
async def go(ticket: str, sm: SessionManager = Depends(get_session_manager)):
    """河狸云跳转入口 → 创建 Session → 重定向到 chat 页面"""
    try:
        handler = TicketHandler(sm)
        session = await handler.handle_go(ticket)
        logger.info("go: session created session_id=%s user_id=%s",
                     session["session_id"], session["user_id"])
        return RedirectResponse(f"/chat?session_id={session['session_id']}")
    except Exception as e:
        logger.error("go: failed ticket=%s error=%s", ticket[:8] + "...", e)
        raise HTTPException(status_code=502, detail=f"无法验证身份: {e}")


@router.get("/refresh")
async def refresh(
    userId: int,
    appSecret: str,
    ticket: str = None,
    sm: SessionManager = Depends(get_session_manager),
):
    """河狸云回调 → 刷新或销毁 Session"""
    try:
        handler = TicketHandler(sm)
        result = await handler.handle_refresh(
            ticket=ticket, user_id=userId, app_secret=appSecret,
        )
        if result:
            logger.info("refresh: session refreshed user_id=%s", userId)
            return {"status": "refreshed", "session_id": result["session_id"]}
        else:
            logger.info("refresh: session destroyed user_id=%s", userId)
            return {"status": "exited"}
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        logger.error("refresh: failed user_id=%s error=%s", userId, e)
        raise HTTPException(status_code=502, detail=f"刷新失败: {e}")


@router.get("/session/info")
async def session_info(
    session_id: str,
    sm: SessionManager = Depends(get_session_manager),
):
    """获取当前 Session 信息（前端用，不含 headers 敏感信息）"""
    session = await sm.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在或已过期")
    return {
        "session_id": session["session_id"],
        "user_id": session["user_id"],
        "user_name": session["user_name"],
        "display_name": session["display_name"],
        "ou_name": session["ou_name"],
        "ou_type": session["ou_type"],
    }
