"""租户相关Schema"""
from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class TenantCreate(BaseModel):
    name: str
    code: str
    description: Optional[str] = None
    config: Optional[dict] = None


class TenantUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    config: Optional[dict] = None


class TenantOut(BaseModel):
    id: int
    name: str
    code: str
    description: Optional[str]
    status: str
    config: Optional[dict]
    created_at: Optional[datetime]

    model_config = {"from_attributes": True}
