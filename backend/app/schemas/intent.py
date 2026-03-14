"""技能/意图相关Schema"""
from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class SkillCreate(BaseModel):
    tenant_id: int
    skill_name: str
    skill_code: str
    skill_description: Optional[str] = None
    match_keywords: Optional[list] = None
    match_patterns: Optional[list] = None
    intent_prompt: Optional[str] = None
    response_prompt: Optional[str] = None
    response_template: Optional[str] = None
    clarification_config: Optional[dict] = None
    llm_config_id: Optional[int] = None
    sort_order: int = 0


class SkillUpdate(BaseModel):
    skill_name: Optional[str] = None
    skill_code: Optional[str] = None
    skill_description: Optional[str] = None
    match_keywords: Optional[list] = None
    match_patterns: Optional[list] = None
    intent_prompt: Optional[str] = None
    response_prompt: Optional[str] = None
    response_template: Optional[str] = None
    clarification_config: Optional[dict] = None
    llm_config_id: Optional[int] = None
    sort_order: Optional[int] = None
    status: Optional[str] = None


class SkillOut(BaseModel):
    id: int
    tenant_id: int
    skill_name: str
    skill_code: str
    skill_description: Optional[str]
    match_keywords: Optional[list]
    match_patterns: Optional[list]
    llm_config_id: Optional[int]
    status: str
    version: int
    sort_order: int
    created_at: Optional[datetime]

    model_config = {"from_attributes": True}


class SkillToolCreate(BaseModel):
    skill_id: int
    tools_mode: str = "api"
    entity_id: Optional[int] = None
    action_id: Optional[int] = None
    order_no: int = 0
    config: Optional[dict] = None


class SkillToolOut(BaseModel):
    id: int
    skill_id: int
    tools_mode: str
    entity_id: Optional[int]
    action_id: Optional[int]
    order_no: int
    config: Optional[dict]

    model_config = {"from_attributes": True}
