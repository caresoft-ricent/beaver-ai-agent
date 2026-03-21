"""管理后台API路由汇总"""
from fastapi import APIRouter
from app.api.admin import tenants, connectors, llm_configs, ontologies, intents, auth, stats, logs, normalization, domains, debug

router = APIRouter()
router.include_router(auth.router, prefix="/auth", tags=["认证"])
router.include_router(stats.router, prefix="/stats", tags=["统计"])
router.include_router(tenants.router, prefix="/tenants", tags=["租户管理"])
router.include_router(connectors.router, prefix="/connectors", tags=["连接器管理"])
router.include_router(llm_configs.router, prefix="/llm-configs", tags=["大模型管理"])
router.include_router(domains.router, prefix="/domains", tags=["业务域管理"])
router.include_router(ontologies.router, prefix="/ontologies", tags=["本体管理"])
router.include_router(intents.router, prefix="/intents", tags=["意图/技能管理"])
router.include_router(logs.router, prefix="/logs", tags=["日志查询"])
router.include_router(normalization.router, prefix="/normalization", tags=["归一化规则"])
router.include_router(debug.router, prefix="/debug", tags=["调试工具"])
