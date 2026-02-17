from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260217_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    severity_enum = postgresql.ENUM("info", "low", "medium", "high", "critical", name="severity_enum")
    status_enum = postgresql.ENUM(
        "open", "closed", "accepted", "false_positive", name="instance_status_enum"
    )
    ingest_enum = postgresql.ENUM("queued", "running", "succeeded", "failed", name="ingest_status_enum")
    severity_enum.create(op.get_bind(), checkfirst=True)
    status_enum.create(op.get_bind(), checkfirst=True)
    ingest_enum.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "projects",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )

    op.create_table(
        "assets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("ip", postgresql.INET(), nullable=False),
        sa.Column("primary_hostname", sa.Text(), nullable=True),
        sa.Column("hostnames", postgresql.ARRAY(sa.Text()), nullable=False, server_default=sa.text("'{}'::text[]")),
        sa.Column("tags", postgresql.ARRAY(sa.Text()), nullable=False, server_default=sa.text("'{}'::text[]")),
        sa.Column("first_seen", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_unique_constraint("uq_assets_project_ip", "assets", ["project_id", "ip"])
    op.create_index("ix_assets_project_primary_hostname", "assets", ["project_id", "primary_hostname"])
    op.create_index("ix_assets_project_last_seen", "assets", ["project_id", "last_seen"])

    op.create_table(
        "services",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("asset_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("assets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("proto", sa.Text(), nullable=False),
        sa.Column("port", sa.Integer(), nullable=False),
        sa.Column("name", sa.Text(), nullable=True),
        sa.Column("product", sa.Text(), nullable=True),
        sa.Column("version", sa.Text(), nullable=True),
        sa.Column("banner", sa.Text(), nullable=True),
        sa.Column("first_seen", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_unique_constraint("uq_services_asset_proto_port", "services", ["asset_id", "proto", "port"])
    op.create_index("ix_services_project_port", "services", ["project_id", "port"])
    op.create_index("ix_services_project_name", "services", ["project_id", "name"])

    op.create_table(
        "findings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("finding_key", sa.Text(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("severity", severity_enum, nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("remediation", sa.Text(), nullable=True),
        sa.Column("references", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("scanner", sa.Text(), nullable=False),
        sa.Column("scanner_id", sa.Text(), nullable=True),
        sa.Column("search_vector", postgresql.TSVECTOR(), nullable=False, server_default=sa.text("''::tsvector")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_unique_constraint("uq_findings_project_key", "findings", ["project_id", "finding_key"])
    op.create_index("ix_findings_project_severity", "findings", ["project_id", "severity"])
    op.create_index("ix_findings_search_vector", "findings", ["search_vector"], postgresql_using="gin")

    op.create_table(
        "instances",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("finding_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("findings.id", ondelete="CASCADE"), nullable=False),
        sa.Column("asset_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("assets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("service_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("services.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status", status_enum, nullable=False, server_default="open"),
        sa.Column("evidence_snippet", sa.Text(), nullable=True),
        sa.Column("search_vector", postgresql.TSVECTOR(), nullable=False, server_default=sa.text("''::tsvector")),
        sa.Column("first_seen", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_instances_project_status", "instances", ["project_id", "status"])
    op.create_index("ix_instances_search_vector", "instances", ["search_vector"], postgresql_using="gin")
    op.execute(
        """
        CREATE UNIQUE INDEX uq_instances_project_finding_asset_service_coalesced
        ON instances (project_id, finding_id, asset_id, COALESCE(service_id, '00000000-0000-0000-0000-000000000000'::uuid))
        """
    )

    op.create_table(
        "notes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("search_vector", postgresql.TSVECTOR(), nullable=False, server_default=sa.text("''::tsvector")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_notes_search_vector", "notes", ["search_vector"], postgresql_using="gin")

    op.create_table(
        "artifacts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sha256", sa.Text(), nullable=False),
        sa.Column("size", sa.BigInteger(), nullable=False),
        sa.Column("mime", sa.Text(), nullable=True),
        sa.Column("original_name", sa.Text(), nullable=False),
        sa.Column("relative_path", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_unique_constraint("uq_artifacts_sha256", "artifacts", ["sha256"])

    op.create_table(
        "ingest_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source_type", sa.Text(), nullable=False),
        sa.Column("original_filename", sa.Text(), nullable=False),
        sa.Column("status", ingest_enum, nullable=False, server_default="queued"),
        sa.Column("progress", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("stats", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("artifact_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("artifacts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_ingest_jobs_project_created", "ingest_jobs", ["project_id", "created_at"])

    op.execute(
        """
        CREATE OR REPLACE FUNCTION update_findings_search_vector()
        RETURNS trigger AS $$
        BEGIN
          NEW.search_vector :=
            setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
            setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B') ||
            setweight(to_tsvector('english', coalesce(NEW.remediation, '')), 'C');
          NEW.updated_at := now();
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute(
        """
        CREATE OR REPLACE FUNCTION update_instances_search_vector()
        RETURNS trigger AS $$
        BEGIN
          NEW.search_vector := to_tsvector('english', coalesce(NEW.evidence_snippet, ''));
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute(
        """
        CREATE OR REPLACE FUNCTION update_notes_search_vector()
        RETURNS trigger AS $$
        BEGIN
          NEW.search_vector :=
            setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
            setweight(to_tsvector('english', coalesce(NEW.body, '')), 'B');
          NEW.updated_at := now();
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute(
        "CREATE TRIGGER trg_findings_search BEFORE INSERT OR UPDATE ON findings "
        "FOR EACH ROW EXECUTE FUNCTION update_findings_search_vector();"
    )
    op.execute(
        "CREATE TRIGGER trg_instances_search BEFORE INSERT OR UPDATE ON instances "
        "FOR EACH ROW EXECUTE FUNCTION update_instances_search_vector();"
    )
    op.execute(
        "CREATE TRIGGER trg_notes_search BEFORE INSERT OR UPDATE ON notes "
        "FOR EACH ROW EXECUTE FUNCTION update_notes_search_vector();"
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_notes_search ON notes")
    op.execute("DROP TRIGGER IF EXISTS trg_instances_search ON instances")
    op.execute("DROP TRIGGER IF EXISTS trg_findings_search ON findings")
    op.execute("DROP FUNCTION IF EXISTS update_notes_search_vector")
    op.execute("DROP FUNCTION IF EXISTS update_instances_search_vector")
    op.execute("DROP FUNCTION IF EXISTS update_findings_search_vector")

    op.drop_table("ingest_jobs")
    op.drop_table("artifacts")
    op.execute("DROP INDEX IF EXISTS uq_instances_project_finding_asset_service_coalesced")
    op.drop_table("notes")
    op.drop_table("instances")
    op.drop_table("findings")
    op.drop_table("services")
    op.drop_table("assets")
    op.drop_table("projects")

    postgresql.ENUM(name="ingest_status_enum").drop(op.get_bind(), checkfirst=True)
    postgresql.ENUM(name="instance_status_enum").drop(op.get_bind(), checkfirst=True)
    postgresql.ENUM(name="severity_enum").drop(op.get_bind(), checkfirst=True)