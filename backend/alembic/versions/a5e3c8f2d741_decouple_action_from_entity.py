"""decouple_action_from_entity

Revision ID: a5e3c8f2d741
Revises: 13496df1d35d
Create Date: 2026-03-15 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'a5e3c8f2d741'
down_revision: Union[str, None] = '13496df1d35d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # 检查 ai_action 中已有的列
    result = conn.execute(sa.text("DESCRIBE ai_action"))
    existing_cols = {row[0] for row in result}

    # ai_action: 新增字段(跳过已存在的)
    if 'tenant_id' not in existing_cols:
        op.add_column('ai_action', sa.Column('tenant_id', sa.BigInteger(), nullable=True, comment='租户ID'))
    if 'connector_id' not in existing_cols:
        op.add_column('ai_action', sa.Column('connector_id', sa.BigInteger(), nullable=True, comment='关联连接器ID(独立操作时必填)'))
    if 'category' not in existing_cols:
        op.add_column('ai_action', sa.Column('category', sa.String(64), nullable=True, server_default='', comment='分类标签'))
    if 'tags' not in existing_cols:
        op.add_column('ai_action', sa.Column('tags', sa.JSON(), nullable=True, comment='标签(JSON数组)'))

    # 回填 tenant_id: 从关联的entity获取
    op.execute("""
        UPDATE ai_action a
        JOIN ai_entity e ON a.entity_id = e.id
        SET a.tenant_id = e.tenant_id
        WHERE a.tenant_id IS NULL
    """)
    op.execute("UPDATE ai_action SET tenant_id = 1 WHERE tenant_id IS NULL")

    # tenant_id 改为 NOT NULL
    op.alter_column('ai_action', 'tenant_id', existing_type=sa.BigInteger(), nullable=False)

    # 创建索引(跳过已存在的)
    result2 = conn.execute(sa.text("SHOW INDEX FROM ai_action WHERE Key_name = 'ix_ai_action_tenant_id'"))
    if not result2.fetchone():
        op.create_index('ix_ai_action_tenant_id', 'ai_action', ['tenant_id'])
    result3 = conn.execute(sa.text("SHOW INDEX FROM ai_action WHERE Key_name = 'ix_ai_action_connector_id'"))
    if not result3.fetchone():
        op.create_index('ix_ai_action_connector_id', 'ai_action', ['connector_id'])

    # entity_id 改为可空
    op.alter_column('ai_action', 'entity_id', existing_type=sa.BigInteger(), nullable=True)

    # ai_action_parameter: 新增 source_property 字段
    result4 = conn.execute(sa.text("DESCRIBE ai_action_parameter"))
    ap_cols = {row[0] for row in result4}
    if 'source_property' not in ap_cols:
        op.add_column('ai_action_parameter', sa.Column(
            'source_property', sa.String(64), nullable=True,
            comment='来源属性名(本体/上下文中的语义字段名, 为空则与name相同)'
        ))


def downgrade() -> None:
    op.drop_column('ai_action_parameter', 'source_property')
    op.alter_column('ai_action', 'entity_id', existing_type=sa.BigInteger(), nullable=False)
    op.drop_index('ix_ai_action_connector_id', 'ai_action')
    op.drop_index('ix_ai_action_tenant_id', 'ai_action')
    op.drop_column('ai_action', 'tags')
    op.drop_column('ai_action', 'category')
    op.drop_column('ai_action', 'connector_id')
    op.drop_column('ai_action', 'tenant_id')
