"""对话上下文管理器 — 跨轮次记忆、参数归一化、参数转换、槽位追踪

功能:
1. 会话上下文存取（entities / 历史意图 / 已填槽位）
2. 参数归一化（日期、枚举） — 优先从 DB 加载规则
3. 参数转换（名称→ID）
4. 槽位校验 + 追问提示生成
"""
import re
import json
import logging
from datetime import datetime, timedelta
from typing import Optional
from sqlalchemy.orm import Session

from app.models.chat import ChatSession
from app.models.intent import Skill, SkillTool
from app.models.ontology import EntityProperty
from app.models.action import ActionParameter

logger = logging.getLogger(__name__)


# ─────────────────────────── 1. 上下文存取 ───────────────────────────

def load_context(db: Session, session_id: str) -> dict:
    """从 DB 加载会话上下文快照"""
    session = db.query(ChatSession).filter(ChatSession.session_id == session_id).first()
    if session and session.context_snapshot:
        return dict(session.context_snapshot)
    return {"entities": {}, "last_intent": None, "turn_count": 0, "history_intents": []}


def save_context(db: Session, session_id: str, ctx: dict):
    """将上下文快照写回 DB"""
    session = db.query(ChatSession).filter(ChatSession.session_id == session_id).first()
    if session:
        session.context_snapshot = ctx
        db.flush()


def merge_entities(old: dict, new: dict) -> dict:
    """合并新旧实体 — 新值覆盖旧值，但保留旧值中新轮次未提及的字段"""
    merged = {**old}
    for k, v in new.items():
        if v is not None and v != "":
            merged[k] = v
    return merged


# ─────────────────────────── 2. 参数归一化 ───────────────────────────

_DATE_PHRASES: list[tuple[str, callable]] = []


def _today():
    return datetime.now().date()


def _build_date_phrases():
    """构建中文日期短语 → 日期区间映射"""
    return [
        (r"今天|今日", lambda: (_today(), _today())),
        (r"昨天|昨日", lambda: (_today() - timedelta(days=1), _today() - timedelta(days=1))),
        (r"前天", lambda: (_today() - timedelta(days=2), _today() - timedelta(days=2))),
        (r"明天|明日", lambda: (_today() + timedelta(days=1), _today() + timedelta(days=1))),
        (r"本周|这周|这一周", lambda: (_today() - timedelta(days=_today().weekday()), _today())),
        (r"上周|上一周", lambda: (
            _today() - timedelta(days=_today().weekday() + 7),
            _today() - timedelta(days=_today().weekday() + 1),
        )),
        (r"本月|这个月|当月", lambda: (_today().replace(day=1), _today())),
        (r"上个月|上月", lambda: (
            (_today().replace(day=1) - timedelta(days=1)).replace(day=1),
            _today().replace(day=1) - timedelta(days=1),
        )),
        (r"最近[一1]周|近[一1]周|过去[一1]周", lambda: (_today() - timedelta(weeks=1), _today())),
        (r"最近[两2二]周|近[两2二]周", lambda: (_today() - timedelta(weeks=2), _today())),
        (r"最近[一1]个月|近[一1]个月|过去[一1]个月", lambda: (_today() - timedelta(days=30), _today())),
        (r"最近[两2二]个月|近[两2二]个月", lambda: (_today() - timedelta(days=60), _today())),
        (r"最近[三3]个月|近[三3]个月|过去[三3]个月", lambda: (_today() - timedelta(days=90), _today())),
        (r"最近半年|近半年", lambda: (_today() - timedelta(days=180), _today())),
        (r"最近[一1]年|近[一1]年|过去[一1]年", lambda: (_today() - timedelta(days=365), _today())),
        (r"今年", lambda: (_today().replace(month=1, day=1), _today())),
        (r"去年", lambda: (
            _today().replace(year=_today().year - 1, month=1, day=1),
            _today().replace(year=_today().year - 1, month=12, day=31),
        )),
    ]


# 通用数字日期模式
_DATE_ABS_PATTERNS = [
    (r"(\d{4})[年\-/](\d{1,2})[月\-/](\d{1,2})[日号]?", "%Y-%m-%d"),
    (r"(\d{1,2})[月\-/](\d{1,2})[日号]?", None),  # 需要补当前年
]

# 枚举状态归一化映射（可扩展）
_STATUS_MAP: dict[str, dict[str, str]] = {
    "order_status": {
        "未完成": "pending", "进行中": "in_progress", "已完成": "completed",
        "完成": "completed", "取消": "cancelled", "已取消": "cancelled",
        "待处理": "pending", "处理中": "in_progress",
    },
    "bill_status": {
        "未付": "unpaid", "未支付": "unpaid", "未付款": "unpaid",
        "已付": "paid", "已支付": "paid", "已付款": "paid",
        "逾期": "overdue", "已逾期": "overdue",
    },
    "ticket_status": {
        "待处理": "open", "处理中": "processing", "已解决": "resolved",
        "已关闭": "closed", "关闭": "closed",
    },
}


def normalize_date(text: str, db: Session = None) -> Optional[dict]:
    """
    将中文日期表达归一化为 date_start / date_end 区间。
    优先从 DB 加载规则，无 DB 或无规则时使用内置默认。
    返回 {"date_start": "YYYY-MM-DD", "date_end": "YYYY-MM-DD"} 或 None。
    """
    # 尝试从 DB 加载日期规则
    db_phrases = _load_db_date_phrases(db) if db else []
    phrases = db_phrases if db_phrases else _build_date_phrases()

    for pattern, fn in phrases:
        if re.search(pattern, text):
            start, end = fn()
            return {"date_start": str(start), "date_end": str(end)}

    # 尝试绝对日期
    m = re.search(r"(\d{4})[年\-/](\d{1,2})[月\-/](\d{1,2})[日号]?", text)
    if m:
        d = f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
        return {"date_start": d, "date_end": d}

    m2 = re.search(r"(\d{1,2})[月\-/](\d{1,2})[日号]?", text)
    if m2:
        y = _today().year
        d = f"{y}-{int(m2.group(1)):02d}-{int(m2.group(2)):02d}"
        return {"date_start": d, "date_end": d}

    return None


def normalize_status(value: str, domain: str = "", db: Session = None) -> str:
    """将中文状态映射为标准枚举值。优先从 DB 加载，无规则时用内置映射。"""
    # 尝试 DB 映射
    db_map = _load_db_status_map(db) if db else {}
    mapping = db_map if db_map else _STATUS_MAP

    if domain and domain in mapping:
        mapped = mapping[domain].get(value)
        if mapped:
            return mapped
    # 尝试所有 domain
    for _d, m in mapping.items():
        if value in m:
            return m[value]
    return value


def normalize_entities(entities: dict, message: str, db: Session = None) -> dict:
    """对抽取的实体做归一化：日期短语→区间，中文状态→标准值"""
    result = dict(entities)

    # 日期归一化
    if "date" in result or "日期" in message or any(
        re.search(p, message) for p, _ in _build_date_phrases()
    ):
        date_info = normalize_date(message, db=db)
        if date_info:
            result.update(date_info)

    # 状态归一化
    for key in list(result.keys()):
        if "status" in key or "状态" in key:
            result[key] = normalize_status(str(result[key]), db=db)

    return result


# ─────────── DB 规则加载 ───────────

def _load_db_date_phrases(db: Session) -> list[tuple[str, callable]]:
    """从 ai_normalization_rule 表加载日期短语规则"""
    try:
        from app.models.normalization import NormalizationRule
        rows = (
            db.query(NormalizationRule)
            .filter(NormalizationRule.category == "date_phrase", NormalizationRule.is_active == True)
            .order_by(NormalizationRule.sort_order)
            .all()
        )
        if not rows:
            return []
        result = []
        for r in rows:
            pattern = r.pattern
            code = r.rule_code
            result.append((pattern, _make_date_fn(code)))
        return result
    except Exception as e:
        logger.debug("加载DB日期规则失败, 使用内置默认: %s", e)
        return []


def _make_date_fn(code: str):
    """根据 rule_code 生成日期计算 lambda"""
    mapping = {
        "today": lambda: (_today(), _today()),
        "yesterday": lambda: (_today() - timedelta(days=1), _today() - timedelta(days=1)),
        "day_before": lambda: (_today() - timedelta(days=2), _today() - timedelta(days=2)),
        "tomorrow": lambda: (_today() + timedelta(days=1), _today() + timedelta(days=1)),
        "this_week": lambda: (_today() - timedelta(days=_today().weekday()), _today()),
        "last_week": lambda: (
            _today() - timedelta(days=_today().weekday() + 7),
            _today() - timedelta(days=_today().weekday() + 1),
        ),
        "this_month": lambda: (_today().replace(day=1), _today()),
        "last_month": lambda: (
            (_today().replace(day=1) - timedelta(days=1)).replace(day=1),
            _today().replace(day=1) - timedelta(days=1),
        ),
        "recent_1w": lambda: (_today() - timedelta(weeks=1), _today()),
        "recent_2w": lambda: (_today() - timedelta(weeks=2), _today()),
        "recent_1m": lambda: (_today() - timedelta(days=30), _today()),
        "recent_2m": lambda: (_today() - timedelta(days=60), _today()),
        "recent_3m": lambda: (_today() - timedelta(days=90), _today()),
        "recent_6m": lambda: (_today() - timedelta(days=180), _today()),
        "recent_1y": lambda: (_today() - timedelta(days=365), _today()),
        "this_year": lambda: (_today().replace(month=1, day=1), _today()),
        "last_year": lambda: (
            _today().replace(year=_today().year - 1, month=1, day=1),
            _today().replace(year=_today().year - 1, month=12, day=31),
        ),
    }
    return mapping.get(code, lambda: (_today(), _today()))


def _load_db_status_map(db: Session) -> dict[str, dict[str, str]]:
    """从 ai_normalization_rule 表加载状态映射"""
    try:
        from app.models.normalization import NormalizationRule
        rows = (
            db.query(NormalizationRule)
            .filter(NormalizationRule.category == "status_mapping", NormalizationRule.is_active == True)
            .order_by(NormalizationRule.sort_order)
            .all()
        )
        if not rows:
            return {}
        result: dict[str, dict[str, str]] = {}
        for r in rows:
            if r.domain and r.source_value and r.target_value:
                result.setdefault(r.domain, {})[r.source_value] = r.target_value
        return result
    except Exception as e:
        logger.debug("加载DB状态映射失败, 使用内置默认: %s", e)
        return {}


# ─────────────────────────── 3. 参数转换 ───────────────────────────


def convert_params(db: Session, entities: dict, skill: Skill = None) -> dict:
    """
    运行参数转换：将用户表达（如产线名称）转换为接口所需的值（如产线ID）。

    转换规则来源:
    1. EntityProperty.mapping_config  — 属性级别的映射配置
       格式: {
         "lookup_entity": "production_line",   # 查找哪个本体
         "lookup_action": "list",              # 调用哪个接口获取数据
         "match_field": "line_name",           # 返回数据中用于匹配的字段
         "return_field": "line_code",          # 匹配命中后取哪个字段作为转换值
         "target_param": "line_code",          # 写入哪个实体参数(默认=属性自身name)
         "strategy": "exact|fuzzy|semantic"    # 匹配策略
       }
    2. 通过 ConnectorClient 调用真实业务 API 获取候选数据
    3. 前者若无法精确匹配，使用模糊/语义匹配
    """
    result = dict(entities)
    if not skill:
        return result

    # 收集技能工具链涉及的所有 entity_id
    tools = (
        db.query(SkillTool)
        .filter(SkillTool.skill_id == skill.id)
        .order_by(SkillTool.order_no)
        .all()
    )
    entity_ids = {t.entity_id for t in tools if t.entity_id}
    if not entity_ids:
        return result

    # 加载所有有 mapping_config 的输入属性
    props = (
        db.query(EntityProperty)
        .filter(
            EntityProperty.entity_id.in_(entity_ids),
            EntityProperty.is_input == True,
            EntityProperty.mapping_config.isnot(None),
        )
        .all()
    )

    for prop in props:
        mapping = prop.mapping_config
        if not isinstance(mapping, dict):
            continue

        param_name = prop.name
        if param_name not in result:
            continue

        user_value = str(result[param_name]).strip()
        if not user_value:
            continue

        lookup_entity = mapping.get("lookup_entity")
        lookup_action = mapping.get("lookup_action", "list")
        match_field = mapping.get("match_field")
        return_field = mapping.get("return_field")
        target_param = mapping.get("target_param", param_name)
        strategy = mapping.get("strategy", "exact")

        if not all([lookup_entity, match_field, return_field]):
            continue

        # 调用业务 API 获取候选数据
        candidates = _fetch_lookup_data(db, lookup_entity, lookup_action)
        if not candidates:
            continue

        # 匹配
        converted = _match_candidate(
            user_value, candidates, match_field, return_field, strategy
        )
        if converted is not None:
            result[target_param] = converted

    return result


def _fetch_lookup_data(db: Session, entity_code: str, action_code: str) -> list[dict]:
    """通过 ConnectorClient 调用业务 API 获取候选数据列表"""
    from app.models.ontology import Entity
    from app.models.action import Action
    from app.models.config import Connector
    from app.clients.connector_client import ConnectorClient

    entity = db.query(Entity).filter(Entity.entity_code == entity_code).first()
    if not entity:
        return []

    action = db.query(Action).filter(
        Action.entity_id == entity.id, Action.action_code == action_code
    ).first()
    if not action:
        return []

    # 优先使用真实连接器
    connector = None
    if entity.connector_id:
        connector = db.query(Connector).filter(Connector.id == entity.connector_id).first()

    if connector:
        cli = ConnectorClient({
            "base_url": connector.base_url,
            "auth_type": connector.auth_type,
            "auth_config": connector.auth_config,
            "timeout": connector.timeout,
            "mock_enabled": connector.mock_enabled,
        })
        try:
            resp = cli.call_action(
                action_config={
                    "http_method": action.http_method,
                    "api_path": action.api_path,
                    "request_template": action.request_template,
                    "response_mapping": action.response_mapping,
                },
                params={},
                mock_response=action.mock_response,
            )
            items = resp.get("data", {}).get("items", []) if isinstance(resp.get("data"), dict) else []
            return items if isinstance(items, list) else []
        except Exception:
            pass

    # 回退到 mock_response
    if action.mock_response:
        items = action.mock_response.get("data", {}).get("items", [])
        return items if isinstance(items, list) else []

    return []


def _match_candidate(
    user_value: str,
    candidates: list[dict],
    match_field: str,
    return_field: str,
    strategy: str = "exact",
):
    """在候选列表中匹配用户输入值，返回匹配到的目标字段值"""
    user_lower = user_value.lower().strip()

    # 1. 精确匹配
    for item in candidates:
        candidate_val = str(item.get(match_field, "")).strip()
        if candidate_val == user_value:
            return item.get(return_field)

    if strategy == "exact":
        return None

    # 2. 模糊匹配: 大小写无关 + 包含关系
    best_match = None
    best_score = 0
    for item in candidates:
        candidate_val = str(item.get(match_field, "")).strip()
        candidate_lower = candidate_val.lower()

        if candidate_lower == user_lower:
            return item.get(return_field)

        # 包含关系匹配
        if user_lower in candidate_lower or candidate_lower in user_lower:
            score = len(min(user_lower, candidate_lower, key=len)) / len(max(user_lower, candidate_lower, key=len))
            if score > best_score:
                best_score = score
                best_match = item

    if strategy == "fuzzy" and best_match and best_score > 0.5:
        return best_match.get(return_field)

    # 3. semantic 策略: 基于字符串相似度做进一步匹配
    if strategy == "semantic":
        if best_match and best_score > 0.3:
            return best_match.get(return_field)

        # 尝试数字/拼音等变体匹配
        for item in candidates:
            candidate_val = str(item.get(match_field, "")).strip()
            # 别名检查: 如果候选项有 aliases 字段
            aliases = item.get("aliases", [])
            if isinstance(aliases, list):
                for alias in aliases:
                    if str(alias).strip().lower() == user_lower:
                        return item.get(return_field)

    return None


# ─────────────────────────── 4. 槽位校验 + 追问 ───────────────────────────

class SlotResult:
    """槽位检查结果"""
    def __init__(self):
        self.complete = True
        self.missing_required: list[dict] = []  # [{"name": ..., "title": ..., "description": ...}]
        self.invalid_params: list[dict] = []    # [{"name": ..., "reason": ...}]
        self.clarification_text: str = ""       # 追问提示
        self.confirmed = False                  # 是否需要确认


def check_slots(db: Session, skill: Skill, entities: dict) -> SlotResult:
    """
    根据技能关联的工具参数定义，检查实体是否齐全。
    返回 SlotResult 包括缺失必填参数和追问文本。
    """
    result = SlotResult()

    tools = (
        db.query(SkillTool)
        .filter(SkillTool.skill_id == skill.id)
        .order_by(SkillTool.order_no)
        .all()
    )

    missing_params = []
    optional_missing = []

    for tool in tools:
        # api_config 模式的参数定义
        api_config = tool.config.get("api_config") if tool.config else None
        if api_config:
            required_params = api_config.get("required_params", [])
            optional_params = api_config.get("optional_params", [])
            for p in required_params:
                pname = p if isinstance(p, str) else p.get("name", "")
                ptitle = p if isinstance(p, str) else p.get("title", pname)
                pdesc = "" if isinstance(p, str) else p.get("description", "")
                if pname and pname not in entities:
                    missing_params.append({"name": pname, "title": ptitle, "description": pdesc})
            for p in optional_params:
                pname = p if isinstance(p, str) else p.get("name", "")
                ptitle = p if isinstance(p, str) else p.get("title", pname)
                if pname and pname not in entities:
                    optional_missing.append({"name": pname, "title": ptitle})
            continue

        # entity+action 模式
        if not tool.action_id:
            continue
        action_params = (
            db.query(ActionParameter)
            .filter(ActionParameter.action_id == tool.action_id, ActionParameter.direction == "input")
            .all()
        )
        for ap in action_params:
            if ap.is_required and ap.name not in entities:
                missing_params.append({
                    "name": ap.name,
                    "title": ap.title or ap.name,
                    "description": ap.param_description or "",
                })
            elif not ap.is_required and ap.name not in entities:
                optional_missing.append({"name": ap.name, "title": ap.title or ap.name})

    if missing_params:
        result.complete = False
        result.missing_required = missing_params
        names = "、".join(p["title"] for p in missing_params)
        result.clarification_text = f"请补充以下信息：{names}"

    # 澄清配置
    if skill.clarification_config:
        confirm_msg = skill.clarification_config.get("confirm_message")
        if confirm_msg and result.complete:
            result.confirmed = False
            result.clarification_text = confirm_msg

    result.invalid_params = []
    return result


def build_clarification_reply(slot_result: SlotResult, optional_missing: list = None) -> str:
    """构建追问回复文本"""
    parts = []
    if slot_result.missing_required:
        names = "、".join(p["title"] for p in slot_result.missing_required)
        parts.append(f"为了更好地为您查询，请提供以下信息：\n{names}")
        for p in slot_result.missing_required:
            if p.get("description"):
                parts.append(f"  · {p['title']}：{p['description']}")
    if slot_result.clarification_text and not slot_result.missing_required:
        parts.append(slot_result.clarification_text)
    return "\n".join(parts) if parts else ""


# ─────────────────────────── 5. 上下文摘要 ───────────────────────────

def should_summarize(ctx: dict, threshold: int = 20) -> bool:
    """判断是否需要触发历史摘要"""
    turn_count = ctx.get("turn_count", 0)
    last_summary_turn = ctx.get("last_summary_turn", 0)
    return turn_count - last_summary_turn >= threshold


def summarize_context(
    db: Session,
    session_id: str,
    ctx: dict,
    llm_caller=None,
) -> str:
    """对多轮上下文进行摘要压缩，减少Token消耗

    llm_caller: callable(messages, system_prompt) -> str (可选，用LLM生成摘要)
    返回摘要文本。
    """
    from app.models.chat import ChatMessage

    messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at.desc())
        .limit(40)
        .all()
    )
    messages.reverse()

    if len(messages) < 6:
        return ""

    # 构建对话文本
    dialog_text = "\n".join([
        f"{'用户' if m.role == 'user' else 'AI'}: {m.content[:200]}"
        for m in messages if m.role in ("user", "assistant") and m.content
    ])

    if llm_caller:
        try:
            summary = llm_caller(
                messages=[{"role": "user", "content": f"请用2-3句话概括以下对话的核心议题和已确认信息：\n\n{dialog_text}"}],
                system_prompt="你是对话摘要助手，请简洁概括对话核心内容，保留关键实体和意图信息。",
            )
            ctx["summary"] = summary
            ctx["last_summary_turn"] = ctx.get("turn_count", 0)
            return summary
        except Exception:
            pass

    # 无LLM时的简要摘要
    intents = ctx.get("history_intents", [])
    entities = ctx.get("entities", {})
    summary_parts = []
    if intents:
        summary_parts.append(f"用户历史意图: {', '.join(set(intents[-5:]))}")
    if entities:
        summary_parts.append(f"已知参数: {json.dumps(entities, ensure_ascii=False)}")
    summary = "; ".join(summary_parts)
    ctx["summary"] = summary
    ctx["last_summary_turn"] = ctx.get("turn_count", 0)
    return summary
