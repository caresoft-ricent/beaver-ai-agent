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
) -> dict:
    """专门用于意图识别的LLM调用"""
    intents_desc = "\n".join([
        f"- {i['code']}: {i['description']}"
        for i in available_intents
    ])

    context_str = ""
    if context and context.get("current_line"):
        context_str = f"\n当前上下文：正在讨论产线 {context['current_line']}"

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
