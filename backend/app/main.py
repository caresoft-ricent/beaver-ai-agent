"""Beaver AI Agent - FastAPI 应用入口"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import engine, Base

# 导入所有模型,确保 create_all 能发现
from app.models import (  # noqa: F401
    Tenant, TenantApiKey, LLMConfig, Connector,
    BaseProperty, Entity, EntityProperty, EntityRelation,
    Action, ActionParameter, Skill, SkillTool,
    ChatSession, ChatMessage, ActionLog, AdminUser, OperationLog,
)
from app.api.admin import router as admin_router
from app.api.v1 import router as v1_router

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: 自动建表
    Base.metadata.create_all(bind=engine)
    yield
    # Shutdown


app = FastAPI(
    title="Beaver AI Agent",
    description="河狸云 AI 服务 — 配置化多租户对话引擎",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Session-Id"],
)

app.include_router(admin_router, prefix="/api/admin")
app.include_router(v1_router, prefix="/api/v1")


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "beaver-ai-agent"}
