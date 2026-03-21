"""Action Runtime — 统一执行某个 Action 的运行时

职责:
  1. 加载 DomainPack 中的 Action + 输入/输出参数定义 + Connector
  2. 通过 AdapterRegistry 获取适配器
  3. 调用适配器执行
  4. 收集证据 + 记录 ExecutionLog
"""
from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field
from typing import Optional

from sqlalchemy.orm import Session

from app.models.config import Connector
from app.models.execution_log import ExecutionLog
from app.runtime.adapters.registry import build_default_registry
from app.runtime.domain_runtime import DomainPack

logger = logging.getLogger("beaver.runtime.action")


@dataclass
class ActionResult:
    """Action 执行结果"""
    success: bool
    action_code: str
    data: object = None
    raw: object = None
    error: str = None
    duration_ms: int = 0
    evidence: dict = field(default_factory=dict)


class ActionRuntime:
    """执行 Domain Action"""

    def __init__(self, db: Session, tenant_id: int):
        self.db = db
        self.tenant_id = tenant_id
        self._registry = build_default_registry()

    async def execute(
        self,
        pack: DomainPack,
        action_code: str,
        flat_params: dict,
        session_headers: dict = None,
        session_id: str = None,
        user_input: str = None,
    ) -> ActionResult:
        """执行单个 Action

        Args:
            pack: DomainPack — 当前领域运行时数据包
            action_code: Action 编码
            flat_params: 打平的参数字典 (Kernel 视角)
            session_headers: 会话请求头
        """
        t0 = time.time()

        # 1. 查找 Action
        action = pack.get_action_by_code(action_code)
        if not action:
            return ActionResult(
                success=False, action_code=action_code,
                error=f"Action '{action_code}' not found in domain '{pack.domain.code}'",
            )

        # 2. 查找 Connector
        connector = self.db.query(Connector).filter(Connector.id == action.connector_id).first()
        if not connector:
            return ActionResult(
                success=False, action_code=action_code,
                error=f"Connector not found for action '{action_code}'",
            )

        # 3. 获取适配器
        adapter_type = connector.adapter_type or "webapi"
        try:
            adapter = self._registry.get(adapter_type)
        except KeyError:
            return ActionResult(
                success=False, action_code=action_code,
                error=f"No adapter registered for type '{adapter_type}'",
            )

        # 4. 参数定义
        input_defs = pack.get_input_params(action.id)
        output_defs = pack.get_output_params(action.id)

        # 5. 构建请求头
        headers = dict(session_headers) if session_headers else {}
        if "Content-Type" not in headers:
            headers["Content-Type"] = "application/json"

        # 6. 执行
        result = await adapter.execute(
            adapter=connector,
            action=action,
            flat_params=flat_params,
            input_param_defs=input_defs,
            output_param_defs=output_defs,
            headers=headers,
        )

        duration = int((time.time() - t0) * 1000)

        # 7. 构建证据
        evidence = {
            "action_code": action_code,
            "connector": connector.name,
            "adapter_type": adapter_type,
            "request_mapper": connector.request_mapper,
            "response_mapper": connector.response_mapper,
            "success": result.success,
            "status_code": result.status_code,
            "latency_ms": result.latency_ms,
            "curl": result.curl,
        }
        if result.error:
            evidence["error"] = result.error

        # 8. 记录日志
        self._log(action, connector, flat_params, result, duration,
                 session_id=session_id, user_input=user_input)

        return ActionResult(
            success=result.success,
            action_code=action_code,
            data=result.data,
            raw=result.raw,
            error=result.error,
            duration_ms=duration,
            evidence=evidence,
        )

    def _log(self, action, connector, params, result, duration_ms, *,
             session_id: str = None, user_input: str = None):
        """写 ExecutionLog"""
        try:
            log = ExecutionLog(
                session_id=session_id,
                user_input=None,
                action_id=action.id,
                adapter_id=connector.id,
                entity_id=action.entity_id,
                domain_id=action.domain_id,
                input_params=params,
                output_data=result.data if result.success else None,
                success=result.success,
                error_message=result.error,
                duration_ms=duration_ms,
            )
            self.db.add(log)
            self.db.commit()
        except Exception:
            logger.warning("Failed to write ExecutionLog", exc_info=True)
            self.db.rollback()
