"""SessionManager — Redis Session CRUD

Redis 存储两个键：
  session:{session_id}     → Session JSON (TTL 24h)
  user_session:{user_id}   → session_id   (TTL 24h)
"""
import json
import uuid
from datetime import timedelta
from typing import Optional

from redis import asyncio as aioredis


class SessionManager:
    def __init__(self, redis: aioredis.Redis, ttl_hours: int = 24):
        self.redis = redis
        self.ttl = timedelta(hours=ttl_hours)

    async def create(self, user_vo: dict) -> dict:
        """从河狸云 UserSessionVo 创建 Session"""
        session_id = str(uuid.uuid4())
        session = {
            "session_id": session_id,
            "user_id": user_vo["userId"],
            "user_name": user_vo.get("userName", ""),
            "display_name": user_vo.get("displayName", ""),
            "mobile_no": user_vo.get("mobileNo", ""),
            "ou_name": user_vo.get("ouName", ""),
            "ou_type": user_vo.get("ouType"),
            "headers": user_vo.get("headers", {}),
        }
        ttl = int(self.ttl.total_seconds())
        pipe = self.redis.pipeline()
        pipe.setex(f"session:{session_id}", ttl, json.dumps(session, ensure_ascii=False))
        pipe.setex(f"user_session:{session['user_id']}", ttl, session_id)
        await pipe.execute()
        return session

    async def get(self, session_id: str) -> Optional[dict]:
        """根据 session_id 获取 Session"""
        data = await self.redis.get(f"session:{session_id}")
        return json.loads(data) if data else None

    async def get_by_user(self, user_id) -> Optional[dict]:
        """根据 user_id 获取 Session"""
        sid = await self.redis.get(f"user_session:{user_id}")
        if not sid:
            return None
        return await self.get(sid.decode() if isinstance(sid, bytes) else sid)

    async def refresh(self, user_id, new_vo: dict) -> Optional[dict]:
        """河狸云驱动的身份刷新：替换 Session 内容（含新 headers）"""
        session = await self.get_by_user(user_id)
        if not session:
            return None
        session.update({
            "user_name": new_vo.get("userName", session["user_name"]),
            "display_name": new_vo.get("displayName", session["display_name"]),
            "mobile_no": new_vo.get("mobileNo", session["mobile_no"]),
            "ou_name": new_vo.get("ouName", session["ou_name"]),
            "ou_type": new_vo.get("ouType", session["ou_type"]),
            "headers": new_vo.get("headers", session["headers"]),
        })
        ttl = int(self.ttl.total_seconds())
        await self.redis.setex(
            f"session:{session['session_id']}", ttl,
            json.dumps(session, ensure_ascii=False),
        )
        return session

    async def delete_by_user(self, user_id):
        """销毁用户的 Session（退出时河狸云调用）"""
        sid = await self.redis.get(f"user_session:{user_id}")
        if sid:
            s = sid.decode() if isinstance(sid, bytes) else sid
            pipe = self.redis.pipeline()
            pipe.delete(f"session:{s}")
            pipe.delete(f"user_session:{user_id}")
            await pipe.execute()
