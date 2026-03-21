"""Response Runtime — 根据 PlanResult 组装最终响应

根据 plan_type 产出不同类型的响应事件:
  - execute:  工具调用事件 + 数据结果 + LLM/模板回复
  - clarify:  追问事件 + 追问文本
  - confirm:  确认卡片事件 + 确认提示
  - fallback: 兜底回复
"""
from __future__ import annotations

import logging
from typing import Optional

from app.core import agui
from app.runtime.context_planner import PlanResult
from app.runtime.action_runtime import ActionResult

logger = logging.getLogger("beaver.runtime.response")


class ResponseRuntime:
    """组装响应事件流"""

    def compose(
        self,
        plan: PlanResult,
        action_result: ActionResult = None,
    ) -> list[dict]:
        """根据规划结果和执行结果，组装 AG-UI 事件列表

        Returns:
            list of agui event dicts (由 stream_engine yield 输出)
        """
        if plan.plan_type == "clarify":
            return self._compose_clarify(plan)
        elif plan.plan_type == "confirm":
            return self._compose_confirm(plan)
        elif plan.plan_type == "fallback":
            return self._compose_fallback(plan)
        elif plan.plan_type == "execute":
            return self._compose_execute(plan, action_result)
        else:
            return self._compose_fallback(plan)

    def _compose_clarify(self, plan: PlanResult) -> list:
        events = []
        events.append(agui.custom_event("clarification", {
            "missing_params": plan.param_gaps,
            "text": plan.clarification_text,
            "action_code": plan.action_code,
        }))
        return events

    def _compose_confirm(self, plan: PlanResult) -> list:
        events = []
        events.append(agui.custom_event("card", {
            "card_type": "confirm",
            "title": "操作确认",
            "fields": plan.confirm_fields,
            "action_code": plan.action_code,
        }))
        return events

    def _compose_fallback(self, plan: PlanResult) -> list:
        # fallback 由 stream_engine 直接 _stream_text
        return []

    def _compose_execute(self, plan: PlanResult, result: ActionResult = None) -> list:
        events = []

        if not result:
            return events

        if result.success and result.data:
            events.append(agui.custom_event("structured_data", {
                "action_code": plan.action_code,
                "data": result.data,
            }))
            events.append(agui.custom_event("evidence", {
                "action_runtime": result.evidence,
                "planner": plan.evidence,
            }))
        elif not result.success:
            events.append(agui.custom_event("action_error", {
                "action_code": plan.action_code,
                "error": result.error,
            }))

        return events
