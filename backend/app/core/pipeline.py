"""核心处理管道 - 双引擎共享的纯逻辑函数

抽取自 stream_engine.py 和 engine.py 中的重复逻辑。
两个引擎只负责各自的输出适配（SSE 事件流 vs 同步返回）。

共享函数清单:
  - recognize_intent()    规则优先+LLM兜底意图识别
  - render_template()     模板渲染
  - format_data_as_text() 无LLM时文本格式化
  - get_llm_config()      LLM配置查询(带fallback)
  - build_param_mapping() ActionParameter参数名映射
"""
import re
import json
import logging
from typing import Optional
from sqlalchemy.orm import Session

from app.models.config import LLMConfig
from app.models.action import ActionParameter
from app.models.intent import Skill
from app.clients.llm_client import call_llm_for_intent

logger = logging.getLogger("beaver.engine")


# ─────────────────────────── 意图识别 ───────────────────────────

def recognize_intent(
    db: Session, tenant_id: int, message: str,
    skills: list, ctx: dict = None,
):
    """意图识别（规则优先, LLM兜底）

    返回: (skill, confidence, entities, detail)
    detail 包含匹配过程详情，用于全链路日志
    """
    candidates = []
    for skill in skills:
        score = 0
        hit_count = 0
        hit_keywords = []
        entities = {}

        keywords = skill.match_keywords or []
        for kw in keywords:
            if kw in message:
                hit_count += 1
                hit_keywords.append(kw)
        if hit_count > 0:
            score = 0.7 + min(hit_count * 0.1, 0.28)

        patterns = skill.match_patterns or []
        hit_patterns = []
        for pattern in patterns:
            try:
                match = re.search(pattern, message)
                if match:
                    score = max(score, 0.9)
                    entities.update(match.groupdict())
                    hit_patterns.append(pattern)
            except re.error:
                pass

        if score > 0:
            candidates.append((skill, score, entities, hit_keywords, hit_patterns))

    # 构建候选详情
    candidates_detail = [
        {"skill": c[0].skill_code, "score": c[1], "keywords": c[3], "patterns": c[4]}
        for c in candidates
    ]

    if candidates:
        candidates.sort(key=lambda x: x[1], reverse=True)
        best = candidates[0]
        return best[0], best[1], best[2], {
            "match_method": "rule",
            "candidates": candidates_detail,
        }

    # LLM 兜底
    llm_config = get_llm_config(db, tenant_id, "intent")
    if llm_config:
        available_intents = [
            {"code": s.skill_code, "description": s.skill_description or s.skill_name,
             "intent_hint": s.intent_prompt or ""}
            for s in skills
        ]
        llm_context = ctx.get("entities") if ctx else None
        if ctx and ctx.get("summary"):
            llm_context = {**(llm_context or {}), "_summary": ctx["summary"]}
        try:
            llm_result = call_llm_for_intent(
                provider=llm_config.provider,
                model=llm_config.model_name,
                api_url=llm_config.api_url,
                api_key=llm_config.api_key,
                user_message=message,
                available_intents=available_intents,
                context=llm_context,
            )
            intent_code = llm_result.get("intent")
            confidence = llm_result.get("confidence", 0)
            entities = llm_result.get("entities", {})
            llm_detail = {
                "match_method": "llm",
                "llm_intent": intent_code,
                "llm_confidence": confidence,
                "llm_entities": entities,
                "tokens_used": llm_result.get("tokens_used", 0),
                "candidates": candidates_detail,
            }
            if intent_code and confidence > 0.6:
                for skill in skills:
                    if skill.skill_code == intent_code:
                        return skill, confidence, entities, llm_detail
            return None, 0, {}, llm_detail
        except Exception as exc:
            return None, 0, {}, {
                "match_method": "llm_error",
                "error": str(exc),
                "candidates": candidates_detail,
            }

    return None, 0, {}, {"match_method": "none", "candidates": candidates_detail}


# ─────────────────────────── 模板与格式化 ───────────────────────────

def render_template(template: str, data: dict, entities: dict) -> str:
    """渲染回答模板"""
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


def format_data_as_text(data: dict) -> str:
    """无LLM时将结构化数据格式化为可读文本"""
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


# ─────────────────────────── LLM 配置 ───────────────────────────

def get_llm_config(db: Session, tenant_id: int, usage: str) -> Optional[LLMConfig]:
    """获取指定用途的LLM配置（带fallback到general）"""
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


# ─────────────────────────── 参数映射 ───────────────────────────

def build_param_mapping(db: Session, action_id: int) -> Optional[dict]:
    """从ActionParameter构建参数名映射 {api_param_name: source_property_name}"""
    action_params = (
        db.query(ActionParameter)
        .filter(ActionParameter.action_id == action_id, ActionParameter.is_input == True)
        .all()
    )
    mapping = {}
    for ap in action_params:
        if ap.source_property and ap.source_property != ap.name:
            mapping[ap.name] = ap.source_property
    return mapping if mapping else None
