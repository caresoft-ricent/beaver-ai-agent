"""管理后台 — 日志查询API（证据链 + 错误日志 + 操作日志）"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import Optional

from app.database import get_db
from app.models.chat import ActionLog, ChatMessage, ChatSession
from app.schemas.common import ResponseBase

router = APIRouter()


@router.get("/action-logs")
def list_action_logs(
    tenant_id: int = Query(1),
    session_id: Optional[str] = Query(None),
    action_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """查询操作日志（证据链）— 支持按会话、类型、状态筛选"""
    query = db.query(ActionLog).filter(ActionLog.tenant_id == tenant_id)
    if session_id:
        query = query.filter(ActionLog.session_id == session_id)
    if action_type:
        query = query.filter(ActionLog.action_type == action_type)
    if status:
        query = query.filter(ActionLog.status == status)

    total = query.count()
    items = (
        query.order_by(desc(ActionLog.created_at))
        .offset((page - 1) * size).limit(size).all()
    )

    return ResponseBase(data={
        "items": [
            {
                "id": log.id,
                "session_id": log.session_id,
                "tenant_id": log.tenant_id,
                "customer_id": log.customer_id,
                "action_type": log.action_type,
                "action_params": log.action_params,
                "status": log.status,
                "result": log.result,
                "error_message": log.error_message,
                "created_at": log.created_at.isoformat() if log.created_at else None,
            }
            for log in items
        ],
        "total": total,
    })


@router.get("/action-logs/{log_id}")
def get_action_log_detail(log_id: int, db: Session = Depends(get_db)):
    """查看单条日志详情（含完整证据链）"""
    log = db.query(ActionLog).filter(ActionLog.id == log_id).first()
    if not log:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="日志不存在")
    return ResponseBase(data={
        "id": log.id,
        "session_id": log.session_id,
        "tenant_id": log.tenant_id,
        "customer_id": log.customer_id,
        "action_type": log.action_type,
        "action_params": log.action_params,
        "status": log.status,
        "result": log.result,
        "error_message": log.error_message,
        "created_at": log.created_at.isoformat() if log.created_at else None,
        "executed_at": log.executed_at.isoformat() if log.executed_at else None,
    })


@router.get("/message-logs")
def list_message_logs(
    session_id: Optional[str] = Query(None),
    intent: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """查询消息日志 — 查看对话记录及处理详情"""
    query = db.query(ChatMessage)
    if session_id:
        query = query.filter(ChatMessage.session_id == session_id)
    if intent:
        query = query.filter(ChatMessage.intent == intent)

    total = query.count()
    items = (
        query.order_by(desc(ChatMessage.created_at))
        .offset((page - 1) * size).limit(size).all()
    )

    return ResponseBase(data={
        "items": [
            {
                "id": m.id,
                "session_id": m.session_id,
                "role": m.role,
                "content": m.content[:200] if m.content else "",
                "intent": m.intent,
                "entities": m.entities,
                "evidence_chain": m.evidence_chain,
                "processing_time_ms": m.processing_time_ms,
                "created_at": m.created_at.isoformat() if m.created_at else None,
            }
            for m in items
        ],
        "total": total,
    })


@router.get("/error-logs")
def list_error_logs(
    tenant_id: int = Query(1),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """查询错误日志 — 只返回 status=error 的操作日志"""
    query = (
        db.query(ActionLog)
        .filter(ActionLog.tenant_id == tenant_id, ActionLog.status.in_(["error", "failed"]))
    )
    total = query.count()
    items = (
        query.order_by(desc(ActionLog.created_at))
        .offset((page - 1) * size).limit(size).all()
    )

    return ResponseBase(data={
        "items": [
            {
                "id": log.id,
                "session_id": log.session_id,
                "customer_id": log.customer_id,
                "action_type": log.action_type,
                "error_message": log.error_message,
                "result": log.result,
                "created_at": log.created_at.isoformat() if log.created_at else None,
            }
            for log in items
        ],
        "total": total,
    })
