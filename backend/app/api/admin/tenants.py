"""租户管理API"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional

from app.database import get_db
from app.models.tenant import Tenant
from app.schemas.tenant import TenantCreate, TenantUpdate, TenantOut
from app.schemas.common import ResponseBase

router = APIRouter()


@router.get("")
def list_tenants(
    page: int = 1,
    page_size: int = 20,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = db.query(Tenant)
    if status:
        query = query.filter(Tenant.status == status)
    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()
    return ResponseBase(data={
        "total": total,
        "items": [TenantOut.model_validate(t).model_dump() for t in items],
    })


@router.get("/{tenant_id}")
def get_tenant(tenant_id: int, db: Session = Depends(get_db)):
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="租户不存在")
    return ResponseBase(data=TenantOut.model_validate(tenant).model_dump())


@router.post("")
def create_tenant(req: TenantCreate, db: Session = Depends(get_db)):
    existing = db.query(Tenant).filter(Tenant.code == req.code).first()
    if existing:
        raise HTTPException(status_code=400, detail="租户编码已存在")
    tenant = Tenant(**req.model_dump())
    db.add(tenant)
    db.commit()
    db.refresh(tenant)
    return ResponseBase(data=TenantOut.model_validate(tenant).model_dump())


@router.put("/{tenant_id}")
def update_tenant(tenant_id: int, req: TenantUpdate, db: Session = Depends(get_db)):
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="租户不存在")
    for key, value in req.model_dump(exclude_unset=True).items():
        setattr(tenant, key, value)
    db.commit()
    db.refresh(tenant)
    return ResponseBase(data=TenantOut.model_validate(tenant).model_dump())


@router.delete("/{tenant_id}")
def delete_tenant(tenant_id: int, db: Session = Depends(get_db)):
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="租户不存在")
    db.delete(tenant)
    db.commit()
    return ResponseBase(message="删除成功")
