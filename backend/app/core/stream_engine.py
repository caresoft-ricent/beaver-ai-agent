"""流式对话引擎 - 基于AG-UI协议输出SSE事件流

完整处理链:
  RUN_STARTED
    -> 加载上下文 -> 意图识别 -> 增强实体抽取 -> 参数归一化
    -> 参数转换 -> 槽位校验(追问) -> TOOL_CALL -> 回复生成
  -> RUN_FINISHED

每步都记录证据链（含详细输入/输出），支持管理后台查询和日志全链路追踪。
"""
import json
import logging
import time
import re
import traceback
from typing import AsyncGenerator, Optional
from sqlalchemy.orm import Session

from app.models.config import LLMConfig, Connector
from app.models.ontology import Entity, EntityProperty
from app.models.action import Action
from app.models.intent import Skill, SkillTool
from app.models.action import ActionParameter
from app.clients.llm_client import call_llm, call_llm_for_intent, call_llm_for_entities
from app.clients.connector_client import ConnectorClient
from app.core import agui
from app.core.context_manager import (
    load_context, save_context, merge_entities,
    normalize_entities, convert_params, check_slots, build_clarification_reply,
    should_summarize, summarize_context,
)
from app.core.evidence import EvidenceCollector
from app.core.workflow_engine import WorkflowExecutor
from app.core import pipeline
from app.kernel.scope import BeaverSessionScope
from app.kernel.capability import CapabilityRegistry
from app.kernel.policy import PolicyGuard

logger = logging.getLogger("beaver.engine")


async def stream_dialog(
    db: Session,
    tenant_id: int,
    customer_id: str,
    session_id: str,
    message: str,
    thread_id: str,
    run_id: str,
    scope: BeaverSessionScope = None,
) -> AsyncGenerator[str, None]:
    """主入口 - 流式返回 AG-UI SSE 事件"""
    scope = scope or BeaverSessionScope()

    evidence = EvidenceCollector(session_id, tenant_id, customer_id, scope=scope)
    yield agui.run_started(thread_id, run_id)

    try:
        async for evt in _stream_dialog_inner(
            db, tenant_id, customer_id, session_id, message,
            thread_id, run_id, evidence, scope,
        ):
            yield evt
    except Exception as exc:
        evidence.add_error("stream_dialog", str(exc), traceback.format_exc())
        yield agui.run_error(f"处理出错: {exc}")

    # 保存证据链到 ActionLog
    try:
        evidence.save_action_log(
            db, action_type="stream_dialog",
            params={"message": message},
            status="success" if not evidence.errors else "error",
            result=evidence.to_dict(),
            error_message=evidence.errors[0]["error"] if evidence.errors else None,
        )
        db.flush()
    except Exception:
        pass

    yield agui.run_finished(thread_id, run_id)


async def _stream_dialog_inner(
    db: Session,
    tenant_id: int,
    customer_id: str,
    session_id: str,
    message: str,
    thread_id: str,
    run_id: str,
    evidence: EvidenceCollector,
    scope: BeaverSessionScope = None,
) -> AsyncGenerator[str, None]:

    # -- Step 1: 加载上下文 --
    t0 = time.time()
    ctx = load_context(db, session_id)
    ctx["turn_count"] = ctx.get("turn_count", 0) + 1

    # 上下文摘要检查 (阈值默认20，匹配到技能后可用技能配置覆盖)
    if should_summarize(ctx):
        llm_cfg = _get_llm_config(db, tenant_id, "general")
        if llm_cfg:
            def _call_summary(messages, system_prompt):
                r = call_llm(
                    provider=llm_cfg.provider, model=llm_cfg.model_name,
                    api_url=llm_cfg.api_url, api_key=llm_cfg.api_key,
                    messages=messages, system_prompt=system_prompt,
                    temperature=0.3, max_tokens=256,
                )
                return r["content"]
            summarize_context(db, session_id, ctx, llm_caller=_call_summary)
        else:
            summarize_context(db, session_id, ctx)

    evidence.add_step("load_context", {
        "turn": ctx["turn_count"],
        "existing_entities": ctx.get("entities", {}),
        "last_intent": ctx.get("last_intent"),
        "has_summary": bool(ctx.get("summary")),
        "history_intents": ctx.get("history_intents", []),
    }, int((time.time() - t0) * 1000))

    # -- Step 2: 加载技能 --
    skills = (
        db.query(Skill)
        .filter(Skill.tenant_id == tenant_id, Skill.status == "published")
        .order_by(Skill.sort_order)
        .all()
    )

    if not skills:
        async for evt in _stream_text("系统正在配置中，暂时无法回答您的问题。请稍后再试。"):
            yield evt
        return

    # -- Step 3: 意图识别 --
    yield agui.step_started("intent_recognition")
    t0 = time.time()

    matched_skill, confidence, rule_entities, intent_detail = _recognize_intent(
        db, tenant_id, message, skills, ctx
    )

    if not matched_skill:
        evidence.add_step("intent_recognition", {
            "result": "no_match",
            "user_message": message,
            "candidates": intent_detail.get("candidates", []),
        }, int((time.time() - t0) * 1000))
        yield agui.step_finished("intent_recognition")
        async for evt in _stream_text(
            "抱歉，我暂时无法理解您的问题。您可以试试：查看产线进度、查询现场人员、提交投诉等。"
        ):
            yield evt
        return

    intent_evidence = {
        "skill": matched_skill.skill_code,
        "skill_name": matched_skill.skill_name,
        "confidence": confidence,
        "rule_entities": rule_entities,
        "match_method": intent_detail.get("match_method", "unknown"),
        "candidates": intent_detail.get("candidates", []),
        "user_message": message,
    }
    # LLM 交互记录：提示词和返回
    if intent_detail.get("llm_prompt"):
        intent_evidence["llm_prompt"] = intent_detail["llm_prompt"]
    if intent_detail.get("llm_response"):
        intent_evidence["llm_response"] = intent_detail["llm_response"]

    evidence.add_step("intent_recognition", intent_evidence, int((time.time() - t0) * 1000))

    yield agui.custom_event("intent", {
        "code": matched_skill.skill_code,
        "name": matched_skill.skill_name,
        "confidence": confidence,
    })
    yield agui.step_finished("intent_recognition")

    # 更新上下文: 意图切换检测 — 换话题时清除旧实体避免污染
    prev_intent = ctx.get("last_intent")
    if prev_intent and prev_intent != matched_skill.skill_code:
        ctx["entities"] = {}
        evidence.add_step("intent_switch", {
            "from": prev_intent, "to": matched_skill.skill_code,
            "cleared_entities": True,
        })
    ctx["last_intent"] = matched_skill.skill_code
    history_intents = ctx.get("history_intents", [])
    history_intents.append(matched_skill.skill_code)
    ctx["history_intents"] = history_intents[-10:]

    # -- Step 4: 增强实体抽取 --
    yield agui.step_started("entity_extraction")
    t0 = time.time()

    # LLM意图识别返回的实体键名自由(如"company"), 映射为规范参数名(如"customerName")
    if intent_detail.get("match_method") == "llm" and rule_entities:
        rule_entities = _remap_intent_entities(db, matched_skill, rule_entities)

    # 合并: 上下文旧实体 + 规则抽取的新实体
    entities = merge_entities(ctx.get("entities", {}), rule_entities)
    entities_after_merge = {**entities}

    # LLM 增强抽取
    llm_entity_result = _enhanced_entity_extraction(db, tenant_id, message, matched_skill, entities, ctx)
    llm_entities = llm_entity_result.get("entities", {}) if isinstance(llm_entity_result, dict) else {}
    if llm_entities:
        entities = merge_entities(entities, llm_entities)
        llm_entity_evidence = {
            "llm_raw": llm_entities,
            "merged_result": {**entities},
        }
        if llm_entity_result.get("_llm_prompt"):
            llm_entity_evidence["llm_prompt"] = llm_entity_result["_llm_prompt"]
        if llm_entity_result.get("_llm_response"):
            llm_entity_evidence["llm_response"] = llm_entity_result["_llm_response"]
        evidence.add_step("llm_entity_extraction", llm_entity_evidence)

    # 参数归一化 (日期、枚举等 + 属性级normalization_config)
    entities_before_normalize = {**entities}
    entities = normalize_entities(entities, message, db=db, skill=matched_skill)
    evidence.add_step("normalize_entities", {
        "before": entities_before_normalize,
        "after": {**entities},
    })

    # 参数转换 (名称->ID等)
    entities_before_convert = {**entities}
    entities = convert_params(db, entities, matched_skill)

    evidence.add_step("entity_extraction", {
        "context_entities": ctx.get("entities", {}),
        "rule_entities": rule_entities,
        "after_merge": entities_after_merge,
        "after_normalize": entities_before_convert,
        "after_convert": {**entities},
        "final_entities": entities,
    }, int((time.time() - t0) * 1000))

    # 更新上下文实体
    ctx["entities"] = entities
    save_context(db, session_id, ctx)

    yield agui.step_finished("entity_extraction")

    # -- Step 5: 加载工具链 --
    tools = (
        db.query(SkillTool)
        .filter(SkillTool.skill_id == matched_skill.id)
        .order_by(SkillTool.order_no)
        .all()
    )

    # 无工具链 -> 用LLM生成回答或返回模板
    if not tools:
        if matched_skill.response_prompt:
            llm_config = _get_llm_config(db, tenant_id, "response") or _get_llm_config(db, tenant_id, "general")
            if llm_config:
                yield agui.step_started("reply_generation")
                async for evt in _stream_llm_reply(llm_config, message, matched_skill, {}):
                    yield evt
                yield agui.step_finished("reply_generation")
                return
        reply = matched_skill.response_template or "您好！请问有什么可以帮助您的？"
        async for evt in _stream_text(reply):
            yield evt
        return

    # -- Step 6: 槽位校验 + 追问 --
    slot_result = check_slots(db, matched_skill, entities)
    if not slot_result.complete:
        evidence.add_step("slot_check", {
            "complete": False,
            "missing": [p["name"] for p in slot_result.missing_required],
            "missing_detail": slot_result.missing_required,
            "provided_entities": entities,
        })
        clarification = build_clarification_reply(slot_result)
        if clarification:
            yield agui.custom_event("clarification", {
                "missing_params": slot_result.missing_required,
                "text": clarification,
            })
            async for evt in _stream_text(clarification):
                yield evt
            save_context(db, session_id, ctx)
            return
    else:
        evidence.add_step("slot_check", {"complete": True, "entities": entities})
        # 需要确认的技能（如投诉提交）：槽位齐全时发送确认卡片
        if matched_skill.clarification_config and matched_skill.clarification_config.get("require_confirm"):
            if not ctx.get("confirmed"):
                yield agui.custom_event("card", {
                    "card_type": "confirm",
                    "title": matched_skill.clarification_config.get("confirm_title", "信息确认"),
                    "fields": _build_confirm_fields(db, matched_skill, entities),
                    "skill_code": matched_skill.skill_code,
                })
                confirm_text = matched_skill.clarification_config.get("confirm_message", "请确认以上信息是否正确：")
                async for evt in _stream_text(confirm_text):
                    yield evt
                save_context(db, session_id, ctx)
                return

    # -- Step 7: 执行工具链 / 编排流程 --
    flow_type = getattr(matched_skill, 'flow_type', 'simple') or 'simple'

    if flow_type == 'workflow' and matched_skill.workflow_config:
        # ── 编排模式: 走 WorkflowExecutor ──
        executor = WorkflowExecutor(
            db=db, skill=matched_skill, entities=entities,
            customer_id=customer_id, tenant_id=tenant_id, evidence=evidence,
        )
        for evt in executor.execute():
            yield evt

        # 编排引擎自带回复节点，直接返回
        if executor.paused:
            # confirm 节点暂停 — 保存暂停态到上下文
            ctx["workflow_paused"] = executor.pause_data
            save_context(db, session_id, ctx)
        return

    # ── Step 7.1: PolicyGuard — 能力级策略检查 ──
    registry = CapabilityRegistry(db, tenant_id)
    caps = registry.resolve_skill_capabilities(matched_skill)
    if caps:
        guard = PolicyGuard()
        blocked = guard.any_blocked(caps, scope or BeaverSessionScope(), ctx)
        if blocked:
            cap, policy_result = blocked
            evidence.add_step("policy_guard", {
                "blocked": True,
                "capability": cap.code,
                "side_effect": cap.side_effect,
                "reason": policy_result.reason,
                "blocked_by": policy_result.blocked_by,
                "requires_confirmation": policy_result.requires_confirmation,
            })
            if policy_result.requires_confirmation:
                yield agui.custom_event("card", {
                    "card_type": "confirm",
                    "title": "操作确认",
                    "text": policy_result.confirmation_message,
                    "capability_code": cap.code,
                    "skill_code": matched_skill.skill_code,
                })
                async for evt in _stream_text(policy_result.confirmation_message):
                    yield evt
                save_context(db, session_id, ctx)
                return
            else:
                async for evt in _stream_text(policy_result.reason):
                    yield evt
                return
        else:
            evidence.add_step("policy_guard", {
                "blocked": False,
                "capabilities": [c.code for c in caps],
                "side_effects": list({c.side_effect for c in caps}),
            })

    # ── 简单模式: 线性工具链(现有逻辑不变) ──
    yield agui.step_started("tool_execution")
    t0 = time.time()

    query_results = {}
    response_descriptions = []  # 收集各操作的响应数据说明
    max_calls = getattr(matched_skill, 'max_tool_calls', 10) or 10
    for idx, tool in enumerate(tools):
        if idx >= max_calls:
            evidence.add_step("tool_limit", {"max_tool_calls": max_calls, "skipped": len(tools) - idx})
            break
        tool_result = _execute_tool_with_events(db, tool, entities, customer_id, evidence)
        for evt in tool_result["events"]:
            yield evt
        if tool_result["data"]:
            query_results[f"tool_{tool.order_no}"] = tool_result["data"]
        if tool_result.get("response_description"):
            response_descriptions.append(tool_result["response_description"])

    evidence.add_step("tool_execution", {
        "tools_count": len(tools),
        "results_count": len(query_results),
        "tools_detail": [
            {"order": t.order_no, "entity_id": t.entity_id, "action_id": t.action_id}
            for t in tools[:max_calls]
        ],
    }, int((time.time() - t0) * 1000))

    yield agui.step_finished("tool_execution")

    # -- Step 8: 生成回答 --
    yield agui.step_started("reply_generation")
    t0_reply = time.time()

    if matched_skill.response_template and query_results:
        reply = _render_template(matched_skill.response_template, query_results, entities)
        async for evt in _stream_text(reply):
            yield evt
        evidence.add_step("reply_generation", {
            "method": "template",
            "template_preview": (matched_skill.response_template or "")[:200],
        }, int((time.time() - t0_reply) * 1000))
    elif query_results:
        llm_config = _get_llm_config(db, tenant_id, "response")
        if llm_config:
            # 合并响应数据说明，提供给LLM理解字段含义
            data_desc = "\n".join(response_descriptions) if response_descriptions else None
            async for evt in _stream_llm_reply(llm_config, message, matched_skill, query_results, data_desc):
                yield evt
            evidence.add_step("reply_generation", {
                "method": "llm",
                "model": llm_config.model_name,
                "prompt_preview": (matched_skill.response_prompt or "")[:200],
                "data_size": len(json.dumps(query_results, ensure_ascii=False, default=str)),
            }, int((time.time() - t0_reply) * 1000))
        else:
            reply = _format_data_as_text(query_results)
            async for evt in _stream_text(reply):
                yield evt
            evidence.add_step("reply_generation", {
                "method": "text_format",
            }, int((time.time() - t0_reply) * 1000))
    else:
        async for evt in _stream_text("查询到的信息为空，请确认您的问题或稍后再试。"):
            yield evt
        evidence.add_step("reply_generation", {
            "method": "empty_result",
        }, int((time.time() - t0_reply) * 1000))

    yield agui.step_finished("reply_generation")

    if query_results:
        yield agui.custom_event("structured_data", query_results)
        # 根据技能类型发送对应的卡片事件
        card_evt = _build_card_event(matched_skill, query_results, entities)
        if card_evt:
            yield agui.custom_event("card", card_evt)

    # 快捷操作
    quick_actions = _build_quick_actions(matched_skill)
    if quick_actions:
        yield agui.custom_event("card", {
            "card_type": "quick_actions",
            "actions": quick_actions,
        })

    yield agui.custom_event("evidence", evidence.to_dict())


# == 辅助函数 ==


async def _stream_text(text: str):
    """将整段文本拆分为流式 TEXT_MESSAGE 事件"""
    mid = agui.new_id()
    yield agui.text_message_start(mid)
    chunks = re.split(r'(?<=[。！？，；、\n])', text)
    for chunk in chunks:
        if chunk:
            yield agui.text_message_content(mid, chunk)
    yield agui.text_message_end(mid)


def _recognize_intent(db: Session, tenant_id: int, message: str,
                      skills: list, ctx: dict = None):
    """意图识别 — 委托给 pipeline.recognize_intent"""
    return pipeline.recognize_intent(db, tenant_id, message, skills, ctx)


def _enhanced_entity_extraction(
    db: Session, tenant_id: int, message: str,
    skill: Skill, known_entities: dict, ctx: dict,
) -> dict:
    """LLM 增强实体抽取，返回 {entities, _llm_prompt, _llm_response}"""
    llm_config = _get_llm_config(db, tenant_id, "entity") or _get_llm_config(db, tenant_id, "general")
    if not llm_config:
        return {}

    entity_defs = _get_entity_definitions(db, skill)
    if not entity_defs:
        return {}

    # 合并上下文摘要
    llm_context = ctx.get("entities")
    if ctx.get("summary"):
        llm_context = {**(llm_context or {}), "_summary": ctx["summary"]}

    try:
        result = call_llm_for_entities(
            provider=llm_config.provider,
            model=llm_config.model_name,
            api_url=llm_config.api_url,
            api_key=llm_config.api_key,
            user_message=message,
            intent_code=skill.skill_code,
            known_entities=known_entities,
            entity_definitions=entity_defs,
            context=llm_context,
            custom_prompt=skill.entity_extract_prompt or None,
        )
        return result
    except Exception:
        return {}


def _get_entity_definitions(db: Session, skill: Skill) -> list:
    """从技能工具链中收集参数定义"""
    defs = []
    tools = (
        db.query(SkillTool)
        .filter(SkillTool.skill_id == skill.id)
        .order_by(SkillTool.order_no)
        .all()
    )
    # 预加载所有相关 EntityProperty，用于补充 llm_description / extract_expression
    entity_ids = {t.entity_id for t in tools if t.entity_id}
    ep_map: dict[tuple, EntityProperty] = {}  # (entity_id, name) -> EntityProperty
    if entity_ids:
        eps = (
            db.query(EntityProperty)
            .filter(EntityProperty.entity_id.in_(entity_ids))
            .all()
        )
        for ep in eps:
            ep_map[(ep.entity_id, ep.name)] = ep

    seen = set()
    for tool in tools:
        api_config = tool.config.get("api_config") if tool.config else None
        if api_config:
            for p_list_key in ("required_params", "optional_params"):
                for p in api_config.get(p_list_key, []):
                    pname = p if isinstance(p, str) else p.get("name", "")
                    if pname and pname not in seen:
                        seen.add(pname)
                        # 尝试从 EntityProperty 获取增强信息
                        ep = ep_map.get((tool.entity_id, pname)) if tool.entity_id else None
                        defs.append({
                            "name": pname,
                            "title": pname if isinstance(p, str) else p.get("title", pname),
                            "type": "string" if isinstance(p, str) else p.get("type", "string"),
                            "required": p_list_key == "required_params",
                            "description": "" if isinstance(p, str) else p.get("description", ""),
                            "llm_description": ep.llm_description if ep and ep.llm_description else "",
                            "extract_expression": ep.extract_expression if ep and ep.extract_expression else "",
                        })
            continue

        if tool.action_id:
            # 加载操作描述，为LLM提供操作语义上下文
            action_obj = db.query(Action).filter(Action.id == tool.action_id).first()
            action_desc = action_obj.action_description if action_obj else ""

            action_params = (
                db.query(ActionParameter)
                .filter(ActionParameter.action_id == tool.action_id, ActionParameter.is_input == True)
                .all()
            )
            for ap in action_params:
                # value_type == "fixed" 的参数由系统自动填充，不需要LLM抽取
                if ap.value_type == "fixed":
                    continue
                # 使用语义属性名(source_property)作为抽取key
                semantic_name = ap.source_property or ap.name
                if semantic_name not in seen:
                    seen.add(semantic_name)
                    # 查找EntityProperty: 优先用语义名，回退到API参数名
                    ep = None
                    if tool.entity_id:
                        ep = ep_map.get((tool.entity_id, semantic_name))
                        if not ep:
                            ep = ep_map.get((tool.entity_id, ap.name))
                    defs.append({
                        "name": semantic_name,
                        "title": ap.title or semantic_name,
                        "type": ap.type,
                        "required": ap.is_required and not ap.default_value,
                        "description": ap.param_description or "",
                        "llm_description": ep.llm_description if ep and ep.llm_description else "",
                        "extract_expression": ep.extract_expression if ep and ep.extract_expression else "",
                        "default_value": ap.default_value or "",
                        "action_description": action_desc or "",
                    })
    return defs


def _remap_intent_entities(db: Session, skill: Skill, raw_entities: dict) -> dict:
    """将LLM意图识别返回的自由键名实体映射为技能的规范参数名。

    LLM意图识别返回的实体键名不受约束(如 "company"),
    这里将其重新映射到技能实际定义的参数名(如 "customerName")。
    """
    if not raw_entities:
        return raw_entities

    # 收集本技能定义的参数名
    param_names = set()
    tools = (
        db.query(SkillTool)
        .filter(SkillTool.skill_id == skill.id)
        .all()
    )
    for tool in tools:
        if tool.action_id:
            params = (
                db.query(ActionParameter)
                .filter(ActionParameter.action_id == tool.action_id, ActionParameter.is_input == True)
                .all()
            )
            for ap in params:
                param_names.add(ap.source_property or ap.name)

    if not param_names:
        return raw_entities

    # 已经匹配的键直接保留，未匹配的尝试映射到唯一候选参数
    remapped = {}
    unmatched_keys = []
    for k, v in raw_entities.items():
        if k in param_names:
            remapped[k] = v
        else:
            unmatched_keys.append((k, v))

    # 对于未匹配的实体键，如果只有一个尚未填充的参数名，则直接映射
    unfilled = param_names - set(remapped.keys())
    if len(unmatched_keys) == 1 and len(unfilled) == 1:
        remapped[unfilled.pop()] = unmatched_keys[0][1]
    elif unmatched_keys:
        # 多个未匹配: 按值保留(不丢弃)，后续LLM增强抽取会处理
        for k, v in unmatched_keys:
            remapped[k] = v

    return remapped


def _apply_output_aggregation(db: Session, action_id: int, result: dict) -> dict:
    """对 API 返回结果应用输出参数的 value_type 聚合处理(count/sum)"""
    output_params = (
        db.query(ActionParameter)
        .filter(ActionParameter.action_id == action_id, ActionParameter.is_output == True)
        .all()
    )
    agg_params = [ap for ap in output_params if ap.value_type in ("count", "sum")]
    if not agg_params:
        return result

    # 提取数据列表
    raw_data = result.get("data", {})
    items = None
    if isinstance(raw_data, dict):
        inner = raw_data.get("data", raw_data)
        if isinstance(inner, dict):
            items = inner.get("items")
        elif isinstance(inner, list):
            items = inner
    elif isinstance(raw_data, list):
        items = raw_data

    if not isinstance(items, list):
        return result

    aggregated = {}
    for ap in agg_params:
        field_name = ap.source_property or ap.name
        if ap.value_type == "count":
            aggregated[field_name] = len(items)
        elif ap.value_type == "sum":
            total = sum(
                float(item.get(field_name, 0))
                for item in items
                if isinstance(item, dict) and item.get(field_name) is not None
            )
            aggregated[field_name] = total

    if aggregated:
        result["aggregated"] = aggregated

    return result


def _build_param_mapping(db: Session, action_id: int) -> Optional[dict]:
    """参数名映射 — 委托给 pipeline.build_param_mapping"""
    return pipeline.build_param_mapping(db, action_id)


def _execute_tool_with_events(
    db: Session, tool: SkillTool, entities: dict, customer_id: str,
    evidence: EvidenceCollector = None,
) -> dict:
    """执行单个工具, 返回 { events: [...], data: ... }"""
    events = []
    tc_id = agui.new_id()
    t0 = time.time()

    api_config = tool.config.get("api_config") if tool.config else None

    if api_config and tool.tools_mode == "api":
        tool_name = api_config.get("name", f"api_tool_{tool.order_no}")
        events.append(agui.tool_call_start(tc_id, tool_name))

        params = {**entities, "customer_id": customer_id}
        events.append(agui.tool_call_args(tc_id, json.dumps(params, ensure_ascii=False)))
        events.append(agui.tool_call_end(tc_id))

        connector_id = api_config.get("connector_id")
        connector = db.query(Connector).filter(Connector.id == connector_id).first() if connector_id else None

        if connector:
            cli = ConnectorClient({
                "base_url": connector.base_url,
                "auth_type": connector.auth_type,
                "auth_config": connector.auth_config,
                "timeout": connector.timeout,
                "mock_enabled": connector.mock_enabled,
            })
            try:
                result = cli.call_action(
                    action_config={
                        "http_method": api_config.get("http_method", "GET"),
                        "api_path": api_config.get("api_path", ""),
                        "request_template": api_config.get("request_template"),
                        "response_mapping": api_config.get("response_mapping"),
                    },
                    params=params,
                    mock_response=api_config.get("mock_response"),
                )
                events.append(agui.tool_call_result(
                    tc_id, json.dumps(result, ensure_ascii=False, default=str)
                ))
                if evidence:
                    method = api_config.get("http_method", "GET")
                    req_detail = {
                        "method": method,
                        "url": f"{connector.base_url.rstrip('/')}/{api_config.get('api_path', '').lstrip('/')}",
                        "params": params,
                    }
                    if method in ("POST", "PUT", "PATCH"):
                        tmpl = api_config.get("request_template")
                        req_detail["body"] = tmpl if tmpl else params
                    evidence.add_step(f"tool_{tool_name}", {
                        "source": result.get("source", "api"),
                        "status_code": result.get("status_code"),
                        "response_time_ms": result.get("response_time_ms"),
                        "request": req_detail,
                    }, int((time.time() - t0) * 1000))
                return {"events": events, "data": result}
            except Exception as exc:
                if evidence:
                    curl_cmd = getattr(exc, 'curl', '')
                    error_detail = {"error": str(exc), "traceback": traceback.format_exc()}
                    if curl_cmd:
                        error_detail["curl"] = curl_cmd
                    evidence.add_error(f"tool_{tool_name}", str(exc), error_detail)
                mock = api_config.get("mock_response")
                if mock:
                    data = {"data": mock, "source": "mock"}
                    events.append(agui.tool_call_result(tc_id, json.dumps(data, ensure_ascii=False)))
                    return {"events": events, "data": data}
                return {"events": events, "data": None}
        else:
            mock = api_config.get("mock_response")
            if mock:
                data = {"data": mock, "source": "mock"}
                events.append(agui.tool_call_result(tc_id, json.dumps(data, ensure_ascii=False)))
                return {"events": events, "data": data}
            return {"events": events, "data": None}

    # 回退: entity+action 方式
    action = None
    entity = None
    if tool.action_id:
        action = db.query(Action).filter(Action.id == tool.action_id).first()
    if tool.entity_id:
        entity = db.query(Entity).filter(Entity.id == tool.entity_id).first()
    if not action and entity:
        action = db.query(Action).filter(Action.entity_id == entity.id).first()
    if not action:
        return {"events": [], "data": None}

    tool_name = f"{entity.entity_code}.{action.action_code}" if entity else action.action_code
    events.append(agui.tool_call_start(tc_id, tool_name))

    params = {**entities, "customer_id": customer_id}

    # 应用 value_type 和 default_value 处理
    input_params = (
        db.query(ActionParameter)
        .filter(ActionParameter.action_id == action.id, ActionParameter.is_input == True)
        .all()
    )
    for ap in input_params:
        semantic_name = ap.source_property or ap.name
        if ap.value_type == "fixed" and ap.default_value is not None:
            # fixed类型: 直接使用默认值，忽略用户输入
            params[semantic_name] = ap.default_value
        elif ap.default_value is not None and ap.default_value != "" and semantic_name not in params:
            # 有默认值但用户未提供: 使用默认值填充
            params[semantic_name] = ap.default_value

    events.append(agui.tool_call_args(tc_id, json.dumps(params, ensure_ascii=False)))
    events.append(agui.tool_call_end(tc_id))

    # 获取连接器 — 优先从操作自身, 其次从本体
    connector = None
    if action.connector_id:
        connector = db.query(Connector).filter(Connector.id == action.connector_id).first()
    if not connector and entity and entity.connector_id:
        connector = db.query(Connector).filter(Connector.id == entity.connector_id).first()

    if not connector:
        if action.mock_response:
            data = {"data": action.mock_response, "source": "mock"}
            events.append(agui.tool_call_result(tc_id, json.dumps(data, ensure_ascii=False)))
            return {"events": events, "data": data}
        return {"events": events, "data": None}

    # 构建参数映射
    param_mapping = _build_param_mapping(db, action.id)

    cli = ConnectorClient({
        "base_url": connector.base_url,
        "auth_type": connector.auth_type,
        "auth_config": connector.auth_config,
        "timeout": connector.timeout,
        "mock_enabled": connector.mock_enabled,
    })

    try:
        result = cli.call_action(
            action_config={
                "http_method": action.http_method,
                "api_path": action.api_path,
                "request_template": action.request_template,
                "response_mapping": action.response_mapping,
            },
            params=params,
            mock_response=action.mock_response,
            param_mapping=param_mapping,
        )
        # 应用输出参数的 value_type 聚合处理(count/sum)
        result = _apply_output_aggregation(db, action.id, result)
        events.append(agui.tool_call_result(
            tc_id, json.dumps(result, ensure_ascii=False, default=str)
        ))
        if evidence:
            # 构建响应摘要(避免日志过大)
            data_preview = result.get("data")
            if isinstance(data_preview, dict):
                inner = data_preview.get("data", data_preview)
                items = None
                if isinstance(inner, dict):
                    items = inner.get("items")
                elif isinstance(inner, list):
                    items = inner
                if isinstance(items, list):
                    data_preview = f"[{len(items)} items]"
            req_detail = {
                "method": action.http_method,
                "url": f"{connector.base_url.rstrip('/')}/{action.api_path.lstrip('/')}",
                "params": params,
                "param_mapping": param_mapping,
                "curl": result.get("curl", ""),
            }
            if action.http_method in ("POST", "PUT", "PATCH"):
                if action.request_template:
                    req_detail["body"] = action.request_template
                else:
                    req_detail["body"] = params
            evidence.add_step(f"tool_{tool_name}", {
                "source": result.get("source", "api"),
                "status_code": result.get("status_code"),
                "response_time_ms": result.get("response_time_ms"),
                "request": req_detail,
                "response_preview": str(data_preview)[:500],
                "aggregated": result.get("aggregated"),
            }, int((time.time() - t0) * 1000))
        return {"events": events, "data": result, "response_description": action.response_description or ""}
    except Exception as exc:
        if evidence:
            curl_cmd = getattr(exc, 'curl', '')
            error_detail = {
                "error": str(exc),
                "traceback": traceback.format_exc(),
            }
            if curl_cmd:
                error_detail["curl"] = curl_cmd
            else:
                # 尝试构建等效请求信息
                error_detail["request"] = {
                    "method": action.http_method if action else "?",
                    "url": f"{connector.base_url.rstrip('/')}/{action.api_path.lstrip('/')}" if connector and action else "?",
                    "params": params,
                }
            evidence.add_error(f"tool_{tool_name}", str(exc), error_detail)
        return {"events": events, "data": None}


async def _stream_llm_reply(
    llm_config: LLMConfig, message: str, skill: Skill, data: dict,
    response_description: str = None,
) -> AsyncGenerator[str, None]:
    """用 LLM 流式生成回答"""
    import httpx

    prompt = skill.response_prompt or "请根据以下数据，用友好的中文回答用户的问题。"
    if response_description:
        prompt += f"\n\n以下是数据字段说明，请据此将编码/数字转为可读的业务名称：\n{response_description}"
    data_str = json.dumps(data, ensure_ascii=False, indent=2)

    url = llm_config.api_url.rstrip("/")
    if not url.endswith("/chat/completions"):
        url = url + "/chat/completions"

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {llm_config.api_key}",
    }
    max_tokens = 512
    if hasattr(skill, 'max_response_tokens') and skill.max_response_tokens and skill.max_response_tokens > 0:
        max_tokens = skill.max_response_tokens

    payload = {
        "model": llm_config.model_name,
        "messages": [
            {"role": "system", "content": prompt},
            {"role": "user", "content": f"用户问题：{message}\n\n数据：{data_str}"},
        ],
        "temperature": 0.7,
        "max_tokens": max_tokens,
        "stream": True,
    }

    mid = agui.new_id()
    yield agui.text_message_start(mid)

    full_text = ""
    try:
        async with httpx.AsyncClient(timeout=60) as http_client:
            async with http_client.stream("POST", url, headers=headers, json=payload) as resp:
                async for line in resp.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    raw = line[6:].strip()
                    if raw == "[DONE]":
                        break
                    try:
                        chunk = json.loads(raw)
                        delta = chunk.get("choices", [{}])[0].get("delta", {}).get("content")
                        if delta:
                            full_text += delta
                            yield agui.text_message_content(mid, delta)
                    except (json.JSONDecodeError, IndexError, KeyError):
                        continue
    except Exception:
        if not full_text:
            fallback = _format_data_as_text(data)
            yield agui.text_message_content(mid, fallback)

    yield agui.text_message_end(mid)


def _render_template(template: str, data: dict, entities: dict) -> str:
    """模板渲染 — 委托给 pipeline.render_template"""
    return pipeline.render_template(template, data, entities)


def _format_data_as_text(data: dict) -> str:
    """文本格式化 — 委托给 pipeline.format_data_as_text"""
    return pipeline.format_data_as_text(data)


def _get_llm_config(db: Session, tenant_id: int, usage: str) -> Optional[LLMConfig]:
    """LLM配置查询 — 委托给 pipeline.get_llm_config"""
    return pipeline.get_llm_config(db, tenant_id, usage)


# ── 卡片事件构建 ──

# 技能编码 → 卡片类型映射
_SKILL_CARD_MAP = {
    "QUERY_COMPLAINT": "complaint",
    "SUBMIT_COMPLAINT": "complaint",
    "QUERY_STAFF": "staff",
    "CONTACT_PERSON": "staff",
}

# 技能编码 → 快捷操作
_SKILL_QUICK_ACTIONS = {
    "QUERY_PROGRESS": [
        {"icon": "📋", "text": "查看详细节点", "action": "查看详细节点"},
        {"icon": "👤", "text": "联系负责人", "action": "联系负责人"},
    ],
    "QUERY_COMPLAINT": [
        {"icon": "📄", "text": "查看服务报告", "action": "查看服务报告"},
        {"icon": "💬", "text": "继续反馈", "action": "继续反馈"},
    ],
    "QUERY_STAFF": [
        {"icon": "📞", "text": "联系负责人", "action": "联系负责人", "primary": True},
    ],
    "CONTACT_PERSON": [
        {"icon": "📞", "text": "拨打电话", "action": "拨打电话", "primary": True},
    ],
    "QUERY_SERVICE": [
        {"icon": "📝", "text": "提交投诉", "action": "我要反馈一个问题"},
        {"icon": "👤", "text": "联系工程师", "action": "联系负责人"},
    ],
    "SUBMIT_COMPLAINT": [
        {"icon": "📋", "text": "查看投诉进度", "action": "查看投诉进度"},
    ],
}


def _build_card_event(skill: Skill, query_results: dict, entities: dict) -> Optional[dict]:
    """根据技能类型和查询结果构建卡片事件数据"""
    card_type = _SKILL_CARD_MAP.get(skill.skill_code)
    if not card_type:
        return None

    # 提取第一个工具的结果数据
    first_result = None
    for _key, val in query_results.items():
        if isinstance(val, dict):
            first_result = val.get("data", val)
            break

    if card_type == "complaint":
        return {
            "card_type": "complaint",
            "data": first_result,
            "entities": entities,
        }
    elif card_type == "staff":
        return {
            "card_type": "staff",
            "data": first_result,
            "entities": entities,
        }
    return None


def _build_quick_actions(skill: Skill) -> list:
    """获取技能对应的快捷操作列表"""
    return _SKILL_QUICK_ACTIONS.get(skill.skill_code, [])


def _build_confirm_fields(db: Session, skill: Skill, entities: dict) -> list:
    """构建确认卡片的字段列表"""
    fields = []
    entity_defs = _get_entity_definitions(db, skill)
    for d in entity_defs:
        name = d["name"]
        if name in entities:
            fields.append({
                "label": d.get("title") or name,
                "value": str(entities[name]),
            })
    return fields
