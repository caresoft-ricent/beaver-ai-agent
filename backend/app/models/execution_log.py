"""执行日志模型 — rc_ai_execution_log

三重用途：① 证据链 ② 自发现反馈 ③ 小模型训练数据
"""
from sqlalchemy import (
    Column, BigInteger, String, Text, DateTime, Integer, Boolean, JSON, func
)
from app.database import Base


class ExecutionLog(Base):
    """执行日志"""
    __tablename__ = "rc_ai_execution_log"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    session_id = Column(String(100), index=True, comment="Redis Session ID")
    conversation_id = Column(BigInteger, comment="对话ID")
    user_input = Column(Text, comment="用户原始输入")
    skill_id = Column(BigInteger, comment="技能ID")
    tool_id = Column(BigInteger, comment="工具ID")
    entity_id = Column(BigInteger, comment="本体ID")
    action_id = Column(BigInteger, index=True, comment="操作ID")
    adapter_id = Column(BigInteger, comment="适配器ID")
    input_params = Column(JSON, comment="打平的输入参数")
    output_data = Column(JSON, comment="打平的输出结果")
    user_context = Column(JSON, comment="用户上下文（不含headers）")
    success = Column(Boolean, comment="是否成功")
    error_message = Column(Text, comment="错误信息")
    duration_ms = Column(Integer, comment="执行耗时(毫秒)")
    created_at = Column(DateTime, server_default=func.now())
