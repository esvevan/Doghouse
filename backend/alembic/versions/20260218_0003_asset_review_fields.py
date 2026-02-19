from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260218_0003"
down_revision = "20260218_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("assets", sa.Column("tested", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("assets", sa.Column("os_name", sa.Text(), nullable=True))
    op.add_column("assets", sa.Column("open_ports_override", postgresql.ARRAY(sa.Integer()), nullable=True))


def downgrade() -> None:
    op.drop_column("assets", "open_ports_override")
    op.drop_column("assets", "os_name")
    op.drop_column("assets", "tested")

