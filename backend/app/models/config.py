"""大模型配置 + 连接器模型"""
from sqlalchemy import (
    Column, BigInteger, String, Text, DateTime, JSON, Integer, Float, func
)
from app.database import Base


class LLMConfig(Base):
    """大模型配置 - 第一阶段核心：豆包/GLM/千问/自有"""
    __tablename__ = "rc_ai_llm_config"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    tenant_id = Column(BigInteger, nullable=False, index=True, comment="租户ID")
    name = Column(String(128), nullable=False, comment="配置名称")
    provider = Column(String(32), nullable=False, comment="提供商: doubao/glm/qwen/minimax/lmstudio/custom")
    model_name = Column(String(64), nullable=False, comment="模型名称")
    api_url = Column(String(512), nullable=False, comment="API地址")
    api_key = Column(String(512), nullable=False, comment="API密钥(加密存储)")
    temperature = Column(Float, default=0.7, comment="温度参数")
    max_tokens = Column(Integer, default=2048, comment="最大token数")
    usage = Column(String(32), nullable=False, default="general",
                   comment="用途: intent/response/entity/general")
    extra_params = Column(JSON, comment="额外参数(JSON)")
    status = Column(String(16), nullable=False, default="active", comment="active/disabled")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class Connector(Base):
    """适配器 - 外部系统接入抽象(河狸云/其他API) (表名: rc_ai_adapter)"""
    __tablename__ = "rc_ai_adapter"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    tenant_id = Column(BigInteger, nullable=False, index=True, comment="租户ID")
    name = Column(String(128), nullable=False, comment="适配器名称")
    type = Column(String(32), nullable=False, default="beaver_cloud",
                  comment="类型: beaver_cloud/custom_api")
    base_url = Column(String(512), nullable=False, comment="基础URL")
    auth_type = Column(String(32), nullable=False, default="api_key",
                       comment="认证方式: api_key/oauth2/jwt_pass/custom")
    auth_config = Column(JSON, comment="认证配置(JSON): {key, secret, token_url, ...}")
    timeout = Column(Integer, default=30, comment="超时时间(秒)")
    health_check_path = Column(String(256), comment="健康检查路径")
    mock_enabled = Column(String(1), default="0", comment="是否启用mock降级: 0/1")
    status = Column(String(16), nullable=False, default="active", comment="active/disabled")
    # v6 新增字段
    adapter_type = Column(String(16), default="webapi", comment="适配器类型: webapi/database")
    db_config = Column(JSON, comment="数据库配置（WebAPI类不需要）")
    openapi_url = Column(String(500), comment="OpenAPI文档地址（远期）")
    # 2.0 映射器
    request_mapper = Column(String(100), default="passthrough", comment="请求映射器: passthrough/beaver_dataset")
    response_mapper = Column(String(100), default="passthrough", comment="响应映射器: passthrough/beaver_dataset")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
