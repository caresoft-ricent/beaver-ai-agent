"""Domain Runtime — 2.0 运行时第一装载层

职责:
  1. 按 domain_code 装载完整的 DomainPack（Domain + Entity + Property + Relation + Action + Parameter）
  2. DomainPack 提供便捷的查询方法（按实体查操作、按操作查参数）
  3. 按用户输入解析匹配 Domain（规则 + LLM）
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Optional

from sqlalchemy.orm import Session

from app.models.domain import Domain
from app.models.ontology import Entity, EntityProperty, EntityRelation
from app.models.action import Action, ActionParameter

logger = logging.getLogger("beaver.runtime.domain")


@dataclass
class DomainPack:
    """一个 Domain 的完整运行时数据包"""
    domain: Domain
    entities: list
    properties: list
    relations: list           # 纯语义关系，不含执行依赖
    actions: list
    parameters: list          # 含 filter_type / value_mode / agg_func 等映射元信息

    # ── 便捷查询 ──

    def get_entity(self, entity_code: str) -> Optional[Entity]:
        return next((e for e in self.entities if e.entity_code == entity_code), None)

    def get_actions_for_entity(self, entity_code: str) -> list:
        entity = self.get_entity(entity_code)
        return [a for a in self.actions if a.entity_id == entity.id] if entity else []

    def get_input_params(self, action_id: int) -> list:
        return [p for p in self.parameters if p.action_id == action_id and p.is_input]

    def get_output_params(self, action_id: int) -> list:
        return [p for p in self.parameters if p.action_id == action_id and p.is_output]

    def get_action_by_code(self, action_code: str) -> Optional[Action]:
        return next((a for a in self.actions if a.action_code == action_code), None)

    def all_action_codes(self) -> list[str]:
        return [a.action_code for a in self.actions]

    def to_prompt_context(self) -> str:
        """生成给 LLM 的 Domain 描述文本"""
        lines = [f"域: {self.domain.name} ({self.domain.code})"]
        if self.domain.description:
            lines.append(f"描述: {self.domain.description}")
        lines.append("可用操作:")
        for a in self.actions:
            params_summary = ", ".join(
                p.name for p in self.get_input_params(a.id) if p.is_required
            )
            lines.append(f"  - {a.action_name} ({a.action_code}): {a.action_description or ''}")
            if params_summary:
                lines.append(f"    必填参数: {params_summary}")
        return "\n".join(lines)


class DomainRuntime:
    """Domain 装载与匹配"""

    def __init__(self, db: Session, tenant_id: int):
        self.db = db
        self.tenant_id = tenant_id
        self._cache: dict[str, DomainPack] = {}

    def load_domain_pack(self, domain_code: str) -> DomainPack:
        """按 domain_code 装载完整的 DomainPack"""
        if domain_code in self._cache:
            return self._cache[domain_code]

        domain = (
            self.db.query(Domain)
            .filter(Domain.code == domain_code, Domain.tenant_id == self.tenant_id)
            .first()
        )
        if not domain:
            raise DomainNotAvailable(domain_code)
        if domain.status not in ("published", "reviewed"):
            raise DomainNotAvailable(domain_code, reason=f"status={domain.status}")

        # 装载关联的 Entity
        entities = (
            self.db.query(Entity)
            .filter(Entity.domain_id == domain.id)
            .all()
        )
        entity_ids = [e.id for e in entities]

        # 装载 Property / Relation / Action / Parameter
        properties = (
            self.db.query(EntityProperty)
            .filter(EntityProperty.entity_id.in_(entity_ids))
            .all()
        ) if entity_ids else []

        relations = (
            self.db.query(EntityRelation)
            .filter(EntityRelation.entity_id.in_(entity_ids))
            .all()
        ) if entity_ids else []

        actions = (
            self.db.query(Action)
            .filter(Action.entity_id.in_(entity_ids))
            .all()
        ) if entity_ids else []

        action_ids = [a.id for a in actions]
        parameters = (
            self.db.query(ActionParameter)
            .filter(ActionParameter.action_id.in_(action_ids))
            .all()
        ) if action_ids else []

        pack = DomainPack(
            domain=domain,
            entities=entities,
            properties=properties,
            relations=relations,
            actions=actions,
            parameters=parameters,
        )
        self._cache[domain_code] = pack
        logger.info("loaded domain_pack %s: %d entities, %d actions, %d params",
                     domain_code, len(entities), len(actions), len(parameters))
        return pack

    def list_published_domains(self) -> list[Domain]:
        """列出当前租户所有已发布的 Domain"""
        return (
            self.db.query(Domain)
            .filter(Domain.tenant_id == self.tenant_id,
                    Domain.status.in_(["published", "reviewed"]))
            .all()
        )

    def resolve_domain(self, message: str, session_state: dict = None) -> Optional[str]:
        """从用户输入推断 Domain（规则匹配，LLM 兜底在 ContextPlanner 中）

        策略:
          1. session 中有 current_domain → 沿用（多轮延续）
          2. 遍历 Domain.description 关键词匹配
          3. 返回 None → 交给 ContextPlanner 用 LLM 识别
        """
        # 优先沿用当前 domain
        if session_state:
            current = session_state.get("current_domain")
            if current:
                return current

        # 关键词匹配
        domains = self.list_published_domains()
        best_code = None
        best_score = 0
        for d in domains:
            score = 0
            # 匹配 domain name
            if d.name and d.name in message:
                score += 2
            # 匹配 domain code
            if d.code and d.code in message.lower():
                score += 1
            # 匹配 description 中的关键词
            if d.description:
                for word in d.description.split():
                    if len(word) >= 2 and word in message:
                        score += 0.5
            if score > best_score:
                best_score = score
                best_code = d.code

        return best_code if best_score > 0 else None


class DomainNotAvailable(Exception):
    """Domain 不存在或未发布"""
    def __init__(self, code: str, reason: str = "not found"):
        self.code = code
        self.reason = reason
        super().__init__(f"Domain '{code}' {reason}")
