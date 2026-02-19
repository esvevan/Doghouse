from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260218_0004"
down_revision = "20260218_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "instances",
        sa.Column("flagged_for_testing", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )


def downgrade() -> None:
    op.drop_column("instances", "flagged_for_testing")

