"""测试基础设施 - fixtures & factories

使用 MySQL 测试数据库 beaver_ai_test，通过事务回滚隔离每个测试。
需要 Docker MySQL 容器 beaver-ai-mysql 运行中。
"""
import os
import json
import pytest
import asyncio
from unittest.mock import patch, MagicMock
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# 测试数据库（隔离于生产库）
TEST_DB_URL = (
    "mysql+pymysql://root:beaver2026@127.0.0.1:13306/beaver_ai_test?charset=utf8mb4"
)

os.environ["APP_DEBUG"] = "false"

from app.database import Base
from app.models.config import LLMConfig, Connector
from app.models.ontology import Entity, EntityProperty
from app.models.action import Action, ActionParameter
from app.models.intent import Skill, SkillTool
from app.models.chat import ChatSession


@pytest.fixture(scope="session")
def engine():
    """创建测试数据库引擎（MySQL beaver_ai_test）"""
    # 先确保测试数据库存在
    root_eng = create_engine(
        "mysql+pymysql://root:beaver2026@127.0.0.1:13306/?charset=utf8mb4"
    )
    with root_eng.connect() as conn:
        conn.execute(text("CREATE DATABASE IF NOT EXISTS beaver_ai_test"))
        conn.commit()
    root_eng.dispose()

    eng = create_engine(TEST_DB_URL, echo=False)
    Base.metadata.drop_all(eng)
    Base.metadata.create_all(eng)
    yield eng
    eng.dispose()


@pytest.fixture(scope="function")
def db(engine):
    """每个测试函数独立的数据库会话（自动回滚）"""
    connection = engine.connect()
    transaction = connection.begin()
    Session = sessionmaker(bind=connection)
    session = Session()

    yield session

    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture
def tenant_id():
    return 1


@pytest.fixture
def customer_id():
    return "test_customer_001"


@pytest.fixture
def session_id():
    return "test_session_001"


# ── 数据工厂 ──

class Factory:
    """测试数据工厂 - 快速创建配置数据"""

    @staticmethod
    def connector(db, **kwargs):
        defaults = {
            "tenant_id": 1,
            "name": "测试连接器",
            "type": "rest_api",
            "base_url": "https://api.example.com",
            "auth_type": "api_key",
            "auth_config": {"header_name": "Authorization", "key_value": "Bearer test-token"},
            "timeout": 30,
            "mock_enabled": "1",
            "status": "active",
        }
        defaults.update(kwargs)
        obj = Connector(**defaults)
        db.add(obj)
        db.flush()
        return obj

    @staticmethod
    def llm_config(db, **kwargs):
        defaults = {
            "tenant_id": 1,
            "name": "测试LLM",
            "provider": "openai",
            "model_name": "gpt-4o-mini",
            "api_url": "https://api.openai.com/v1",
            "api_key": "sk-test",
            "temperature": 0.7,
            "max_tokens": 2048,
            "usage": "general",
            "status": "active",
        }
        defaults.update(kwargs)
        obj = LLMConfig(**defaults)
        db.add(obj)
        db.flush()
        return obj

    @staticmethod
    def entity(db, **kwargs):
        defaults = {
            "tenant_id": 1,
            "entity_mode": "standard",
            "entity_code": "test_entity",
            "entity_name": "测试实体",
            "status": "active",
        }
        defaults.update(kwargs)
        obj = Entity(**defaults)
        db.add(obj)
        db.flush()
        return obj

    @staticmethod
    def entity_property(db, entity, **kwargs):
        defaults = {
            "entity_id": entity.id,
            "name": "test_prop",
            "title": "测试属性",
            "data_type": "string",
        }
        defaults.update(kwargs)
        obj = EntityProperty(**defaults)
        db.add(obj)
        db.flush()
        return obj

    @staticmethod
    def action(db, entity, connector=None, **kwargs):
        defaults = {
            "tenant_id": 1,
            "entity_id": entity.id,
            "connector_id": connector.id if connector else None,
            "action_code": "test_action",
            "action_name": "测试操作",
            "http_method": "GET",
            "api_path": "/api/test",
            "mock_response": {"data": {"items": [{"id": 1, "name": "测试数据"}]}},
        }
        defaults.update(kwargs)
        obj = Action(**defaults)
        db.add(obj)
        db.flush()
        return obj

    @staticmethod
    def action_parameter(db, action, **kwargs):
        defaults = {
            "action_id": action.id,
            "name": "test_param",
            "type": "string",
            "title": "测试参数",
            "is_input": True,
            "is_output": False,
            "is_required": False,
        }
        defaults.update(kwargs)
        obj = ActionParameter(**defaults)
        db.add(obj)
        db.flush()
        return obj

    @staticmethod
    def chat_session(db, session_id, **kwargs):
        defaults = {
            "session_id": session_id,
            "tenant_id": 1,
            "customer_id": "test_customer_001",
            "source": "web",
            "message_count": 0,
            "context_snapshot": {"entities": {}, "last_intent": None, "turn_count": 0, "history_intents": []},
        }
        defaults.update(kwargs)
        obj = ChatSession(**defaults)
        db.add(obj)
        db.flush()
        return obj

    @staticmethod
    def skill(db, **kwargs):
        defaults = {
            "tenant_id": 1,
            "skill_name": "测试技能",
            "skill_code": "test_skill",
            "skill_description": "用于测试的技能",
            "match_keywords": ["测试", "查询测试"],
            "match_patterns": [],
            "status": "published",
            "sort_order": 1,
            "flow_type": "simple",
        }
        defaults.update(kwargs)
        obj = Skill(**defaults)
        db.add(obj)
        db.flush()
        return obj

    @staticmethod
    def skill_tool(db, skill, entity=None, action=None, **kwargs):
        defaults = {
            "skill_id": skill.id,
            "tools_mode": "api" if not action else "entity_action",
            "entity_id": entity.id if entity else None,
            "action_id": action.id if action else None,
            "order_no": 1,
            "config": {},
        }
        defaults.update(kwargs)
        obj = SkillTool(**defaults)
        db.add(obj)
        db.flush()
        return obj


@pytest.fixture
def factory():
    return Factory
