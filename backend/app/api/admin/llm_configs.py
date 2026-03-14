"""大模型配置管理API"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional

from app.database import get_db
from app.models.config import LLMConfig
from app.schemas.config import LLMConfigCreate, LLMConfigUpdate, LLMConfigOut, LLMTestRequest
from app.schemas.common import ResponseBase
from app.clients.llm_client import call_llm

router = APIRouter()


@router.get("")
def list_llm_configs(
    tenant_id: Optional[int] = None,
    usage: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
):
    query = db.query(LLMConfig)
    if tenant_id:
        query = query.filter(LLMConfig.tenant_id == tenant_id)
    if usage:
        query = query.filter(LLMConfig.usage == usage)
    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()
    return ResponseBase(data={
        "total": total,
        "items": [LLMConfigOut.model_validate(c).model_dump() for c in items],
    })


@router.get("/{config_id}")
def get_llm_config(config_id: int, db: Session = Depends(get_db)):
    config = db.query(LLMConfig).filter(LLMConfig.id == config_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="配置不存在")
    return ResponseBase(data=LLMConfigOut.model_validate(config).model_dump())


@router.post("")
def create_llm_config(req: LLMConfigCreate, db: Session = Depends(get_db)):
    config = LLMConfig(**req.model_dump())
    db.add(config)
    db.commit()
    db.refresh(config)
    return ResponseBase(data=LLMConfigOut.model_validate(config).model_dump())


@router.put("/{config_id}")
def update_llm_config(config_id: int, req: LLMConfigUpdate, db: Session = Depends(get_db)):
    config = db.query(LLMConfig).filter(LLMConfig.id == config_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="配置不存在")
    for key, value in req.model_dump(exclude_unset=True).items():
        setattr(config, key, value)
    db.commit()
    db.refresh(config)
    return ResponseBase(data=LLMConfigOut.model_validate(config).model_dump())


@router.delete("/{config_id}")
def delete_llm_config(config_id: int, db: Session = Depends(get_db)):
    config = db.query(LLMConfig).filter(LLMConfig.id == config_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="配置不存在")
    db.delete(config)
    db.commit()
    return ResponseBase(message="删除成功")


@router.post("/{config_id}/test")
def test_llm_config(config_id: int, req: LLMTestRequest = LLMTestRequest(), db: Session = Depends(get_db)):
    """在线测试大模型"""
    config = db.query(LLMConfig).filter(LLMConfig.id == config_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="配置不存在")

    try:
        result = call_llm(
            provider=config.provider,
            model=config.model_name,
            api_url=config.api_url,
            api_key=config.api_key,
            messages=[{"role": "user", "content": req.message}],
            temperature=config.temperature,
            max_tokens=config.max_tokens,
        )
        return ResponseBase(data=result)
    except Exception as e:
        return ResponseBase(code=1, message=f"调用失败: {str(e)}")
