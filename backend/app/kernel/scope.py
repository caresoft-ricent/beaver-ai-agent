"""BeaverSessionScope — 从请求 Header 提取河狸云用户/企业上下文

河狸云前端请求固定携带以下 Header:
  Authorization:  Bearer <JWT>
  Enterpriseid:   企业编码（字符串, 如 RYSGS）
  Memberid:       成员 ID
  Orgid:          组织 ID
  Ouid:           全局用户 ID

本模块将这些 Header 统一封装为 BeaverSessionScope，供引擎全链路使用。
"""
from __future__ import annotations

from pydantic import BaseModel, Field
from typing import Optional
from fastapi import Request


class BeaverSessionScope(BaseModel):
    """河狸云会话作用域 — 描述「谁在哪个企业做什么」"""

    # ── 核心身份字段（从 Header 提取）──
    ouid: str = ""                          # 全局用户 ID
    enterprise_id: str = ""                 # 企业编码（RYSGS / BLOGI 等）
    member_id: str = ""                     # 成员 ID
    org_id: str = ""                        # 组织 ID
    token: str = ""                         # JWT（去掉 Bearer 前缀）

    # ── 扩展上下文（后续通过缓存补充）──
    display_name: str = ""                  # 用户显示名
    enterprise_name: str = ""               # 企业名称
    job: str = ""                           # 岗位
    role_type: int = 0                      # 角色类型
    roles: list = Field(default_factory=list)
    regions: list = Field(default_factory=list)
    children_ids: list = Field(default_factory=list)
    current_module: str = ""                # 当前模块（从 Referer 解析）

    # ── 内部映射 ──
    tenant_id: Optional[int] = None         # 映射到内部 tenant_id（兼容现有体系）

    @property
    def is_authenticated(self) -> bool:
        """是否携带了有效身份信息"""
        return bool(self.enterprise_id and self.ouid)

    @property
    def log_identity(self) -> str:
        """日志用的身份摘要"""
        if self.is_authenticated:
            return f"{self.enterprise_id}/{self.ouid}"
        return "anonymous"


def extract_scope(request: Request) -> BeaverSessionScope:
    """从 FastAPI 请求 Header 提取 Scope

    兼容策略：Header 不存在时字段为空字符串，不抛异常。
    这样现有不带 Header 的请求也能正常通过。
    """
    headers = request.headers

    token = headers.get("authorization", "")
    if token.lower().startswith("bearer "):
        token = token[7:].strip()

    # 从 Referer 解析当前模块
    # URL 格式: /org/{orgId}/enterprise/{eid}/{module}/{sub}
    module = ""
    referer = headers.get("referer", "")
    if referer:
        parts = referer.split("/")
        if "enterprise" in parts:
            idx = parts.index("enterprise")
            if idx + 2 < len(parts):
                module = parts[idx + 2]
            if idx + 3 < len(parts):
                module += "/" + parts[idx + 3]

    return BeaverSessionScope(
        ouid=headers.get("ouid", ""),
        enterprise_id=headers.get("enterpriseid", ""),
        member_id=headers.get("memberid", ""),
        org_id=headers.get("orgid", ""),
        token=token,
        current_module=module,
    )
