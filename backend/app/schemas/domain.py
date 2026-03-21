"""业务域 Schema"""
from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class DomainCreate(BaseModel):
    tenant_id: int
    code: str
    name: str
    description: Optional[str] = None
    default_risk_level: str = "low"
    requires_scope_check: bool = True
    response_style: str = "mixed"


class DomainUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    default_risk_level: Optional[str] = None
    requires_scope_check: Optional[bool] = None
    response_style: Optional[str] = None
    status: Optional[str] = None


class DomainOut(BaseModel):
    id: int
    tenant_id: int
    code: str
    name: str
    description: Optional[str] = None
    version: int
    status: str
    generated_by: str
    confidence: float
    default_risk_level: str
    requires_scope_check: bool
    response_style: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
