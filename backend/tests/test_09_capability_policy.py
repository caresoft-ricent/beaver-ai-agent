"""测试：Stage 2 CapabilityRegistry + Stage 3 PolicyGuard

覆盖:
- Capability 从 Action 映射
- CapabilityRegistry 按 capability_code / action_id / side_effect 查询
- CapabilityRegistry 解析技能工具链
- CapabilityRegistry 自动生成 input_schema
- PolicyGuard 只读操作放行
- PolicyGuard 写操作需确认
- PolicyGuard 企业权限校验
- PolicyGuard 前置条件检查
- PolicyGuard 批量检查
"""
import pytest
from app.kernel.capability import Capability, CapabilityRegistry
from app.kernel.policy import PolicyGuard, PolicyResult
from app.kernel.scope import BeaverSessionScope
from app.models.action import Action, ActionParameter


# ─────────────────── Capability 基本映射 ───────────────────


class TestCapability:
    """Capability 从 Action 映射"""

    def test_from_action_with_capability_code(self, db, factory):
        """Action 有 capability_code 时直接使用"""
        entity = factory.entity(db, entity_code="issue")
        action = factory.action(db, entity,
            action_code="close",
            action_name="关闭工单",
            capability_code="issue.close",
            side_effect_type="write",
        )
        cap = Capability(action, "issue")
        assert cap.code == "issue.close"
        assert cap.display_name == "关闭工单"
        assert cap.side_effect == "write"
        assert not cap.is_read_only
        assert cap.is_dangerous

    def test_from_action_without_capability_code(self, db, factory):
        """Action 无 capability_code 时自动拼接"""
        entity = factory.entity(db, entity_code="service")
        action = factory.action(db, entity, action_code="query_list")
        cap = Capability(action, "service")
        assert cap.code == "service.query_list"
        assert cap.is_read_only

    def test_read_only_property(self, db, factory):
        """read 类型为只读"""
        entity = factory.entity(db, entity_code="proj")
        action = factory.action(db, entity, action_code="list",
                                side_effect_type="read")
        cap = Capability(action, "proj")
        assert cap.is_read_only
        assert not cap.is_dangerous

    def test_delete_is_dangerous(self, db, factory):
        """delete 类型为危险操作"""
        entity = factory.entity(db, entity_code="task")
        action = factory.action(db, entity, action_code="remove",
                                side_effect_type="delete")
        cap = Capability(action, "task")
        assert cap.is_dangerous
        assert not cap.is_read_only

    def test_to_dict(self, db, factory):
        """Capability 序列化"""
        entity = factory.entity(db, entity_code="issue")
        action = factory.action(db, entity,
            action_code="close",
            capability_code="issue.close",
            side_effect_type="write",
            requires_confirmation=True,
        )
        cap = Capability(action, "issue")
        d = cap.to_dict()
        assert d["code"] == "issue.close"
        assert d["side_effect"] == "write"
        assert d["requires_confirmation"] is True


# ─────────────────── CapabilityRegistry ───────────────────


class TestCapabilityRegistry:
    """CapabilityRegistry 查询"""

    def test_get_by_capability_code(self, db, factory, tenant_id):
        """按 capability_code 查找"""
        entity = factory.entity(db, entity_code="order")
        factory.action(db, entity,
            action_code="create",
            capability_code="order.create",
            side_effect_type="write",
        )

        reg = CapabilityRegistry(db, tenant_id)
        cap = reg.get("order.create")
        assert cap is not None
        assert cap.code == "order.create"
        assert cap.side_effect == "write"

    def test_get_nonexistent(self, db, factory, tenant_id):
        """不存在的 capability_code 返回 None"""
        reg = CapabilityRegistry(db, tenant_id)
        assert reg.get("nonexistent.code") is None

    def test_get_by_action_id(self, db, factory, tenant_id):
        """按 action_id 查找"""
        entity = factory.entity(db, entity_code="report")
        action = factory.action(db, entity,
            action_code="generate",
            capability_code="report.generate",
            side_effect_type="read",
        )

        reg = CapabilityRegistry(db, tenant_id)
        cap = reg.get_by_action_id(action.id)
        assert cap is not None
        assert cap.code == "report.generate"

    def test_list_by_side_effect(self, db, factory, tenant_id):
        """按 side_effect 过滤"""
        entity = factory.entity(db, entity_code="ticket")
        factory.action(db, entity,
            action_code="query", capability_code="ticket.query",
            side_effect_type="read",
        )
        factory.action(db, entity,
            action_code="close", capability_code="ticket.close",
            side_effect_type="write",
        )
        factory.action(db, entity,
            action_code="delete", capability_code="ticket.delete",
            side_effect_type="delete",
        )

        reg = CapabilityRegistry(db, tenant_id)
        reads = reg.list_by_side_effect("read")
        assert any(c.code == "ticket.query" for c in reads)
        writes = reg.list_by_side_effect("write")
        assert any(c.code == "ticket.close" for c in writes)

    def test_resolve_skill_capabilities(self, db, factory, tenant_id):
        """解析技能工具链为能力列表"""
        entity = factory.entity(db, entity_code="svc")
        connector = factory.connector(db)
        action1 = factory.action(db, entity, connector,
            action_code="svc_query", capability_code="svc.query",
            side_effect_type="read",
        )
        action2 = factory.action(db, entity, connector,
            action_code="svc_count", capability_code="svc.count",
            side_effect_type="read",
        )
        skill = factory.skill(db, skill_code="SVC_Q", match_keywords=["服务"])
        factory.skill_tool(db, skill, entity, action1, order_no=1)
        factory.skill_tool(db, skill, entity, action2, order_no=2)

        reg = CapabilityRegistry(db, tenant_id)
        caps = reg.resolve_skill_capabilities(skill)
        assert len(caps) == 2
        codes = [c.code for c in caps]
        assert "svc.query" in codes
        assert "svc.count" in codes

    def test_build_input_schema(self, db, factory, tenant_id):
        """自动生成 input_schema"""
        entity = factory.entity(db, entity_code="item")
        action = factory.action(db, entity, action_code="search",
                                capability_code="item.search")
        factory.action_parameter(db, action,
            name="keyword", source_property="keyword",
            type="string", title="关键词",
            is_input=True, is_required=True,
        )
        factory.action_parameter(db, action,
            name="page", source_property="page",
            type="integer", title="页码",
            is_input=True, is_required=False, default_value="1",
        )
        # fixed 参数不应出现在 schema 中
        factory.action_parameter(db, action,
            name="tenant", source_property="tenant",
            type="integer", title="租户",
            is_input=True, value_type="fixed", default_value="1",
        )

        reg = CapabilityRegistry(db, tenant_id)
        schema = reg.build_input_schema(action.id)
        assert schema["type"] == "object"
        assert "keyword" in schema["properties"]
        assert "page" in schema["properties"]
        assert "tenant" not in schema["properties"]  # fixed 参数排除
        assert "keyword" in schema["required"]
        assert "page" not in schema["required"]  # 有默认值不算必填

    def test_registry_caches(self, db, factory, tenant_id):
        """Registry 缓存命中"""
        entity = factory.entity(db, entity_code="cache_test")
        factory.action(db, entity,
            action_code="test", capability_code="cache_test.test",
        )
        reg = CapabilityRegistry(db, tenant_id)
        cap1 = reg.get("cache_test.test")
        cap2 = reg.get("cache_test.test")
        # 同一对象 (来自缓存)
        assert cap1 is cap2


# ─────────────────── PolicyGuard ───────────────────


class TestPolicyGuard:
    """PolicyGuard 策略检查"""

    def _make_cap(self, db, factory, side_effect="read", **kwargs):
        entity = factory.entity(db, entity_code=f"ent_{id(kwargs) % 10000}")
        action = factory.action(db, entity,
            action_code="test_act",
            side_effect_type=side_effect,
            **kwargs,
        )
        return Capability(action, entity.entity_code)

    def test_read_always_allowed(self, db, factory):
        """只读操作始终放行"""
        cap = self._make_cap(db, factory, side_effect="read")
        guard = PolicyGuard()
        result = guard.check(cap, BeaverSessionScope())
        assert result.allowed

    def test_write_no_confirm_allowed(self, db, factory):
        """写操作无需确认时放行"""
        cap = self._make_cap(db, factory, side_effect="write",
                             requires_confirmation=False)
        guard = PolicyGuard()
        result = guard.check(cap, BeaverSessionScope())
        assert result.allowed

    def test_write_requires_confirmation(self, db, factory):
        """写操作需确认时阻止"""
        cap = self._make_cap(db, factory, side_effect="write",
                             requires_confirmation=True)
        guard = PolicyGuard()
        result = guard.check(cap, BeaverSessionScope())
        assert not result.allowed
        assert result.requires_confirmation
        assert "确认" in result.confirmation_message

    def test_write_confirmed_allowed(self, db, factory):
        """写操作已确认时放行"""
        cap = self._make_cap(db, factory, side_effect="write",
                             requires_confirmation=True)
        guard = PolicyGuard()
        result = guard.check(cap, BeaverSessionScope(), ctx={"confirmed": True})
        assert result.allowed

    def test_delete_requires_confirmation(self, db, factory):
        """删除操作需确认"""
        cap = self._make_cap(db, factory, side_effect="delete",
                             requires_confirmation=True)
        guard = PolicyGuard()
        result = guard.check(cap, BeaverSessionScope())
        assert not result.allowed
        assert "删除" in result.confirmation_message

    def test_scope_check_enterprise(self, db, factory):
        """企业权限校验 — 未认证时阻止"""
        cap = self._make_cap(db, factory, side_effect="write",
                             policy_config={"scope_check": "enterprise"})
        guard = PolicyGuard()
        # 匿名 scope
        result = guard.check(cap, BeaverSessionScope())
        assert not result.allowed
        assert "企业身份" in result.reason

    def test_scope_check_enterprise_authenticated(self, db, factory):
        """企业权限校验 — 已认证时放行"""
        cap = self._make_cap(db, factory, side_effect="write",
                             policy_config={"scope_check": "enterprise"})
        guard = PolicyGuard()
        scope = BeaverSessionScope(enterprise_id="RYSGS", ouid="12345")
        result = guard.check(cap, scope)
        assert result.allowed

    def test_scope_check_member(self, db, factory):
        """成员权限校验"""
        cap = self._make_cap(db, factory, side_effect="write",
                             policy_config={"scope_check": "member"})
        guard = PolicyGuard()
        # 有 enterprise_id 但无 member_id
        scope = BeaverSessionScope(enterprise_id="RYSGS", ouid="123")
        result = guard.check(cap, scope)
        assert not result.allowed
        assert "成员" in result.reason

    def test_precondition_exists(self, db, factory):
        """前置条件 — field 不存在时阻止"""
        cap = self._make_cap(db, factory, side_effect="write",
            policy_config={
                "preconditions": [
                    {"field": "orderId", "op": "exists", "message": "请先选择工单"}
                ]
            })
        guard = PolicyGuard()
        result = guard.check(cap, BeaverSessionScope(), ctx={"entities": {}})
        assert not result.allowed
        assert "工单" in result.reason

    def test_precondition_satisfied(self, db, factory):
        """前置条件满足时放行"""
        cap = self._make_cap(db, factory, side_effect="write",
            policy_config={
                "preconditions": [
                    {"field": "orderId", "op": "exists"}
                ]
            })
        guard = PolicyGuard()
        result = guard.check(cap, BeaverSessionScope(),
                             ctx={"entities": {"orderId": "123"}})
        assert result.allowed

    def test_precondition_eq(self, db, factory):
        """前置条件 eq 检查"""
        cap = self._make_cap(db, factory, side_effect="write",
            policy_config={
                "preconditions": [
                    {"field": "status", "op": "eq", "value": "open",
                     "message": "只能操作 open 状态的工单"}
                ]
            })
        guard = PolicyGuard()
        # 不等 -> 阻止
        result = guard.check(cap, BeaverSessionScope(),
                             ctx={"entities": {"status": "closed"}})
        assert not result.allowed

        # 相等 -> 放行
        result = guard.check(cap, BeaverSessionScope(),
                             ctx={"entities": {"status": "open"}})
        assert result.allowed

    def test_any_blocked_returns_first(self, db, factory):
        """any_blocked 返回第一个被阻止的能力"""
        cap_read = self._make_cap(db, factory, side_effect="read")
        cap_write = self._make_cap(db, factory, side_effect="write",
                                   requires_confirmation=True)
        guard = PolicyGuard()
        result = guard.any_blocked([cap_read, cap_write], BeaverSessionScope())
        assert result is not None
        assert result[0].side_effect == "write"

    def test_any_blocked_all_allowed(self, db, factory):
        """全部放行时返回 None"""
        cap1 = self._make_cap(db, factory, side_effect="read")
        cap2 = self._make_cap(db, factory, side_effect="read")
        guard = PolicyGuard()
        result = guard.any_blocked([cap1, cap2], BeaverSessionScope())
        assert result is None

    def test_custom_confirm_message(self, db, factory):
        """自定义确认提示"""
        cap = self._make_cap(db, factory, side_effect="write",
            requires_confirmation=True,
            policy_config={"confirm_message": "真的要提交投诉吗？"},
        )
        guard = PolicyGuard()
        result = guard.check(cap, BeaverSessionScope())
        assert result.confirmation_message == "真的要提交投诉吗？"

    def test_check_capabilities_batch(self, db, factory):
        """批量检查"""
        cap1 = self._make_cap(db, factory, side_effect="read")
        cap2 = self._make_cap(db, factory, side_effect="write",
                              requires_confirmation=True)
        guard = PolicyGuard()
        results = guard.check_capabilities([cap1, cap2], BeaverSessionScope())
        assert len(results) == 2
        assert results[0][1].allowed  # read
        assert not results[1][1].allowed  # write needs confirm
