from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260218_0006"
down_revision = "20260218_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "loot_credentials",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "project_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("username", sa.Text(), nullable=True),
        sa.Column("password", sa.Text(), nullable=True),
        sa.Column("format", sa.Text(), nullable=True),
        sa.Column("hash", sa.Text(), nullable=True),
        sa.Column("host", sa.Text(), nullable=True),
        sa.Column("service", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_loot_credentials_project_id", "loot_credentials", ["project_id"])
    op.create_index("ix_loot_credentials_host", "loot_credentials", ["host"])


def downgrade() -> None:
    op.drop_index("ix_loot_credentials_host", table_name="loot_credentials")
    op.drop_index("ix_loot_credentials_project_id", table_name="loot_credentials")
    op.drop_table("loot_credentials")

