"""add capability and policy fields to action

Revision ID: f4a2b7c93e10
Revises: d85c257bb470
Create Date: 2026-03-16 23:58:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'f4a2b7c93e10'
down_revision: Union[str, None] = 'd85c257bb470'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Stage 2: Capability 注册
    op.add_column('ai_action', sa.Column(
        'capability_code', sa.String(128), nullable=True,
        comment='能力编码: entity_code.action_code 格式, 如 issue.close',
    ))
    op.add_column('ai_action', sa.Column(
        'side_effect_type', sa.String(16), nullable=True, server_default='read',
        comment='副作用类型: read/write/delete',
    ))
    op.add_column('ai_action', sa.Column(
        'input_schema', sa.JSON(), nullable=True,
        comment='输入参数 JSON Schema',
    ))
    op.add_column('ai_action', sa.Column(
        'output_schema', sa.JSON(), nullable=True,
        comment='输出参数 JSON Schema',
    ))
    # Stage 3: Policy Guard
    op.add_column('ai_action', sa.Column(
        'requires_confirmation', sa.Boolean(), nullable=True, server_default=sa.text('0'),
        comment='是否需要用户确认(写/删操作)',
    ))
    op.add_column('ai_action', sa.Column(
        'policy_config', sa.JSON(), nullable=True,
        comment='安全策略配置(JSON): scope_check, preconditions, rate_limit等',
    ))
    # 索引可能已存在(ORM metadata.create_all)，用 if_not_exists 兼容
    try:
        op.create_index('ix_ai_action_capability_code', 'ai_action', ['capability_code'])
    except Exception:
        pass  # index already exists


def downgrade() -> None:
    op.drop_index('ix_ai_action_capability_code', table_name='ai_action')
    op.drop_column('ai_action', 'policy_config')
    op.drop_column('ai_action', 'requires_confirmation')
    op.drop_column('ai_action', 'output_schema')
    op.drop_column('ai_action', 'input_schema')
    op.drop_column('ai_action', 'side_effect_type')
    op.drop_column('ai_action', 'capability_code')
