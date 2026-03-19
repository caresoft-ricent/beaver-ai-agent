"""运行时模型 - 会话、消息、动作日志"""
from sqlalchemy import (
    Column, BigInteger, String, Text, DateTime, Integer, JSON, Enum, func
)
from app.database import Base


class ChatSession(Base):
    """会话记录"""
    __tablename__ = "rc_ai_chat_session"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    session_id = Column(String(64), nullable=False, unique=True, comment="会话唯一标识")
    tenant_id = Column(BigInteger, nullable=False, index=True, comment="租户ID")
    customer_id = Column(String(64), nullable=False, index=True, comment="客户标识")
    customer_name = Column(String(128), comment="客户名称")
    source = Column(String(32), default="web", comment="来源: web/miniapp/h5/api")
    message_count = Column(Integer, default=0, comment="消息数")
    context_snapshot = Column(JSON, comment="最后的上下文快照")
    started_at = Column(DateTime, server_default=func.now())
    ended_at = Column(DateTime, comment="会话结束时间")
    created_at = Column(DateTime, server_default=func.now())


class ChatMessage(Base):
    """对话消息记录"""
    __tablename__ = "rc_ai_chat_message"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    session_id = Column(String(64), nullable=False, index=True, comment="会话ID")
    role = Column(String(16), nullable=False, comment="角色: user/assistant/system")
    content = Column(Text, nullable=False, comment="消息内容")
    # AI处理结果
    intent = Column(String(32), comment="识别的意图")
    entities = Column(JSON, comment="抽取的实体(JSON)")
    structured_data = Column(JSON, comment="结构化数据(JSON)")
    evidence_chain = Column(JSON, comment="证据链(JSON)")
    suggested_actions = Column(JSON, comment="建议操作(JSON)")
    # 性能指标
    llm_tokens_used = Column(Integer, comment="LLM token消耗")
    processing_time_ms = Column(Integer, comment="处理耗时(毫秒)")
    created_at = Column(DateTime, server_default=func.now())


class ActionLog(Base):
    """动作执行日志"""
    __tablename__ = "rc_ai_action_log"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    session_id = Column(String(64), nullable=False, index=True, comment="会话ID")
    tenant_id = Column(BigInteger, nullable=False, index=True, comment="租户ID")
    customer_id = Column(String(64), nullable=False, index=True, comment="客户标识")
    action_type = Column(String(32), nullable=False, comment="动作类型")
    action_params = Column(JSON, comment="动作参数(JSON)")
    status = Column(String(16), nullable=False, default="pending",
                    comment="pending/success/failed")
    result = Column(JSON, comment="执行结果(JSON)")
    error_message = Column(Text, comment="错误信息")
    created_at = Column(DateTime, server_default=func.now())
    executed_at = Column(DateTime, comment="执行完成时间")
