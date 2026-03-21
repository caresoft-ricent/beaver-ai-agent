"""调试工具 API — LLM 连通性测试 + 运行时诊断"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.config import LLMConfig
from app.clients.llm_client import call_llm
from app.schemas.common import ResponseBase

router = APIRouter()


@router.post("/llm-test")
def test_llm_connection(
    config_id: int = Query(..., description="LLM 配置 ID"),
    prompt: str = Query("你好，请用一句话介绍你自己。", description="测试 prompt"),
    db: Session = Depends(get_db),
):
    """测试指定 LLM 配置的连通性 — 发送一条消息并返回完整调用详情"""
    cfg = db.query(LLMConfig).filter(LLMConfig.id == config_id).first()
    if not cfg:
        return ResponseBase(code=404, message="LLM 配置不存在")

    try:
        result = call_llm(
            provider=cfg.provider,
            model=cfg.model_name,
            api_url=cfg.api_url,
            api_key=cfg.api_key,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=256,
        )
        return ResponseBase(data={
            "success": True,
            "config": {
                "id": cfg.id,
                "provider": cfg.provider,
                "model": cfg.model_name,
                "api_url": cfg.api_url,
            },
            "result": result,
        })
    except Exception as e:
        return ResponseBase(code=500, message=f"LLM 调用失败: {str(e)}", data={
            "success": False,
            "config": {
                "id": cfg.id,
                "provider": cfg.provider,
                "model": cfg.model_name,
                "api_url": cfg.api_url,
            },
            "error_type": type(e).__name__,
            "error_detail": str(e),
        })


@router.get("/runtime-status")
def runtime_status(db: Session = Depends(get_db)):
    """返回运行时各组件状态概览"""
    from app.models.ontology import Entity
    from app.models.action import Action
    from app.models.intent import Skill
    from app.models.config import Connector

    try:
        from app.models.domain import Domain
        domain_count = db.query(Domain).count()
        published_domains = db.query(Domain).filter(Domain.status == "published").count()
    except Exception:
        domain_count = 0
        published_domains = 0

    return ResponseBase(data={
        "entities": db.query(Entity).count(),
        "actions": db.query(Action).count(),
        "skills": db.query(Skill).filter(Skill.status == "published").count(),
        "connectors": db.query(Connector).count(),
        "llm_configs": db.query(LLMConfig).count(),
        "domains": {"total": domain_count, "published": published_domains},
    })
