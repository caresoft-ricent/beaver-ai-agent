"""对话API - 客户侧使用"""
import json
import uuid
import time
from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.chat import ChatSession, ChatMessage
from app.schemas.chat import ChatRequest, ChatResponse, ActionRequest, ActionResponse, AGUIStreamRequest
from app.schemas.common import ResponseBase
from app.core.stream_engine import stream_dialog
from app.core import agui
from app.kernel.scope import BeaverSessionScope, extract_scope

router = APIRouter()


@router.post("/completions")
async def chat_completions(req: ChatRequest, request: Request, db: Session = Depends(get_db)):
    """对话主接口 — 使用流式引擎同步收集结果"""
    scope = extract_scope(request)
    scope.tenant_id = req.tenant_id
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

    # 使用流式引擎收集结果（与 /stream 端点走完全相同的处理链路）
    thread_id = session.session_id
    run_id = f"run_{uuid.uuid4().hex[:8]}"

    collected_text: list[str] = []
    collected_intent: str | None = None
    collected_data: dict | None = None
    collected_evidence: dict | None = None
    needs_clarification = False
    clarification_info: dict | None = None

    async for event_str in stream_dialog(
        db=db,
        tenant_id=req.tenant_id,
        customer_id=req.customer_id,
        session_id=session.session_id,
        message=req.message,
        thread_id=thread_id,
        run_id=run_id,
        scope=scope,
    ):
        if '"TEXT_MESSAGE_CONTENT"' in event_str:
            try:
                payload = json.loads(event_str.split("data: ", 1)[1].strip())
                collected_text.append(payload.get("delta", ""))
            except Exception:
                pass
        elif '"CUSTOM"' in event_str:
            try:
                payload = json.loads(event_str.split("data: ", 1)[1].strip())
                evt_name = payload.get("name", "")
                if evt_name == "intent":
                    collected_intent = payload.get("value", {}).get("code")
                elif evt_name == "structured_data":
                    collected_data = payload.get("value")
                elif evt_name == "evidence":
                    collected_evidence = payload.get("value")
                elif evt_name == "clarification":
                    needs_clarification = True
                    clarification_info = payload.get("value")
            except Exception:
                pass

    reply = "".join(collected_text)
    processing_time = int((time.time() - start_time) * 1000)

    # 保存AI回复
    ai_msg = ChatMessage(
        session_id=session.session_id,
        role="assistant",
        content=reply,
        intent=collected_intent,
        structured_data=collected_data,
        evidence_chain=collected_evidence,
        processing_time_ms=processing_time,
    )
    db.add(ai_msg)

    # 更新会话
    session.message_count = (session.message_count or 0) + 2
    db.commit()

    return ResponseBase(data=ChatResponse(
        session_id=session.session_id,
        reply=reply,
        reply_type="structured" if collected_data else "text",
        intent=collected_intent,
        structured_data=collected_data,
        evidence_chain=collected_evidence,
        needs_clarification=needs_clarification,
        clarification=clarification_info,
    ).model_dump())


@router.post("/stream")
async def chat_stream(req: AGUIStreamRequest, request: Request, db: Session = Depends(get_db)):
    """AG-UI 流式对话端点 — Server-Sent Events"""
    # 从 AG-UI 协议提取参数
    message = req.messages[-1].content if req.messages else ""
    tenant_id = req.context.tenant_id if req.context else 1
    customer_id = req.context.customer_id if req.context else "C001"
    session_id = req.thread_id

    # 获取或创建会话
    if session_id:
        session = db.query(ChatSession).filter(ChatSession.session_id == session_id).first()
    else:
        session = None

    if not session:
        session = ChatSession(
            session_id=session_id or f"sess_{uuid.uuid4().hex[:16]}",
            tenant_id=tenant_id,
            customer_id=customer_id,
        )
        db.add(session)
        db.flush()

    # 保存用户消息并立即提交, 确保会话和消息在流式响应前持久化
    user_msg = ChatMessage(
        session_id=session.session_id,
        role="user",
        content=message,
    )
    db.add(user_msg)
    db.commit()

    scope = extract_scope(request)
    scope.tenant_id = tenant_id

    thread_id = session.session_id
    run_id = req.run_id or agui.new_id()

    # 收集全部回复文本用于存库
    collected_text: list[str] = []
    collected_intent: str | None = None
    collected_data: dict | None = None
    collected_evidence: dict | None = None

    async def event_generator():
        nonlocal collected_intent, collected_data, collected_evidence
        async for event_str in stream_dialog(
            db=db,
            tenant_id=tenant_id,
            customer_id=customer_id,
            session_id=session.session_id,
            message=message,
            thread_id=thread_id,
            run_id=run_id,
            scope=scope,
        ):
            # 拦截内容用于存库
            if '"TEXT_MESSAGE_CONTENT"' in event_str:
                import json as _json
                try:
                    payload = _json.loads(event_str.split("data: ", 1)[1].strip())
                    collected_text.append(payload.get("delta", ""))
                except Exception:
                    pass
            elif '"CUSTOM"' in event_str:
                import json as _json
                try:
                    payload = _json.loads(event_str.split("data: ", 1)[1].strip())
                    evt_name = payload.get("name", "")
                    if evt_name == "intent":
                        collected_intent = payload.get("value", {}).get("code")
                    elif evt_name == "structured_data":
                        collected_data = payload.get("value")
                    elif evt_name == "evidence":
                        collected_evidence = payload.get("value")
                except Exception:
                    pass

            yield event_str

        # 流结束后保存 AI 回复
        full_reply = "".join(collected_text)
        if full_reply:
            ai_msg = ChatMessage(
                session_id=session.session_id,
                role="assistant",
                content=full_reply,
                intent=collected_intent,
                structured_data=collected_data,
                evidence_chain=collected_evidence,
            )
            db.add(ai_msg)
            # 使用原子 SQL UPDATE 避免 ORM 对象在异步生成器中失效导致 message_count 始终为 0
            db.execute(
                text("UPDATE ai_chat_session SET message_count = message_count + 2 WHERE session_id = :sid"),
                {"sid": session.session_id},
            )
            db.commit()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Session-Id": session.session_id,
        },
    )


@router.post("/actions")
def execute_action(req: ActionRequest, db: Session = Depends(get_db)):
    """动作执行接口"""
    return ResponseBase(data={
        "success": True,
        "reply": f"动作 {req.action} 已收到，参数: {json.dumps(req.params or {}, ensure_ascii=False)}。功能开发中。",
    })


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


@router.post("/sessions/batch-delete")
def batch_delete_sessions(req: dict, db: Session = Depends(get_db)):
    """批量删除会话及其所有消息"""
    session_ids = req.get("session_ids", [])
    if not session_ids:
        return ResponseBase(message="未指定会话")
    db.query(ChatMessage).filter(ChatMessage.session_id.in_(session_ids)).delete(synchronize_session=False)
    count = db.query(ChatSession).filter(ChatSession.session_id.in_(session_ids)).delete(synchronize_session=False)
    db.commit()
    return ResponseBase(message=f"已删除 {count} 个会话")


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
