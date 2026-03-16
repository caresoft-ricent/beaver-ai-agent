"""PolicyGuard — 安全执行策略守卫

在工具执行前对每个能力进行策略检查:
  1. 写/删操作自动确认 (requires_confirmation)
  2. 企业级权限校验 (scope_check)
  3. 前置条件检查 (preconditions)
  4. 频率限制 (rate_limit) — 预留接口

PolicyGuard 不阻断只读操作，仅对副作用操作 (write/delete) 生效。
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from app.kernel.capability import Capability
from app.kernel.scope import BeaverSessionScope


@dataclass
class PolicyResult:
    """策略检查结果"""
    allowed: bool = True
    reason: str = ""
    requires_confirmation: bool = False
    confirmation_message: str = ""
    blocked_by: str = ""  # 哪条策略阻止了执行

    @property
    def needs_user_action(self) -> bool:
        return self.requires_confirmation and not self.allowed


class PolicyGuard:
    """安全策略守卫 — 在工具执行前做准入检查"""

    def check(
        self,
        capability: Capability,
        scope: BeaverSessionScope,
        ctx: dict | None = None,
    ) -> PolicyResult:
        """对单个能力执行策略检查链

        检查顺序:
          1. scope_check — 企业级权限
          2. preconditions — 前置条件
          3. requires_confirmation — 确认检查
        """
        ctx = ctx or {}

        # 只读操作直接放行
        if capability.is_read_only:
            return PolicyResult(allowed=True)

        # ── 1. 企业权限校验 ──
        result = self._check_scope(capability, scope)
        if not result.allowed:
            return result

        # ── 2. 前置条件 ──
        result = self._check_preconditions(capability, ctx)
        if not result.allowed:
            return result

        # ── 3. 确认检查 ──
        if capability.requires_confirmation and not ctx.get("confirmed"):
            return PolicyResult(
                allowed=False,
                requires_confirmation=True,
                confirmation_message=self._build_confirmation_message(capability),
                blocked_by="requires_confirmation",
            )

        return PolicyResult(allowed=True)

    def check_capabilities(
        self,
        capabilities: list[Capability],
        scope: BeaverSessionScope,
        ctx: dict | None = None,
    ) -> list[tuple[Capability, PolicyResult]]:
        """批量检查多个能力，返回 [(capability, result), ...]"""
        return [(cap, self.check(cap, scope, ctx)) for cap in capabilities]

    def any_blocked(
        self,
        capabilities: list[Capability],
        scope: BeaverSessionScope,
        ctx: dict | None = None,
    ) -> Optional[tuple[Capability, PolicyResult]]:
        """检查是否有任何能力被阻止，返回第一个被阻止的"""
        for cap in capabilities:
            result = self.check(cap, scope, ctx)
            if not result.allowed:
                return (cap, result)
        return None

    # ── 内部策略 ──

    def _check_scope(self, capability: Capability, scope: BeaverSessionScope) -> PolicyResult:
        """企业级权限校验"""
        policy = capability.policy_config
        scope_check = policy.get("scope_check") if policy else None

        if scope_check == "enterprise" and not scope.is_authenticated:
            return PolicyResult(
                allowed=False,
                reason="此操作要求企业身份认证",
                blocked_by="scope_check:enterprise",
            )

        if scope_check == "member" and not scope.member_id:
            return PolicyResult(
                allowed=False,
                reason="此操作要求成员身份",
                blocked_by="scope_check:member",
            )

        return PolicyResult(allowed=True)

    def _check_preconditions(self, capability: Capability, ctx: dict) -> PolicyResult:
        """前置条件检查 — 检查上下文中是否满足执行前提"""
        policy = capability.policy_config
        preconditions = policy.get("preconditions") if policy else None
        if not preconditions:
            return PolicyResult(allowed=True)

        entities = ctx.get("entities", {})
        for cond in preconditions:
            field_name = cond.get("field", "")
            operator = cond.get("op", "exists")
            value = cond.get("value")

            if operator == "exists" and field_name not in entities:
                return PolicyResult(
                    allowed=False,
                    reason=cond.get("message", f"缺少前置条件: {field_name}"),
                    blocked_by=f"precondition:{field_name}",
                )
            elif operator == "eq" and entities.get(field_name) != value:
                return PolicyResult(
                    allowed=False,
                    reason=cond.get("message", f"前置条件不满足: {field_name}={value}"),
                    blocked_by=f"precondition:{field_name}={value}",
                )

        return PolicyResult(allowed=True)

    def _build_confirmation_message(self, capability: Capability) -> str:
        """生成确认提示文本"""
        policy = capability.policy_config or {}
        custom_msg = policy.get("confirm_message")
        if custom_msg:
            return custom_msg

        action_desc = {
            "write": "写入",
            "delete": "删除",
        }
        effect = action_desc.get(capability.side_effect, "执行")
        return f"即将{effect}「{capability.display_name}」，是否确认？"
