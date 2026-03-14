"""对话相关Schema"""
from pydantic import BaseModel
from typing import Optional, Any
from datetime import datetime


class ChatRequest(BaseModel):
    session_id: Optional[str] = None
    tenant_id: int
    customer_id: str
    message: str


class ChatResponse(BaseModel):
    session_id: str
    reply: str
    reply_type: str = "text"
    structured_data: Optional[dict] = None
    evidence_chain: Optional[dict] = None
    suggested_actions: Optional[list] = None
    needs_clarification: bool = False
    clarification: Optional[dict] = None
    context: Optional[dict] = None


class ActionRequest(BaseModel):
    session_id: str
    tenant_id: int
    customer_id: str
    action: str
    params: Optional[dict] = None
    confirmed: bool = False


class ActionResponse(BaseModel):
    success: bool
    result: Optional[dict] = None
    reply: str


class SessionOut(BaseModel):
    id: int
    session_id: str
    tenant_id: int
    customer_id: str
    customer_name: Optional[str]
    message_count: int
    started_at: Optional[datetime]
    ended_at: Optional[datetime]

    model_config = {"from_attributes": True}


class MessageOut(BaseModel):
    id: int
    session_id: str
    role: str
    content: str
    intent: Optional[str]
    structured_data: Optional[dict]
    evidence_chain: Optional[dict]
    suggested_actions: Optional[list]
    created_at: Optional[datetime]

    model_config = {"from_attributes": True}
