"""add response_description to action

Revision ID: d85c257bb470
Revises: b3f7e2a19c54
Create Date: 2026-03-16 08:51:30.285035

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

# revision identifiers, used by Alembic.
revision: str = 'd85c257bb470'
down_revision: Union[str, None] = 'b3f7e2a19c54'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('ai_action', sa.Column('response_description', sa.Text(), nullable=True, comment='响应数据说明: 描述API返回字段的业务含义，如枚举值映射等，提交给LLM辅助生成回复'))


def downgrade() -> None:
    op.drop_column('ai_action', 'response_description')
