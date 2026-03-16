"""CapabilityRegistry — 统一能力注册与查询

每个 Action 对应一个 Capability（能力），通过 capability_code 唯一标识。
Registry 提供:
  - 按 capability_code 查找 Action
  - 按 side_effect_type 过滤 (read / write / delete)
  - 技能工具链解析为能力列表
  - 从 ActionParameter 自动生成 input/output schema（如 Action 自身无 schema）
"""
from __future__ import annotations

from typing import Optional
from sqlalchemy.orm import Session

from app.models.action import Action, ActionParameter
from app.models.intent import Skill, SkillTool
from app.models.ontology import Entity


class Capability:
    """运行时能力描述（从 Action 行映射）"""

    __slots__ = (
        "code", "display_name", "description",
        "side_effect", "input_schema", "output_schema",
        "requires_confirmation", "policy_config",
        "action_id", "entity_code",
    )

    def __init__(self, action: Action, entity_code: str = ""):
        self.action_id: int = action.id
        self.code: str = action.capability_code or f"{entity_code}.{action.action_code}"
        self.display_name: str = action.action_name
        self.description: str = action.action_description or ""
        self.side_effect: str = action.side_effect_type or "read"
        self.input_schema: dict = action.input_schema or {}
        self.output_schema: dict = action.output_schema or {}
        self.requires_confirmation: bool = bool(action.requires_confirmation)
        self.policy_config: dict = action.policy_config or {}
        self.entity_code: str = entity_code

    @property
    def is_read_only(self) -> bool:
        return self.side_effect == "read"

    @property
    def is_dangerous(self) -> bool:
        return self.side_effect in ("write", "delete")

    def to_dict(self) -> dict:
        return {
            "code": self.code,
            "display_name": self.display_name,
            "side_effect": self.side_effect,
            "requires_confirmation": self.requires_confirmation,
            "input_schema": self.input_schema,
            "output_schema": self.output_schema,
        }


class CapabilityRegistry:
    """能力注册表 — 从数据库按需加载"""

    def __init__(self, db: Session, tenant_id: int):
        self._db = db
        self._tenant_id = tenant_id
        self._cache: dict[str, Capability] = {}

    # ── 查询 ──

    def get(self, capability_code: str) -> Optional[Capability]:
        """按 capability_code 获取能力，带缓存"""
        if capability_code in self._cache:
            return self._cache[capability_code]

        action = (
            self._db.query(Action)
            .filter(
                Action.tenant_id == self._tenant_id,
                Action.capability_code == capability_code,
            )
            .first()
        )
        if not action:
            return None

        entity_code = self._resolve_entity_code(action.entity_id)
        cap = Capability(action, entity_code)
        self._cache[capability_code] = cap
        return cap

    def get_by_action_id(self, action_id: int) -> Optional[Capability]:
        """按 action_id 获取能力"""
        for cap in self._cache.values():
            if cap.action_id == action_id:
                return cap

        action = self._db.query(Action).filter(Action.id == action_id).first()
        if not action:
            return None

        entity_code = self._resolve_entity_code(action.entity_id)
        cap = Capability(action, entity_code)
        self._cache[cap.code] = cap
        return cap

    def list_by_side_effect(self, side_effect: str) -> list[Capability]:
        """列出指定副作用类型的所有能力"""
        actions = (
            self._db.query(Action)
            .filter(
                Action.tenant_id == self._tenant_id,
                Action.side_effect_type == side_effect,
            )
            .all()
        )
        result = []
        for action in actions:
            entity_code = self._resolve_entity_code(action.entity_id)
            cap = Capability(action, entity_code)
            self._cache[cap.code] = cap
            result.append(cap)
        return result

    def resolve_skill_capabilities(self, skill: Skill) -> list[Capability]:
        """解析技能工具链涉及的全部能力"""
        tools = (
            self._db.query(SkillTool)
            .filter(SkillTool.skill_id == skill.id)
            .order_by(SkillTool.order_no)
            .all()
        )
        caps = []
        for tool in tools:
            if tool.action_id:
                cap = self.get_by_action_id(tool.action_id)
                if cap:
                    caps.append(cap)
        return caps

    def build_input_schema(self, action_id: int) -> dict:
        """从 ActionParameter 自动生成 JSON-Schema-like 输入描述"""
        params = (
            self._db.query(ActionParameter)
            .filter(ActionParameter.action_id == action_id, ActionParameter.is_input == True)
            .all()
        )
        properties = {}
        required = []
        for p in params:
            if p.value_type == "fixed":
                continue
            name = p.source_property or p.name
            properties[name] = {
                "type": p.type or "string",
                "title": p.title or name,
                "description": p.param_description or "",
            }
            if p.default_value:
                properties[name]["default"] = p.default_value
            if p.is_required and not p.default_value:
                required.append(name)
        return {
            "type": "object",
            "properties": properties,
            "required": required,
        }

    # ── 内部 ──

    def _resolve_entity_code(self, entity_id: int) -> str:
        entity = self._db.query(Entity).filter(Entity.id == entity_id).first()
        return entity.entity_code if entity else ""
