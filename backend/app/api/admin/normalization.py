"""归一化规则管理 API"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.database import get_db
from app.models.normalization import NormalizationRule
from app.schemas.common import ResponseBase

router = APIRouter()


class RuleCreate(BaseModel):
    tenant_id: int = 0
    category: str
    rule_code: str
    rule_name: str
    pattern: Optional[str] = None
    domain: Optional[str] = None
    source_value: Optional[str] = None
    target_value: Optional[str] = None
    config: Optional[dict] = None
    sort_order: int = 0
    is_active: bool = True
    description: Optional[str] = None


class RuleUpdate(BaseModel):
    rule_name: Optional[str] = None
    pattern: Optional[str] = None
    domain: Optional[str] = None
    source_value: Optional[str] = None
    target_value: Optional[str] = None
    config: Optional[dict] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None
    description: Optional[str] = None


@router.get("")
def list_rules(
    category: Optional[str] = None,
    domain: Optional[str] = None,
    tenant_id: int = 0,
    is_active: Optional[bool] = None,
    page: int = 1,
    size: int = 50,
    db: Session = Depends(get_db),
):
    """查询归一化规则列表"""
    q = db.query(NormalizationRule).filter(NormalizationRule.tenant_id == tenant_id)
    if category:
        q = q.filter(NormalizationRule.category == category)
    if domain:
        q = q.filter(NormalizationRule.domain == domain)
    if is_active is not None:
        q = q.filter(NormalizationRule.is_active == is_active)
    total = q.count()
    items = q.order_by(NormalizationRule.category, NormalizationRule.sort_order).offset((page - 1) * size).limit(size).all()
    return ResponseBase(data={
        "items": [_to_dict(r) for r in items],
        "total": total,
        "page": page,
        "size": size,
    })


@router.get("/categories")
def list_categories(db: Session = Depends(get_db)):
    """获取所有规则类别"""
    return ResponseBase(data=[
        {"value": "date_phrase", "label": "日期短语归一化", "description": "中文日期表达 → 标准日期区间"},
        {"value": "status_mapping", "label": "状态枚举映射", "description": "中文状态 → 标准枚举值"},
        {"value": "param_converter", "label": "参数转换器", "description": "参数名称→ID等格式转换"},
    ])


@router.get("/{rule_id}")
def get_rule(rule_id: int, db: Session = Depends(get_db)):
    """获取单条规则"""
    rule = db.query(NormalizationRule).filter(NormalizationRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="规则不存在")
    return ResponseBase(data=_to_dict(rule))


@router.post("")
def create_rule(req: RuleCreate, db: Session = Depends(get_db)):
    """创建规则"""
    existing = db.query(NormalizationRule).filter(
        NormalizationRule.tenant_id == req.tenant_id,
        NormalizationRule.category == req.category,
        NormalizationRule.rule_code == req.rule_code,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"规则编码 {req.rule_code} 已存在")
    rule = NormalizationRule(**req.model_dump())
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return ResponseBase(data=_to_dict(rule), message="创建成功")


@router.put("/{rule_id}")
def update_rule(rule_id: int, req: RuleUpdate, db: Session = Depends(get_db)):
    """更新规则"""
    rule = db.query(NormalizationRule).filter(NormalizationRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="规则不存在")
    for field, value in req.model_dump(exclude_unset=True).items():
        setattr(rule, field, value)
    db.commit()
    db.refresh(rule)
    return ResponseBase(data=_to_dict(rule), message="更新成功")


@router.delete("/{rule_id}")
def delete_rule(rule_id: int, db: Session = Depends(get_db)):
    """删除规则"""
    rule = db.query(NormalizationRule).filter(NormalizationRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="规则不存在")
    db.delete(rule)
    db.commit()
    return ResponseBase(message="删除成功")


@router.post("/initialize")
def initialize_rules(tenant_id: int = 0, db: Session = Depends(get_db)):
    """初始化默认规则（将内置规则写入数据库）"""
    existing = db.query(NormalizationRule).filter(NormalizationRule.tenant_id == tenant_id).count()
    if existing > 0:
        return ResponseBase(message=f"已有 {existing} 条规则，跳过初始化。如需重新初始化请先清空。")

    rules = _get_default_rules(tenant_id)
    for r in rules:
        db.add(NormalizationRule(**r))
    db.commit()
    return ResponseBase(data={"count": len(rules)}, message=f"成功初始化 {len(rules)} 条规则")


def _to_dict(rule: NormalizationRule) -> dict:
    return {
        "id": rule.id,
        "tenant_id": rule.tenant_id,
        "category": rule.category,
        "rule_code": rule.rule_code,
        "rule_name": rule.rule_name,
        "pattern": rule.pattern,
        "domain": rule.domain,
        "source_value": rule.source_value,
        "target_value": rule.target_value,
        "config": rule.config,
        "sort_order": rule.sort_order,
        "is_active": rule.is_active,
        "description": rule.description,
        "created_at": rule.created_at.isoformat() if rule.created_at else None,
        "updated_at": rule.updated_at.isoformat() if rule.updated_at else None,
    }


def _get_default_rules(tenant_id: int) -> list[dict]:
    """内置默认规则"""
    rules = []
    order = 0

    # ── 日期短语 ──
    date_phrases = [
        ("today", "今天/今日", r"今天|今日", "当天"),
        ("yesterday", "昨天/昨日", r"昨天|昨日", "前一天"),
        ("day_before", "前天", r"前天", "前两天"),
        ("tomorrow", "明天/明日", r"明天|明日", "后一天"),
        ("this_week", "本周/这周", r"本周|这周|这一周", "当前周一到今天"),
        ("last_week", "上周/上一周", r"上周|上一周", "上周一到上周日"),
        ("this_month", "本月/这个月", r"本月|这个月|当月", "当月1日到今天"),
        ("last_month", "上个月/上月", r"上个月|上月", "上月1日到末日"),
        ("recent_1w", "最近一周", r"最近[一1]周|近[一1]周|过去[一1]周", "过去7天"),
        ("recent_2w", "最近两周", r"最近[两2二]周|近[两2二]周", "过去14天"),
        ("recent_1m", "最近一个月", r"最近[一1]个月|近[一1]个月|过去[一1]个月", "过去30天"),
        ("recent_2m", "最近两个月", r"最近[两2二]个月|近[两2二]个月", "过去60天"),
        ("recent_3m", "最近三个月", r"最近[三3]个月|近[三3]个月|过去[三3]个月", "过去90天"),
        ("recent_6m", "最近半年", r"最近半年|近半年", "过去180天"),
        ("recent_1y", "最近一年", r"最近[一1]年|近[一1]年|过去[一1]年", "过去365天"),
        ("this_year", "今年", r"今年", "今年1月1日到今天"),
        ("last_year", "去年", r"去年", "去年全年"),
    ]
    for code, name, pattern, desc in date_phrases:
        order += 1
        rules.append({
            "tenant_id": tenant_id, "category": "date_phrase",
            "rule_code": code, "rule_name": name, "pattern": pattern,
            "sort_order": order, "description": desc,
        })

    # ── 状态枚举映射 ──
    status_mappings = [
        # order_status
        ("order_pending", "待处理", "order_status", "未完成", "pending"),
        ("order_pending2", "待处理(待处理)", "order_status", "待处理", "pending"),
        ("order_in_progress", "进行中", "order_status", "进行中", "in_progress"),
        ("order_in_progress2", "处理中", "order_status", "处理中", "in_progress"),
        ("order_completed", "已完成", "order_status", "已完成", "completed"),
        ("order_completed2", "完成", "order_status", "完成", "completed"),
        ("order_cancelled", "已取消", "order_status", "已取消", "cancelled"),
        ("order_cancelled2", "取消", "order_status", "取消", "cancelled"),
        # bill_status
        ("bill_unpaid", "未支付", "bill_status", "未付", "unpaid"),
        ("bill_unpaid2", "未支付2", "bill_status", "未支付", "unpaid"),
        ("bill_unpaid3", "未付款", "bill_status", "未付款", "unpaid"),
        ("bill_paid", "已支付", "bill_status", "已付", "paid"),
        ("bill_paid2", "已支付2", "bill_status", "已支付", "paid"),
        ("bill_paid3", "已付款", "bill_status", "已付款", "paid"),
        ("bill_overdue", "逾期", "bill_status", "逾期", "overdue"),
        ("bill_overdue2", "已逾期", "bill_status", "已逾期", "overdue"),
        # ticket_status
        ("ticket_open", "待处理(工单)", "ticket_status", "待处理", "open"),
        ("ticket_processing", "处理中(工单)", "ticket_status", "处理中", "processing"),
        ("ticket_resolved", "已解决", "ticket_status", "已解决", "resolved"),
        ("ticket_closed", "已关闭", "ticket_status", "已关闭", "closed"),
        ("ticket_closed2", "关闭", "ticket_status", "关闭", "closed"),
    ]
    for code, name, domain, src, tgt in status_mappings:
        order += 1
        rules.append({
            "tenant_id": tenant_id, "category": "status_mapping",
            "rule_code": code, "rule_name": name, "domain": domain,
            "source_value": src, "target_value": tgt, "sort_order": order,
        })

    return rules
