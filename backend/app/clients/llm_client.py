"""LLM统一客户端 - 支持多家大模型API"""
import httpx
import json
from typing import Optional


def call_llm(
    provider: str,
    model: str,
    api_url: str,
    api_key: str,
    messages: list[dict],
    temperature: float = 0.7,
    max_tokens: int = 2048,
    system_prompt: Optional[str] = None,
) -> dict:
    """
    统一调用各家大模型API
    支持: doubao(豆包), glm(智谱), qwen(千问), minimax, lmstudio(本地), 及其他OpenAI兼容格式
    """
    if system_prompt:
        messages = [{"role": "system", "content": system_prompt}] + messages

    # 大多数国产大模型都兼容OpenAI格式
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }

    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }

    # 针对不同provider的URL和参数调整
    url = api_url.rstrip("/")
    if not url.endswith("/chat/completions"):
        url = url + "/chat/completions"

    with httpx.Client(timeout=60) as client:
        resp = client.post(url, headers=headers, json=payload)
        resp.raise_for_status()
        data = resp.json()

    # 解析响应(OpenAI兼容格式)
    choice = data.get("choices", [{}])[0]
    message = choice.get("message", {})
    usage = data.get("usage", {})

    return {
        "content": message.get("content", ""),
        "role": message.get("role", "assistant"),
        "tokens_used": usage.get("total_tokens", 0),
        "model": data.get("model", model),
        "finish_reason": choice.get("finish_reason", ""),
    }


def call_llm_for_intent(
    provider: str,
    model: str,
    api_url: str,
    api_key: str,
    user_message: str,
    available_intents: list[dict],
    context: Optional[dict] = None,
    custom_prompt: Optional[str] = None,
) -> dict:
    """专门用于意图识别的LLM调用"""
    intents_desc = "\n".join([
        f"- {i['code']}: {i['description']}" + (f"\n  提示: {i['intent_hint']}" if i.get('intent_hint') else "")
        for i in available_intents
    ])

    context_str = ""
    if context and context.get("current_line"):
        context_str = f"\n当前上下文：正在讨论产线 {context['current_line']}"

    if custom_prompt:
        system_prompt = custom_prompt.format(
            intents_desc=intents_desc,
            context_str=context_str,
        )
    else:
        system_prompt = f"""你是一个意图识别助手。请分析用户输入，返回JSON格式的意图识别结果。

可选意图：
{intents_desc}

{context_str}

返回格式（严格JSON）：{{"intent": "意图编码", "confidence": 0.95, "entities": {{}}}}
其中entities包含从用户输入中提取的实体信息。"""

    result = call_llm(
        provider=provider,
        model=model,
        api_url=api_url,
        api_key=api_key,
        messages=[{"role": "user", "content": user_message}],
        system_prompt=system_prompt,
        temperature=0.3,
        max_tokens=256,
    )

    # 解析JSON响应
    content = result["content"].strip()
    # 处理可能的markdown代码块包裹
    if content.startswith("```"):
        content = content.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        parsed = {"intent": "CHITCHAT", "confidence": 0.1, "entities": {}}

    return {**parsed, "tokens_used": result.get("tokens_used", 0)}


def call_llm_for_entities(
    provider: str,
    model: str,
    api_url: str,
    api_key: str,
    user_message: str,
    intent_code: str,
    known_entities: dict,
    entity_definitions: list[dict],
    context: Optional[dict] = None,
    custom_prompt: Optional[str] = None,
) -> dict:
    """LLM增强实体抽取 — 从用户输入中提取结构化参数

    entity_definitions: [{"name": "line_name", "title": "产线名称", "type": "string", "required": true, "llm_description": ...}, ...]
    返回: {"entities": {"line_name": "A线", ...}, "tokens_used": 123}
    """
    # 收集操作描述(去重)，为LLM提供操作语义上下文
    action_descs = list({e.get('action_description', '') for e in entity_definitions if e.get('action_description')})
    action_context = ""
    if action_descs:
        action_context = "\n操作说明：" + "；".join(action_descs)

    entities_desc = "\n".join([
        f"- {e['name']}({e.get('title', e['name'])}): 类型={e.get('type', 'string')}, "
        f"{'必填' if e.get('required') else '选填'}"
        f"{', 默认值=' + e['default_value'] if e.get('default_value') else ''}"
        f", {e.get('llm_description') or e.get('description', '')}"
        for e in entity_definitions
    ])

    context_str = ""
    if context:
        context_str = f"\n上下文已知信息：{json.dumps(context, ensure_ascii=False)}"

    known_str = ""
    if known_entities:
        known_str = f"\n已通过规则提取的实体：{json.dumps(known_entities, ensure_ascii=False)}"

    if custom_prompt:
        system_prompt = custom_prompt.format(
            intent_code=intent_code,
            entities_desc=entities_desc,
            known_str=known_str,
            context_str=context_str,
        )
    else:
        system_prompt = f"""你是一个实体抽取助手。请从用户输入中提取以下参数。

当前意图: {intent_code}{action_context}
需要提取的参数:
{entities_desc}
{known_str}{context_str}

规则:
1. 只提取用户明确提到或可推断的参数
2. 日期类参数统一转为 YYYY-MM-DD 格式
3. 如果参数无法从输入中确定，不要凭空猜测
4. 有默认值的参数如果用户未提及可不提取
5. 返回严格JSON格式: {{"entities": {{"param_name": "value", ...}}}}"""

    result = call_llm(
        provider=provider,
        model=model,
        api_url=api_url,
        api_key=api_key,
        messages=[{"role": "user", "content": user_message}],
        system_prompt=system_prompt,
        temperature=0.2,
        max_tokens=256,
    )

    content = result["content"].strip()
    if content.startswith("```"):
        content = content.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        parsed = {"entities": {}}

    return {"entities": parsed.get("entities", {}), "tokens_used": result.get("tokens_used", 0)}
