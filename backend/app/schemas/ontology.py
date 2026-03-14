"""本体相关Schema"""
from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class EntityCreate(BaseModel):
    tenant_id: int
    entity_mode: str = "api"
    entity_code: str
    entity_name: str
    entity_description: Optional[str] = None
    connector_id: Optional[int] = None


class EntityUpdate(BaseModel):
    entity_mode: Optional[str] = None
    entity_code: Optional[str] = None
    entity_name: Optional[str] = None
    entity_description: Optional[str] = None
    connector_id: Optional[int] = None
    status: Optional[str] = None


class EntityOut(BaseModel):
    id: int
    tenant_id: int
    entity_mode: str
    entity_code: str
    entity_name: str
    entity_description: Optional[str]
    connector_id: Optional[int]
    status: str
    version: int
    created_at: Optional[datetime]

    model_config = {"from_attributes": True}


class EntityPropertyCreate(BaseModel):
    entity_id: int
    base_property_id: Optional[int] = None
    type: str
    name: str
    title: Optional[str] = None
    is_input: bool = False
    is_output: bool = False
    is_required: bool = False
    property_description: Optional[str] = None
    required_description: Optional[str] = None


class EntityPropertyOut(BaseModel):
    id: int
    entity_id: int
    base_property_id: Optional[int]
    type: str
    name: str
    title: Optional[str]
    is_input: bool
    is_output: bool
    is_required: bool
    property_description: Optional[str]

    model_config = {"from_attributes": True}


class EntityRelationCreate(BaseModel):
    entity_id: int
    ref_entity_id: int
    property_id: Optional[int] = None
    ref_property_id: Optional[int] = None
    relation_type: str = "1:N"
    description: Optional[str] = None


class EntityRelationOut(BaseModel):
    id: int
    entity_id: int
    ref_entity_id: int
    property_id: Optional[int]
    ref_property_id: Optional[int]
    relation_type: str
    description: Optional[str]

    model_config = {"from_attributes": True}


class BasePropertyCreate(BaseModel):
    tenant_id: int
    code: str
    type: str
    name: str
    title: Optional[str] = None
    base_description: Optional[str] = None
    required_description: Optional[str] = None


class BasePropertyOut(BaseModel):
    id: int
    tenant_id: int
    code: str
    type: str
    name: str
    title: Optional[str]
    base_description: Optional[str]

    model_config = {"from_attributes": True}


# ===== Action =====
class ActionCreate(BaseModel):
    entity_id: int
    action_code: str
    action_name: str
    action_description: Optional[str] = None
    http_method: str = "GET"
    api_path: Optional[str] = None
    request_template: Optional[dict] = None
    response_mapping: Optional[dict] = None
    cache_ttl: int = 0
    mock_response: Optional[dict] = None


class ActionOut(BaseModel):
    id: int
    entity_id: int
    action_code: str
    action_name: str
    action_description: Optional[str]
    http_method: str
    api_path: Optional[str]
    cache_ttl: int
    created_at: Optional[datetime]

    model_config = {"from_attributes": True}


class ActionParameterCreate(BaseModel):
    action_id: int
    property_id: Optional[int] = None
    name: str
    type: str
    title: Optional[str] = None
    param_description: Optional[str] = None
    direction: str = "input"
    is_required: bool = False
    default_value: Optional[str] = None


class ActionParameterOut(BaseModel):
    id: int
    action_id: int
    property_id: Optional[int]
    name: str
    type: str
    title: Optional[str]
    direction: str
    is_required: bool

    model_config = {"from_attributes": True}
