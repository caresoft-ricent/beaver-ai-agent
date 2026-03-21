"""业务域管理 API — Domain CRUD + 发布 + 概览"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func as sqlfunc
from typing import Optional

from app.database import get_db
from app.models.domain import Domain
from app.models.ontology import Entity
from app.models.action import Action
from app.schemas.domain import DomainCreate, DomainUpdate, DomainOut
from app.schemas.common import ResponseBase

router = APIRouter()


@router.get("")
def list_domains(
    tenant_id: Optional[int] = None,
    status: Optional[str] = None,
    keyword: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    query = db.query(Domain)
    if tenant_id:
        query = query.filter(Domain.tenant_id == tenant_id)
    if status:
        query = query.filter(Domain.status == status)
    if keyword:
        query = query.filter(
            (Domain.name.contains(keyword)) | (Domain.code.contains(keyword))
        )
    total = query.count()
    items = query.order_by(Domain.id.desc()).offset((page - 1) * page_size).limit(page_size).all()

    # 附加每个 domain 的 entity/action 数量
    result = []
    for d in items:
        out = DomainOut.model_validate(d).model_dump()
        out["entity_count"] = db.query(sqlfunc.count(Entity.id)).filter(Entity.domain_id == d.id).scalar()
        out["action_count"] = db.query(sqlfunc.count(Action.id)).filter(Action.domain_id == d.id).scalar()
        result.append(out)

    return ResponseBase(data={"total": total, "items": result})


@router.get("/{domain_id}")
def get_domain(domain_id: int, db: Session = Depends(get_db)):
    domain = db.query(Domain).filter(Domain.id == domain_id).first()
    if not domain:
        raise HTTPException(status_code=404, detail="域不存在")
    data = DomainOut.model_validate(domain).model_dump()
    # 附加关联的 entities + actions
    entities = db.query(Entity).filter(Entity.domain_id == domain.id).all()
    actions = db.query(Action).filter(Action.domain_id == domain.id).all()
    data["entities"] = [{"id": e.id, "entity_code": e.entity_code, "entity_name": e.entity_name, "status": e.status} for e in entities]
    data["actions"] = [{"id": a.id, "action_code": a.action_code, "action_name": a.action_name, "action_type": a.action_type} for a in actions]
    return ResponseBase(data=data)


@router.post("")
def create_domain(req: DomainCreate, db: Session = Depends(get_db)):
    existing = db.query(Domain).filter(Domain.code == req.code).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"域编码 '{req.code}' 已存在")
    domain = Domain(**req.model_dump())
    db.add(domain)
    db.commit()
    db.refresh(domain)
    return ResponseBase(data=DomainOut.model_validate(domain).model_dump())


@router.put("/{domain_id}")
def update_domain(domain_id: int, req: DomainUpdate, db: Session = Depends(get_db)):
    domain = db.query(Domain).filter(Domain.id == domain_id).first()
    if not domain:
        raise HTTPException(status_code=404, detail="域不存在")
    for key, value in req.model_dump(exclude_unset=True).items():
        setattr(domain, key, value)
    db.commit()
    db.refresh(domain)
    return ResponseBase(data=DomainOut.model_validate(domain).model_dump())


@router.post("/{domain_id}/publish")
def publish_domain(domain_id: int, db: Session = Depends(get_db)):
    domain = db.query(Domain).filter(Domain.id == domain_id).first()
    if not domain:
        raise HTTPException(status_code=404, detail="域不存在")
    domain.status = "published"
    domain.version += 1
    db.commit()
    return ResponseBase(message="发布成功")


@router.delete("/{domain_id}")
def delete_domain(domain_id: int, db: Session = Depends(get_db)):
    domain = db.query(Domain).filter(Domain.id == domain_id).first()
    if not domain:
        raise HTTPException(status_code=404, detail="域不存在")
    # 清除关联（解除 entity/action 的 domain_id，而非删除实体）
    db.query(Entity).filter(Entity.domain_id == domain_id).update({"domain_id": None})
    db.query(Action).filter(Action.domain_id == domain_id).update({"domain_id": None})
    db.delete(domain)
    db.commit()
    return ResponseBase(message="删除成功")
