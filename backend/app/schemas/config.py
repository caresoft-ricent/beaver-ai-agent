"""配置相关Schema - 大模型、连接器"""
from pydantic import BaseModel
from typing import Optional
from datetime import datetime


# ===== LLM Config =====
class LLMConfigCreate(BaseModel):
    tenant_id: int
    name: str
    provider: str
    model_name: str
    api_url: str
    api_key: str
    temperature: float = 0.7
    max_tokens: int = 2048
    usage: str = "general"
    extra_params: Optional[dict] = None


class LLMConfigUpdate(BaseModel):
    name: Optional[str] = None
    provider: Optional[str] = None
    model_name: Optional[str] = None
    api_url: Optional[str] = None
    api_key: Optional[str] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    usage: Optional[str] = None
    extra_params: Optional[dict] = None
    status: Optional[str] = None


class LLMConfigOut(BaseModel):
    id: int
    tenant_id: int
    name: str
    provider: str
    model_name: str
    api_url: str
    api_key: Optional[str] = None
    temperature: float
    max_tokens: int
    usage: str
    status: str
    created_at: Optional[datetime]

    model_config = {"from_attributes": True}


class LLMTestRequest(BaseModel):
    message: str = "你好，请简短回复"


# ===== Connector =====
class ConnectorCreate(BaseModel):
    tenant_id: int
    name: str
    type: str = "beaver_cloud"
    base_url: str
    auth_type: str = "api_key"
    auth_config: Optional[dict] = None
    timeout: int = 30
    health_check_path: Optional[str] = None
    mock_enabled: str = "0"


class ConnectorUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    base_url: Optional[str] = None
    auth_type: Optional[str] = None
    auth_config: Optional[dict] = None
    timeout: Optional[int] = None
    health_check_path: Optional[str] = None
    mock_enabled: Optional[str] = None
    status: Optional[str] = None


class ConnectorOut(BaseModel):
    id: int
    tenant_id: int
    name: str
    type: str
    base_url: str
    auth_type: str
    auth_config: Optional[dict] = None
    health_check_path: Optional[str] = None
    timeout: int
    mock_enabled: str
    status: str
    created_at: Optional[datetime]

    model_config = {"from_attributes": True}
