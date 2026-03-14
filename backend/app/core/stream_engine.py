"""流式对话引擎 — 基于AG-UI协议输出SSE事件流

将 DialogEngine 的同步处理流程拆分为异步事件流:
  RUN_STARTED → STEP(intent) → TOOL_CALL → TEXT_MESSAGE(streaming) → RUN_FINISHED
"""
import json
import time
import re
from typing import AsyncGenerator, Optional
from sqlalchemy.orm import Session

from app.models.config import LLMConfig, Connector
from app.models.ontology import Entity
from app.models.action import Action
from app.models.intent import Skill, SkillTool
from app.clients.llm_client import call_llm, call_llm_for_intent
from app.clients.connector_client import ConnectorClient
from app.core import agui


async def stream_dialog(
    db: Session,
    tenant_id: int,
    customer_id: str,
    session_id: str,
    message: str,
    thread_id: str,
    run_id: str,
) -> AsyncGenerator[str, None]:
    """主入口 — 流式返回 AG-UI SSE 事件"""

    yield agui.run_started(thread_id, run_id)

    # ── Step 1: 加载技能 ──
    skills = (
        db.query(Skill)
        .filter(Skill.tenant_id == tenant_id, Skill.status == "published")
        .order_by(Skill.sort_order)
        .all()
    )

    if not skills:
        async for evt in _stream_text(
            "系统正在配置中，暂时无法回答您的问题。请稍后再试。"
        ):
            yield evt
        yield agui.run_finished(thread_id, run_id)
        return

    # ── Step 2: 意图识别 ──
    yield agui.step_started("intent_recognition")

    matched_skill, confidence, entities = _recognize_intent(
        db, tenant_id, message, skills
    )

    if not matched_skill:
        yield agui.step_finished("intent_recognition")
        async for evt in _stream_text(
            "抱歉，我暂时无法理解您的问题。您可以试试：查看产线进度、查询现场人员、提交投诉等。"
        ):
            yield evt
        yield agui.run_finished(thread_id, run_id)
        return

    yield agui.custom_event("intent", {
        "code": matched_skill.skill_code,
        "name": matched_skill.skill_name,
        "confidence": confidence,
    })
    yield agui.step_finished("intent_recognition")

    # ── Step 3: 加载工具链 ──
    tools = (
        db.query(SkillTool)
        .filter(SkillTool.skill_id == matched_skill.id)
        .order_by(SkillTool.order_no)
        .all()
    )

    # 无工具链 → 直接返回模板
    if not tools:
        reply = matched_skill.response_template or "您好！请问有什么可以帮助您的？"
        async for evt in _stream_text(reply):
            yield evt
        yield agui.run_finished(thread_id, run_id)
        return

    # ── Step 4: 执行工具链（带 TOOL_CALL 事件）──
    yield agui.step_started("tool_execution")
    msg_id = agui.new_id()

    query_results = {}
    for tool in tools:
        tool_result = _execute_tool_with_events(db, tool, entities, customer_id)
        for evt in tool_result["events"]:
            yield evt
        if tool_result["data"]:
            query_results[f"tool_{tool.order_no}"] = tool_result["data"]

    yield agui.step_finished("tool_execution")

    # ── Step 5: 生成回答（流式文本）──
    yield agui.step_started("reply_generation")

    if matched_skill.response_template and query_results:
        reply = _render_template(matched_skill.response_template, query_results, entities)
        async for evt in _stream_text(reply):
            yield evt
    elif query_results:
        # 尝试 LLM 流式生成
        llm_config = _get_llm_config(db, tenant_id, "response")
        if llm_config:
            async for evt in _stream_llm_reply(llm_config, message, matched_skill, query_results):
                yield evt
        else:
            reply = _format_data_as_text(query_results)
            async for evt in _stream_text(reply):
                yield evt
    else:
        async for evt in _stream_text("查询到的信息为空，请确认您的问题或稍后再试。"):
            yield evt

    yield agui.step_finished("reply_generation")

    # 附带结构化数据
    if query_results:
        yield agui.custom_event("structured_data", query_results)

    yield agui.run_finished(thread_id, run_id)


# ── 辅助函数 ──


async def _stream_text(text: str):
    """将整段文本拆分为流式 TEXT_MESSAGE 事件"""
    mid = agui.new_id()
    yield agui.text_message_start(mid)
    # 按标点分段流式输出
    chunks = re.split(r'(?<=[。！？，；、\n])', text)
    for chunk in chunks:
        if chunk:
            yield agui.text_message_content(mid, chunk)
    yield agui.text_message_end(mid)


def _recognize_intent(db: Session, tenant_id: int, message: str, skills: list[Skill]):
    """意图识别（规则优先,LLM兜底）— 同步"""
    candidates = []
    for skill in skills:
        score = 0
        hit_count = 0
        entities = {}

        keywords = skill.match_keywords or []
        for kw in keywords:
            if kw in message:
                hit_count += 1
        if hit_count > 0:
            score = 0.7 + min(hit_count * 0.1, 0.28)

        patterns = skill.match_patterns or []
        for pattern in patterns:
            match = re.search(pattern, message)
            if match:
                score = max(score, 0.9)
                entities.update(match.groupdict())

        if score > 0:
            candidates.append((skill, score, entities))

    if candidates:
        candidates.sort(key=lambda x: x[1], reverse=True)
        return candidates[0]

    # LLM 兜底
    llm_config = _get_llm_config(db, tenant_id, "intent")
    if llm_config:
        available_intents = [
            {"code": s.skill_code, "description": s.skill_description or s.skill_name}
            for s in skills
        ]
        try:
            llm_result = call_llm_for_intent(
                provider=llm_config.provider,
                model=llm_config.model_name,
                api_url=llm_config.api_url,
                api_key=llm_config.api_key,
                user_message=message,
                available_intents=available_intents,
            )
            intent_code = llm_result.get("intent")
            confidence = llm_result.get("confidence", 0)
            entities = llm_result.get("entities", {})
            if intent_code and confidence > 0.6:
                for skill in skills:
                    if skill.skill_code == intent_code:
                        return skill, confidence, entities
        except Exception:
            pass

    return None, 0, {}


def _execute_tool_with_events(
    db: Session, tool: SkillTool, entities: dict, customer_id: str
) -> dict:
    """执行单个工具, 返回 { events: [...], data: ... }"""
    events = []
    tc_id = agui.new_id()

    # 优先使用 api_config 模式（殷明方案: 接口调用直接包装）
    api_config = tool.config.get("api_config") if tool.config else None

    if api_config and tool.tools_mode == "api":
        tool_name = api_config.get("name", f"api_tool_{tool.order_no}")
        events.append(agui.tool_call_start(tc_id, tool_name))

        params = {**entities, "customer_id": customer_id}
        events.append(agui.tool_call_args(tc_id, json.dumps(params, ensure_ascii=False)))
        events.append(agui.tool_call_end(tc_id))

        # 获取连接器
        connector_id = api_config.get("connector_id")
        connector = db.query(Connector).filter(Connector.id == connector_id).first() if connector_id else None

        if connector:
            client = ConnectorClient({
                "base_url": connector.base_url,
                "auth_type": connector.auth_type,
                "auth_config": connector.auth_config,
                "timeout": connector.timeout,
                "mock_enabled": connector.mock_enabled,
            })
            try:
                result = client.call_action(
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
                return {"events": events, "data": result}
            except Exception:
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

    # 回退: 原有 entity+action 方式
    if not tool.entity_id:
        return {"events": [], "data": None}

    entity = db.query(Entity).filter(Entity.id == tool.entity_id).first()
    if not entity:
        return {"events": [], "data": None}

    if tool.action_id:
        action = db.query(Action).filter(Action.id == tool.action_id).first()
    else:
        action = db.query(Action).filter(Action.entity_id == entity.id).first()
    if not action:
        return {"events": [], "data": None}

    tool_name = f"{entity.entity_code}.{action.action_code}"
    events.append(agui.tool_call_start(tc_id, tool_name))

    params = {**entities, "customer_id": customer_id}
    events.append(agui.tool_call_args(tc_id, json.dumps(params, ensure_ascii=False)))
    events.append(agui.tool_call_end(tc_id))

    connector = None
    if entity.connector_id:
        connector = db.query(Connector).filter(Connector.id == entity.connector_id).first()

    if not connector:
        if action.mock_response:
            data = {"data": action.mock_response, "source": "mock"}
            events.append(agui.tool_call_result(tc_id, json.dumps(data, ensure_ascii=False)))
            return {"events": events, "data": data}
        return {"events": events, "data": None}

    client = ConnectorClient({
        "base_url": connector.base_url,
        "auth_type": connector.auth_type,
        "auth_config": connector.auth_config,
        "timeout": connector.timeout,
        "mock_enabled": connector.mock_enabled,
    })

    try:
        result = client.call_action(
            action_config={
                "http_method": action.http_method,
                "api_path": action.api_path,
                "request_template": action.request_template,
                "response_mapping": action.response_mapping,
            },
            params=params,
            mock_response=action.mock_response,
        )
        events.append(agui.tool_call_result(
            tc_id, json.dumps(result, ensure_ascii=False, default=str)
        ))
        return {"events": events, "data": result}
    except Exception:
        return {"events": events, "data": None}


async def _stream_llm_reply(
    llm_config: LLMConfig, message: str, skill: Skill, data: dict
) -> AsyncGenerator[str, None]:
    """尝试用 LLM 流式生成回答"""
    import httpx

    prompt = skill.response_prompt or "请根据以下数据，用友好的中文回答用户的问题。"
    data_str = json.dumps(data, ensure_ascii=False, indent=2)

    url = llm_config.api_url.rstrip("/")
    if not url.endswith("/chat/completions"):
        url = url + "/chat/completions"

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {llm_config.api_key}",
    }
    payload = {
        "model": llm_config.model_name,
        "messages": [
            {"role": "system", "content": prompt},
            {"role": "user", "content": f"用户问题：{message}\n\n数据：{data_str}"},
        ],
        "temperature": 0.7,
        "max_tokens": 512,
        "stream": True,
    }

    mid = agui.new_id()
    yield agui.text_message_start(mid)

    full_text = ""
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            async with client.stream("POST", url, headers=headers, json=payload) as resp:
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
    context = {**entities}
    for key, value in data.items():
        if isinstance(value, dict) and "data" in value:
            inner = value["data"]
            if isinstance(inner, dict):
                context.update(inner)
    try:
        return template.format(**context)
    except (KeyError, IndexError):
        return template


def _format_data_as_text(data: dict) -> str:
    lines = []
    for _key, value in data.items():
        if not isinstance(value, dict):
            continue
        source = value.get("source", "api")
        raw = value.get("data", {})
        items = None
        if isinstance(raw, dict):
            inner = raw.get("data", raw)
            if isinstance(inner, dict):
                items = inner.get("items", None)
        if isinstance(items, list):
            lines.append(f"为您查到 {len(items)} 条记录：\n")
            for i, item in enumerate(items, 1):
                parts = [f"{k}: {v}" for k, v in item.items()]
                lines.append(f"{i}. " + ", ".join(parts))
            if source == "mock":
                lines.append("\n（当前为演示数据）")
        else:
            lines.append(json.dumps(raw, ensure_ascii=False, indent=2))
    return "\n".join(lines) if lines else "查询完成，暂无更多信息。"


def _get_llm_config(db: Session, tenant_id: int, usage: str) -> Optional[LLMConfig]:
    config = (
        db.query(LLMConfig)
        .filter(LLMConfig.tenant_id == tenant_id, LLMConfig.usage == usage, LLMConfig.status == "active")
        .first()
    )
    if not config:
        config = (
            db.query(LLMConfig)
            .filter(LLMConfig.tenant_id == tenant_id, LLMConfig.usage == "general", LLMConfig.status == "active")
            .first()
        )
    return config
