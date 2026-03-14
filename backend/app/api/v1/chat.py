"""对话API - 客户侧使用"""
import uuid
import time
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.chat import ChatSession, ChatMessage
from app.schemas.chat import ChatRequest, ChatResponse, ActionRequest, ActionResponse
from app.schemas.common import ResponseBase
from app.core.engine import DialogEngine

router = APIRouter()


@router.post("/completions")
def chat_completions(req: ChatRequest, db: Session = Depends(get_db)):
    """对话主接口"""
    start_time = time.time()

    # 获取或创建会话
    if req.session_id:
        session = db.query(ChatSession).filter(ChatSession.session_id == req.session_id).first()
    else:
        session = None

    if not session:
        session = ChatSession(
            session_id=req.session_id or f"sess_{uuid.uuid4().hex[:16]}",
            tenant_id=req.tenant_id,
            customer_id=req.customer_id,
        )
        db.add(session)
        db.flush()

    # 保存用户消息
    user_msg = ChatMessage(
        session_id=session.session_id,
        role="user",
        content=req.message,
    )
    db.add(user_msg)
    db.flush()

    # 调用对话引擎
    engine = DialogEngine(db=db, tenant_id=req.tenant_id, customer_id=req.customer_id)
    result = engine.process(
        session_id=session.session_id,
        message=req.message,
    )

    processing_time = int((time.time() - start_time) * 1000)

    # 保存AI回复
    ai_msg = ChatMessage(
        session_id=session.session_id,
        role="assistant",
        content=result.reply,
        intent=result.get("intent"),
        structured_data=result.get("structured_data"),
        evidence_chain=result.get("evidence_chain"),
        suggested_actions=result.get("suggested_actions"),
        processing_time_ms=processing_time,
    )
    db.add(ai_msg)

    # 更新会话
    session.message_count = (session.message_count or 0) + 2
    db.commit()

    return ResponseBase(data=ChatResponse(
        session_id=session.session_id,
        reply=result.reply,
        reply_type=result.get("reply_type", "text"),
        structured_data=result.get("structured_data"),
        evidence_chain=result.get("evidence_chain"),
        suggested_actions=result.get("suggested_actions"),
        needs_clarification=result.get("needs_clarification", False),
        clarification=result.get("clarification"),
        context=result.get("context"),
    ).model_dump())


@router.post("/actions")
def execute_action(req: ActionRequest, db: Session = Depends(get_db)):
    """动作执行接口"""
    engine = DialogEngine(db=db, tenant_id=req.tenant_id, customer_id=req.customer_id)
    result = engine.execute_action(
        session_id=req.session_id,
        action=req.action,
        params=req.params,
        confirmed=req.confirmed,
    )
    return ResponseBase(data=result)


@router.get("/sessions/{session_id}/history")
def get_session_history(session_id: str, db: Session = Depends(get_db)):
    """获取会话历史"""
    messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at)
        .all()
    )
    return ResponseBase(data=[
        {
            "role": m.role,
            "content": m.content,
            "intent": m.intent,
            "structured_data": m.structured_data,
            "suggested_actions": m.suggested_actions,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }
        for m in messages
    ])


@router.delete("/sessions/{session_id}")
def delete_session(session_id: str, db: Session = Depends(get_db)):
    """删除会话及其所有消息"""
    session = db.query(ChatSession).filter(ChatSession.session_id == session_id).first()
    if not session:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="会话不存在")
    db.query(ChatMessage).filter(ChatMessage.session_id == session_id).delete()
    db.delete(session)
    db.commit()
    return ResponseBase(message="会话已删除")


@router.get("/sessions")
def list_sessions(
    tenant_id: int = 1,
    page: int = 1,
    size: int = 20,
    db: Session = Depends(get_db),
):
    """获取会话列表"""
    query = (
        db.query(ChatSession)
        .filter(ChatSession.tenant_id == tenant_id)
        .order_by(ChatSession.created_at.desc())
    )
    total = query.count()
    items = query.offset((page - 1) * size).limit(size).all()
    return ResponseBase(data={
        "items": [
            {
                "session_id": s.session_id,
                "customer_id": s.customer_id,
                "customer_name": s.customer_name,
                "message_count": s.message_count or 0,
                "source": s.source,
                "created_at": s.created_at.isoformat() if s.created_at else None,
            }
            for s in items
        ],
        "total": total,
    })
