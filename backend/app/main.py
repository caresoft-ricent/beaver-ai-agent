"""Beaver AI Agent - FastAPI 应用入口"""
import os
import time
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import engine, Base

# 设置时区为北京时间, 确保日志和 datetime.now() 使用 UTC+8
os.environ.setdefault("TZ", "Asia/Shanghai")
time.tzset()

# 配置全链路日志: beaver.* 命名空间
# LOG_LEVEL 环境变量 / .env 配置控制，支持 DEBUG / INFO / WARNING
_log_level = getattr(logging, get_settings().log_level.upper(), logging.INFO)
logging.basicConfig(
    level=_log_level,
    format="%(asctime)s [%(name)s] %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
# beaver.* 子日志器统一跟随配置
for _ns in ("beaver.evidence", "beaver.engine", "beaver.connector", "beaver.llm",
            "beaver.runtime.domain", "beaver.runtime.planner", "beaver.runtime.action",
            "beaver.runtime.response", "beaver.runtime.adapter", "beaver.context"):
    logging.getLogger(_ns).setLevel(_log_level)
if _log_level <= logging.DEBUG:
    logging.getLogger("beaver").info("🔍 DEBUG 模式已启用 — LLM prompt/response 将完整打印")

# 导入所有模型,确保 create_all 能发现
from app.models import (  # noqa: F401
    Tenant, TenantApiKey, LLMConfig, Connector,
    BaseProperty, Entity, EntityProperty, EntityRelation,
    Action, ActionParameter, Skill, SkillTool,
    ChatSession, ChatMessage, ActionLog, AdminUser, OperationLog,
    ExecutionLog,
)
from app.api.admin import router as admin_router
from app.api.v1 import router as v1_router
from app.api.session_routes import router as session_router

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
app.include_router(session_router)


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "beaver-ai-agent"}
