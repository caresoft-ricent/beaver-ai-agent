"""通用Schema"""
from pydantic import BaseModel
from typing import Optional, Any
from datetime import datetime


class ResponseBase(BaseModel):
    code: int = 0
    message: str = "success"
    data: Optional[Any] = None


class PageParams(BaseModel):
    page: int = 1
    page_size: int = 20


class PageResult(BaseModel):
    total: int
    page: int
    page_size: int
    items: list
