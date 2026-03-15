"""action_param_add_value_type

Revision ID: b3f7e2a19c54
Revises: 81c14a8fc997
Create Date: 2026-03-15 19:43:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect

revision = 'b3f7e2a19c54'
down_revision = '81c14a8fc997'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa_inspect(bind)
    cols = [c['name'] for c in insp.get_columns('ai_action_parameter')]
    if 'value_type' not in cols:
        op.add_column('ai_action_parameter',
            sa.Column('value_type', sa.String(32), server_default='none', nullable=True,
                      comment='取值方式: none/fixed/count/sum/local_func'))


def downgrade() -> None:
    op.drop_column('ai_action_parameter', 'value_type')
