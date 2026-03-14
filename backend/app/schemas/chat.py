"""对话相关Schema"""
from pydantic import BaseModel, Field
from typing import Optional, Any
from datetime import datetime


class ChatRequest(BaseModel):
    session_id: Optional[str] = None
    tenant_id: int
    customer_id: str
    message: str


class AGUIMessage(BaseModel):
    role: str
    content: str


class AGUIContext(BaseModel):
    tenant_id: int = Field(1, alias="tenant_id")
    customer_id: str = Field("C001", alias="customer_id")

    model_config = {"populate_by_name": True}


class AGUIStreamRequest(BaseModel):
    """AG-UI 协议流式请求 — 同时支持 camelCase 和 snake_case"""
    thread_id: Optional[str] = Field(None, alias="threadId")
    run_id: Optional[str] = Field(None, alias="runId")
    messages: list[AGUIMessage] = []
    context: Optional[AGUIContext] = None

    model_config = {"populate_by_name": True}


class ChatResponse(BaseModel):
    session_id: str
    reply: str
    reply_type: str = "text"
    intent: Optional[str] = None
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
