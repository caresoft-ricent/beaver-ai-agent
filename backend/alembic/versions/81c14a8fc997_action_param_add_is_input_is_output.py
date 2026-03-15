"""action_param_add_is_input_is_output

Revision ID: 81c14a8fc997
Revises: a5e3c8f2d741
Create Date: 2026-03-15 18:31:52.103804

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

# revision identifiers, used by Alembic.
revision: str = '81c14a8fc997'
down_revision: Union[str, None] = 'a5e3c8f2d741'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    from sqlalchemy import text
    conn = op.get_bind()

    # 1. ActionParameter: 添加 is_input, is_output 列
    for col in ['is_input', 'is_output']:
        exists = conn.execute(text(
            f"SELECT COUNT(*) FROM information_schema.columns "
            f"WHERE table_schema=DATABASE() AND table_name='ai_action_parameter' AND column_name='{col}'"
        )).scalar()
        if not exists:
            op.add_column('ai_action_parameter', sa.Column(col, sa.Boolean(), server_default='0', nullable=True, comment=f'是否为{"输入" if col == "is_input" else "输出"}参数'))

    # 2. 从 direction 字段迁移数据到 is_input/is_output
    conn.execute(text("UPDATE ai_action_parameter SET is_input=1 WHERE direction='input' AND (is_input IS NULL OR is_input=0)"))
    conn.execute(text("UPDATE ai_action_parameter SET is_output=1 WHERE direction='output' AND (is_output IS NULL OR is_output=0)"))

    # 3. Action.entity_id 设为 NOT NULL (已有数据应都有 entity_id)
    try:
        op.alter_column('ai_action', 'entity_id', existing_type=mysql.BIGINT(), nullable=False)
    except Exception:
        pass  # 可能已经是 NOT NULL


def downgrade() -> None:
    op.drop_column('ai_action_parameter', 'is_output')
    op.drop_column('ai_action_parameter', 'is_input')
    op.alter_column('ai_action', 'entity_id', existing_type=mysql.BIGINT(), nullable=True)
