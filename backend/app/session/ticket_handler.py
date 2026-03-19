"""TicketHandler — /go + /refresh 业务逻辑

身份流程：
  /go?ticket=xxx  → 调 APP_RETRIEVE_URL 获取 UserSessionVo → 存 Redis Session
  /refresh        → 有 ticket 刷新 Session / 无 ticket 销毁 Session
"""
from __future__ import annotations
import logging

import httpx

from app.config import get_settings
from app.session.session_manager import SessionManager

logger = logging.getLogger("beaver.session")


class TicketHandler:
    def __init__(self, session_manager: SessionManager):
        self.sm = session_manager

    async def handle_go(self, ticket: str) -> dict:
        """/go?ticket=xxx → 调河狸云 retrieve → 创建 Session → 返回 session dict"""
        user_vo = await self._retrieve(ticket)
        return await self.sm.create(user_vo)

    async def handle_refresh(
        self,
        ticket: str | None = None,
        user_id: int | None = None,
        app_secret: str | None = None,
    ):
        """/refresh（河狸云主动调用，AI 侧被动接收）
        有 ticket → 身份切换；无 ticket → 退出
        """
        settings = get_settings()
        if app_secret != settings.app_secret:
            raise ValueError("Invalid appSecret")

        if ticket:
            new_vo = await self._retrieve(ticket)
            return await self.sm.refresh(user_id, new_vo)
        else:
            await self.sm.delete_by_user(user_id)
            return None

    async def _retrieve(self, ticket: str) -> dict:
        """调用河狸云 retrieve 接口获取 UserSessionVo"""
        settings = get_settings()
        url = f"{settings.app_retrieve_url}?ticket={ticket}&appSecret={settings.app_secret}"
        logger.info("retrieve ticket=%s url=%s", ticket[:8] + "...", settings.app_retrieve_url)
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()
            # 河狸云标准响应格式可能包裹在 {code, data} 中
            if isinstance(data, dict) and "data" in data and "userId" not in data:
                data = data["data"]
            logger.info("retrieve success user_id=%s", data.get("userId"))
            return data
