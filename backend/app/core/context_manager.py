"""对话上下文管理器 — 跨轮次记忆、参数归一化、参数转换、槽位追踪

功能:
1. 会话上下文存取（entities / 历史意图 / 已填槽位）
2. 参数归一化（日期、枚举）
3. 参数转换（名称→ID）
4. 槽位校验 + 追问提示生成
"""
import re
import json
from datetime import datetime, timedelta
from typing import Optional
from sqlalchemy.orm import Session

from app.models.chat import ChatSession
from app.models.intent import Skill, SkillTool
from app.models.ontology import EntityProperty
from app.models.action import ActionParameter


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


def normalize_date(text: str) -> Optional[dict]:
    """
    将中文日期表达归一化为 date_start / date_end 区间。
    返回 {"date_start": "YYYY-MM-DD", "date_end": "YYYY-MM-DD"} 或 None。
    """
    phrases = _build_date_phrases()
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


def normalize_status(value: str, domain: str = "") -> str:
    """将中文状态映射为标准枚举值。domain 如 'order_status'。"""
    if domain and domain in _STATUS_MAP:
        mapped = _STATUS_MAP[domain].get(value)
        if mapped:
            return mapped
    # 尝试所有 domain
    for _d, mapping in _STATUS_MAP.items():
        if value in mapping:
            return mapping[value]
    return value


def normalize_entities(entities: dict, message: str) -> dict:
    """对抽取的实体做归一化：日期短语→区间，中文状态→标准值"""
    result = dict(entities)

    # 日期归一化
    if "date" in result or "日期" in message or any(
        re.search(p, message) for p, _ in _build_date_phrases()
    ):
        date_info = normalize_date(message)
        if date_info:
            result.update(date_info)

    # 状态归一化
    for key in list(result.keys()):
        if "status" in key or "状态" in key:
            result[key] = normalize_status(str(result[key]))

    return result


# ─────────────────────────── 3. 参数转换 ───────────────────────────

# 转换注册表：{ "entity_code.param_name" : callable(db, value) -> converted_value }
_CONVERTERS: dict[str, callable] = {}


def register_converter(entity_param_key: str, fn):
    """注册参数转换器。key 格式: 'production_line.line_name' """
    _CONVERTERS[entity_param_key] = fn


def convert_params(db: Session, entities: dict, skill: Skill = None) -> dict:
    """
    运行参数转换：将用户表达（如产线名称）转换为接口所需的值（如产线ID）。
    转换规则从 SkillTool.config.param_converters 或全局注册表中读取。
    """
    result = dict(entities)
    if skill and hasattr(skill, '_tool_converters'):
        for conv in skill._tool_converters:
            src = conv.get("source")
            target = conv.get("target")
            lookup_entity = conv.get("lookup_entity")
            lookup_field = conv.get("lookup_field", "name")
            target_field = conv.get("target_field", "id")
            if src and src in result and lookup_entity:
                converted = _lookup_convert(
                    db, lookup_entity, lookup_field, result[src], target_field
                )
                if converted is not None:
                    result[target or src] = converted

    # 全局转换器
    for key, fn in _CONVERTERS.items():
        parts = key.split(".")
        param_name = parts[-1] if len(parts) > 1 else parts[0]
        if param_name in result:
            try:
                result[param_name] = fn(db, result[param_name])
            except Exception:
                pass

    return result


def _lookup_convert(db: Session, entity_code: str, match_field: str,
                    match_value: str, return_field: str):
    """通过查表进行参数转换（如：产线名称 → 产线ID）"""
    from app.models.ontology import Entity
    entity = db.query(Entity).filter(Entity.entity_code == entity_code).first()
    if not entity:
        return None
    # 如果有连接器，可通过API查询；此处先用 action.mock_response 做静态查找
    from app.models.action import Action
    action = db.query(Action).filter(
        Action.entity_id == entity.id, Action.action_code == "list"
    ).first()
    if action and action.mock_response:
        items = action.mock_response.get("data", {}).get("items", [])
        if isinstance(items, list):
            for item in items:
                if str(item.get(match_field, "")).strip() == str(match_value).strip():
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
