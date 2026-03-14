"""
技能/意图模型 - 用户意图和技能编排

rc_ai_skill       → Skill (技能/意图)
rc_ai_skills_tools → SkillTool (技能工具关联)
"""
from sqlalchemy import (
    Column, BigInteger, String, Text, DateTime, Integer, JSON, func
)
from app.database import Base


class Skill(Base):
    """技能 - 对应一种用户意图 (殷明: rc_ai_skill)"""
    __tablename__ = "ai_skill"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    tenant_id = Column(BigInteger, nullable=False, index=True, comment="租户ID")
    skill_name = Column(String(128), nullable=False, comment="技能名称")
    skill_code = Column(String(64), nullable=False, comment="技能编码: QUERY_PROGRESS等")
    skill_description = Column(Text, comment="技能描述(给AI理解意图用)")
    # 意图匹配配置
    match_keywords = Column(JSON, comment="关键词匹配列表(JSON数组)")
    match_patterns = Column(JSON, comment="正则匹配列表(JSON数组)")
    # 提示词配置
    intent_prompt = Column(Text, comment="意图识别提示词模板")
    response_prompt = Column(Text, comment="回答生成提示词模板")
    response_template = Column(Text, comment="回答文本模板(变量插值)")
    # 澄清交互配置
    clarification_config = Column(JSON, comment="澄清交互配置(JSON)")
    # 关联大模型
    llm_config_id = Column(BigInteger, comment="关联大模型配置ID")
    # 状态
    status = Column(String(16), nullable=False, default="draft", comment="draft/published")
    version = Column(Integer, default=1, comment="配置版本号")
    sort_order = Column(Integer, default=0, comment="排序(匹配优先级)")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class SkillTool(Base):
    """技能工具 - 技能与本体/工具的有序关联 (殷明: rc_ai_skills_tools)"""
    __tablename__ = "ai_skill_tool"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    skill_id = Column(BigInteger, nullable=False, index=True, comment="所属技能ID")
    tools_mode = Column(String(32), nullable=False, default="api",
                        comment="工具类型: system_tool/api(系统工具/接口)")
    entity_id = Column(BigInteger, comment="关联本体ID")
    action_id = Column(BigInteger, comment="关联操作ID(指定本体下的具体操作)")
    order_no = Column(Integer, nullable=False, default=0, comment="执行顺序")
    config = Column(JSON, comment="工具配置(JSON): 参数映射、条件等")
    created_at = Column(DateTime, server_default=func.now())
