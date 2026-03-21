"""Context Planner — Domain-aware 上下文规划器

在 DomainPack 层面完成:
  1. 匹配最佳 Action（基于实体 + 参数覆盖率）
  2. 填充参数（复用 normalize_entities / convert_params）
  3. 检测参数缺口（param_gaps）
  4. 判断是否需要用户确认（confirm 检查）

输出 PlanResult，供 ResponseRuntime / ActionRuntime 消费。
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Optional

from sqlalchemy.orm import Session

from app.core.context_manager import (
    normalize_entities,
    convert_params,
)
from app.runtime.domain_runtime import DomainPack

logger = logging.getLogger("beaver.runtime.planner")


@dataclass
class PlanResult:
    """规划结果"""
    plan_type: str                   # execute / clarify / confirm / fallback
    action_code: str = None          # 匹配到的 Action 编码
    flat_params: dict = field(default_factory=dict)   # 已填充的参数
    param_gaps: list = field(default_factory=list)     # 缺失参数列表 [{name, title, description}]
    confirm_fields: list = field(default_factory=list) # 确认字段列表
    clarification_text: str = None   # 追问文本
    evidence: dict = field(default_factory=dict)       # 规划证据


class ContextPlanner:
    """Domain-aware 上下文规划"""

    def __init__(self, db: Session, tenant_id: int):
        self.db = db
        self.tenant_id = tenant_id

    def plan(
        self,
        pack: DomainPack,
        entities: dict,
        message: str,
        intent_code: str = None,
        skill=None,
    ) -> PlanResult:
        """规划执行方案

        Args:
            pack: DomainPack (Domain 运行时数据包)
            entities: 已抽取+合并的实体字典
            message: 用户原始消息
            intent_code: 意图编码 (可选，用于辅助 Action 匹配)
            skill: Skill 对象 (可选, 用于 normalize/convert 兼容)
        """
        evidence = {}

        # 1. 匹配最佳 Action
        action = self._match_action(pack, entities, intent_code)
        if not action:
            evidence["match_result"] = "no_action_matched"
            return PlanResult(
                plan_type="fallback",
                evidence=evidence,
                clarification_text="暂未找到匹配的操作，请尝试换个问法。",
            )
        evidence["matched_action"] = action.action_code

        # 2. 归一化 + 参数转换 (复用已有逻辑)
        normalized = normalize_entities(dict(entities), message, db=self.db, skill=skill)
        converted = convert_params(self.db, normalized, skill)

        # 3. 填充参数 + 检测缺口
        input_defs = pack.get_input_params(action.id)
        flat_params, gaps = self._fill_params(converted, input_defs)

        evidence["param_fill"] = {
            "provided": list(flat_params.keys()),
            "gaps": [g["name"] for g in gaps],
        }

        # 4. 缺必填参数 → clarify
        if gaps:
            gap_texts = []
            for g in gaps:
                title = g.get("title") or g["name"]
                desc = g.get("description")
                gap_texts.append(f"- {title}" + (f"（{desc}）" if desc else ""))
            clarification = "为了帮您完成查询，还需要以下信息：\n" + "\n".join(gap_texts)

            return PlanResult(
                plan_type="clarify",
                action_code=action.action_code,
                flat_params=flat_params,
                param_gaps=gaps,
                clarification_text=clarification,
                evidence=evidence,
            )

        # 5. 需要确认?
        if action.requires_confirmation:
            confirm_fields = self._build_confirm_fields(flat_params, input_defs)
            return PlanResult(
                plan_type="confirm",
                action_code=action.action_code,
                flat_params=flat_params,
                confirm_fields=confirm_fields,
                evidence=evidence,
            )

        # 6. 一切就绪 → execute
        return PlanResult(
            plan_type="execute",
            action_code=action.action_code,
            flat_params=flat_params,
            evidence=evidence,
        )

    def _match_action(self, pack: DomainPack, entities: dict, intent_code: str = None):
        """匹配最佳 Action

        优先级:
          1. action_code == intent_code (精确匹配)
          2. 参数覆盖率最高的 Action
        """
        all_actions = pack.actions
        if not all_actions:
            return None

        # 精确匹配
        if intent_code:
            exact = pack.get_action_by_code(intent_code)
            if exact:
                return exact

        # 按输入参数覆盖率排序
        scored = []
        for action in all_actions:
            input_defs = pack.get_input_params(action.id)
            if not input_defs:
                scored.append((action, 0.5))
                continue
            covered = sum(
                1 for p in input_defs
                if (p.source_property or p.name) in entities or p.name in entities
            )
            score = covered / len(input_defs)
            scored.append((action, score))

        scored.sort(key=lambda x: x[1], reverse=True)
        return scored[0][0] if scored else None

    def _fill_params(self, entities: dict, input_defs) -> tuple:
        """根据输入参数定义填充 flat_params，返回 (params, gaps)"""
        flat = {}
        gaps = []

        for p in input_defs:
            key = p.source_property or p.name
            value = entities.get(key) or entities.get(p.name)

            if value is not None:
                flat[p.name] = value
            elif p.default_value is not None:
                flat[p.name] = p.default_value
            elif p.is_required:
                gaps.append({
                    "name": p.name,
                    "title": p.title or p.name,
                    "description": p.param_description,
                })

        return flat, gaps

    def _build_confirm_fields(self, flat_params: dict, input_defs) -> list:
        """构建确认字段列表"""
        fields = []
        for p in input_defs:
            if p.name in flat_params:
                fields.append({
                    "name": p.name,
                    "title": p.title or p.name,
                    "value": flat_params[p.name],
                })
        return fields
