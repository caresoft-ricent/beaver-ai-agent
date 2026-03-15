"""本体相关Schema"""
from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class EntityCreate(BaseModel):
    tenant_id: int
    entity_mode: str = "api"
    entity_code: str
    entity_name: str
    category: Optional[str] = ""
    entity_description: Optional[str] = None
    connector_id: Optional[int] = None


class EntityUpdate(BaseModel):
    entity_mode: Optional[str] = None
    entity_code: Optional[str] = None
    entity_name: Optional[str] = None
    category: Optional[str] = None
    entity_description: Optional[str] = None
    connector_id: Optional[int] = None
    status: Optional[str] = None


class EntityOut(BaseModel):
    id: int
    tenant_id: int
    entity_mode: str
    entity_code: str
    entity_name: str
    category: Optional[str] = ""
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
    llm_description: Optional[str] = None
    extract_expression: Optional[str] = None
    normalization_config: Optional[dict] = None
    mapping_config: Optional[dict] = None


class EntityPropertyUpdate(BaseModel):
    title: Optional[str] = None
    is_input: Optional[bool] = None
    is_output: Optional[bool] = None
    is_required: Optional[bool] = None
    property_description: Optional[str] = None
    required_description: Optional[str] = None
    llm_description: Optional[str] = None
    extract_expression: Optional[str] = None
    normalization_config: Optional[dict] = None
    mapping_config: Optional[dict] = None


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
    llm_description: Optional[str] = None
    extract_expression: Optional[str] = None
    normalization_config: Optional[dict] = None
    mapping_config: Optional[dict] = None

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
    tenant_id: int
    entity_id: int
    connector_id: Optional[int] = None
    action_code: str
    action_name: str
    action_description: Optional[str] = None
    category: Optional[str] = ""
    tags: Optional[list] = None
    http_method: str = "GET"
    api_path: Optional[str] = None
    request_template: Optional[dict] = None
    response_mapping: Optional[dict] = None
    cache_ttl: int = 0
    mock_response: Optional[dict] = None


class ActionUpdate(BaseModel):
    entity_id: Optional[int] = None
    connector_id: Optional[int] = None
    action_code: Optional[str] = None
    action_name: Optional[str] = None
    action_description: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[list] = None
    http_method: Optional[str] = None
    api_path: Optional[str] = None
    request_template: Optional[dict] = None
    response_mapping: Optional[dict] = None
    cache_ttl: Optional[int] = None
    mock_response: Optional[dict] = None


class ActionOut(BaseModel):
    id: int
    tenant_id: int
    entity_id: int
    connector_id: Optional[int]
    action_code: str
    action_name: str
    action_description: Optional[str]
    category: Optional[str] = ""
    tags: Optional[list] = None
    http_method: str
    api_path: Optional[str]
    request_template: Optional[dict] = None
    response_mapping: Optional[dict] = None
    cache_ttl: int
    mock_response: Optional[dict] = None
    created_at: Optional[datetime]

    model_config = {"from_attributes": True}


class ActionParameterCreate(BaseModel):
    action_id: int
    property_id: Optional[int] = None
    name: str
    source_property: Optional[str] = None
    type: str
    title: Optional[str] = None
    param_description: Optional[str] = None
    is_input: bool = False
    is_output: bool = False
    is_required: bool = False
    default_value: Optional[str] = None


class ActionParameterOut(BaseModel):
    id: int
    action_id: int
    property_id: Optional[int]
    name: str
    source_property: Optional[str]
    type: str
    title: Optional[str]
    param_description: Optional[str] = None
    is_input: bool = False
    is_output: bool = False
    is_required: bool = False

    model_config = {"from_attributes": True}
