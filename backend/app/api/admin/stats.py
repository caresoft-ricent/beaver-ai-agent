"""仪表盘统计接口"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models.tenant import Tenant
from app.models.config import Connector, LLMConfig
from app.models.ontology import Entity
from app.models.intent import Skill

router = APIRouter()


@router.get("")
def get_stats(db: Session = Depends(get_db)):
    """获取全局统计概览"""
    return {
        "tenants": db.query(func.count(Tenant.id)).scalar(),
        "connectors": db.query(func.count(Connector.id)).scalar(),
        "llm_configs": db.query(func.count(LLMConfig.id)).scalar(),
        "entities": db.query(func.count(Entity.id)).scalar(),
        "skills": db.query(func.count(Skill.id)).filter(
            Skill.status == "published"
        ).scalar(),
    }
