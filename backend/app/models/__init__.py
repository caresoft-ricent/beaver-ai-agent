"""Import all models so SQLAlchemy can discover them."""
from app.models.tenant import Tenant, TenantApiKey  # noqa
from app.models.config import LLMConfig, Connector  # noqa
from app.models.ontology import BaseProperty, Entity, EntityProperty, EntityRelation  # noqa
from app.models.action import Action, ActionParameter  # noqa
from app.models.intent import Skill, SkillTool  # noqa
from app.models.chat import ChatSession, ChatMessage, ActionLog  # noqa
from app.models.admin import AdminUser, OperationLog  # noqa
from app.models.normalization import NormalizationRule  # noqa
