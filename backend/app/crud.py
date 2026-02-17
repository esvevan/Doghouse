from __future__ import annotations

import csv
import io
import ipaddress
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import asc, desc, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.enums import IngestStatus
from app.models import Asset, Finding, IngestJob, Instance, Note, Project, Service
from app.schemas import InstancePatch


def utcnow() -> datetime:
    return datetime.now(UTC)


def normalize_ip(ip: str) -> str:
    return str(ipaddress.ip_address(ip.strip()))


def truncate_evidence(value: str | None) -> str | None:
    if value is None:
        return None
    return value[:65536]


async def create_project(session: AsyncSession, name: str, description: str | None) -> Project:
    project = Project(name=name, description=description)
    session.add(project)
    await session.commit()
    await session.refresh(project)
    return project


async def list_projects(session: AsyncSession) -> list[Project]:
    result = await session.execute(select(Project).order_by(Project.created_at.desc()))
    return list(result.scalars().all())


async def create_ingest_job(
    session: AsyncSession,
    project_id: uuid.UUID,
    source_type: str,
    original_filename: str,
    upload_relative_path: str,
) -> IngestJob:
    job = IngestJob(
        project_id=project_id,
        source_type=source_type,
        original_filename=original_filename,
        status=IngestStatus.queued,
        progress=0,
        stats={"upload_relative_path": upload_relative_path},
    )
    session.add(job)
    await session.commit()
    await session.refresh(job)
    return job


async def get_ingest_job(session: AsyncSession, job_id: uuid.UUID) -> IngestJob | None:
    return await session.get(IngestJob, job_id)


async def list_jobs(session: AsyncSession, project_id: uuid.UUID, limit: int, offset: int) -> tuple[int, list[IngestJob]]:
    total = await session.scalar(select(func.count()).select_from(IngestJob).where(IngestJob.project_id == project_id))
    result = await session.execute(
        select(IngestJob)
        .where(IngestJob.project_id == project_id)
        .order_by(IngestJob.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return int(total or 0), list(result.scalars().all())


async def list_assets(
    session: AsyncSession,
    project_id: uuid.UUID,
    limit: int,
    offset: int,
    search: str | None,
    sort: str,
    order: str,
) -> tuple[int, list[Asset]]:
    sort_map = {
        "ip": Asset.ip,
        "primary_hostname": Asset.primary_hostname,
        "last_seen": Asset.last_seen,
        "first_seen": Asset.first_seen,
    }
    order_fn = asc if order == "asc" else desc
    query = select(Asset).where(Asset.project_id == project_id)
    if search:
        query = query.where(
            func.concat(Asset.ip, " ", func.coalesce(Asset.primary_hostname, "")).ilike(f"%{search}%")
        )
    total = await session.scalar(select(func.count()).select_from(query.subquery()))
    query = query.order_by(order_fn(sort_map.get(sort, Asset.last_seen))).limit(limit).offset(offset)
    result = await session.execute(query)
    return int(total or 0), list(result.scalars().all())


async def list_services(
    session: AsyncSession,
    project_id: uuid.UUID,
    limit: int,
    offset: int,
    port: int | None,
    proto: str | None,
    name: str | None,
    sort: str,
    order: str,
) -> tuple[int, list[Service]]:
    sort_map = {"port": Service.port, "name": Service.name, "last_seen": Service.last_seen}
    order_fn = asc if order == "asc" else desc
    query = select(Service).where(Service.project_id == project_id)
    if port is not None:
        query = query.where(Service.port == port)
    if proto:
        query = query.where(Service.proto == proto)
    if name:
        query = query.where(Service.name.ilike(f"%{name}%"))
    total = await session.scalar(select(func.count()).select_from(query.subquery()))
    query = query.order_by(order_fn(sort_map.get(sort, Service.last_seen))).limit(limit).offset(offset)
    result = await session.execute(query)
    return int(total or 0), list(result.scalars().all())


async def list_findings(
    session: AsyncSession,
    project_id: uuid.UUID,
    limit: int,
    offset: int,
    severity: str | None,
    status: str | None,
    scanner: str | None,
    q: str | None,
    sort: str,
    order: str,
) -> tuple[int, list[Finding]]:
    sort_map = {
        "severity": Finding.severity,
        "updated_at": Finding.updated_at,
        "created_at": Finding.created_at,
        "title": Finding.title,
    }
    order_fn = asc if order == "asc" else desc
    query = select(Finding).where(Finding.project_id == project_id)

    if severity:
        query = query.where(Finding.severity == severity)
    if scanner:
        query = query.where(Finding.scanner == scanner)
    if q:
        query = query.where(Finding.search_vector.op("@@")(func.plainto_tsquery("english", q)))
    if status:
        query = query.join(Instance, Instance.finding_id == Finding.id).where(Instance.status == status).distinct()

    total = await session.scalar(select(func.count()).select_from(query.subquery()))
    query = query.order_by(order_fn(sort_map.get(sort, Finding.updated_at))).limit(limit).offset(offset)
    result = await session.execute(query)
    return int(total or 0), list(result.scalars().all())


async def get_finding_with_instances(
    session: AsyncSession, finding_id: uuid.UUID
) -> tuple[Finding | None, list[Instance]]:
    finding = await session.get(Finding, finding_id)
    if finding is None:
        return None, []
    result = await session.execute(select(Instance).where(Instance.finding_id == finding_id))
    return finding, list(result.scalars().all())


async def patch_instance(session: AsyncSession, instance_id: uuid.UUID, payload: InstancePatch) -> Instance | None:
    instance = await session.get(Instance, instance_id)
    if not instance:
        return None
    if payload.status is not None:
        instance.status = payload.status
    if payload.evidence_snippet is not None:
        instance.evidence_snippet = truncate_evidence(payload.evidence_snippet)
    await session.commit()
    await session.refresh(instance)
    return instance


async def create_note(session: AsyncSession, project_id: uuid.UUID, title: str, body: str) -> Note:
    note = Note(project_id=project_id, title=title, body=body)
    session.add(note)
    await session.commit()
    await session.refresh(note)
    return note


async def list_notes(
    session: AsyncSession,
    project_id: uuid.UUID,
    limit: int,
    offset: int,
    q: str | None,
    sort: str,
    order: str,
) -> tuple[int, list[Note]]:
    sort_map = {"updated_at": Note.updated_at, "created_at": Note.created_at, "title": Note.title}
    order_fn = asc if order == "asc" else desc
    query = select(Note).where(Note.project_id == project_id)
    if q:
        query = query.where(Note.search_vector.op("@@")(func.plainto_tsquery("english", q)))
    total = await session.scalar(select(func.count()).select_from(query.subquery()))
    query = query.order_by(order_fn(sort_map.get(sort, Note.updated_at))).limit(limit).offset(offset)
    result = await session.execute(query)
    return int(total or 0), list(result.scalars().all())


async def get_asset_detail(session: AsyncSession, asset_id: uuid.UUID) -> dict[str, Any] | None:
    asset = await session.get(Asset, asset_id)
    if not asset:
        return None
    services = (
        await session.execute(select(Service).where(Service.asset_id == asset_id).order_by(Service.port.asc()))
    ).scalars().all()
    instances = (
        await session.execute(select(Instance).where(Instance.asset_id == asset_id).order_by(Instance.last_seen.desc()))
    ).scalars().all()
    return {"asset": asset, "services": list(services), "instances": list(instances)}


async def export_rows(
    session: AsyncSession, project_id: uuid.UUID, export_type: str
) -> tuple[list[dict[str, Any]], list[str]]:
    if export_type == "assets":
        rows = (await session.execute(select(Asset).where(Asset.project_id == project_id))).scalars().all()
        data = [
            {
                "id": str(r.id),
                "ip": r.ip,
                "primary_hostname": r.primary_hostname,
                "hostnames": r.hostnames,
                "tags": r.tags,
                "first_seen": r.first_seen.isoformat(),
                "last_seen": r.last_seen.isoformat(),
            }
            for r in rows
        ]
    elif export_type == "services":
        rows = (await session.execute(select(Service).where(Service.project_id == project_id))).scalars().all()
        data = [
            {
                "id": str(r.id),
                "asset_id": str(r.asset_id),
                "proto": r.proto,
                "port": r.port,
                "name": r.name,
                "product": r.product,
                "version": r.version,
                "banner": r.banner,
            }
            for r in rows
        ]
    elif export_type == "findings":
        rows = (await session.execute(select(Finding).where(Finding.project_id == project_id))).scalars().all()
        data = [
            {
                "id": str(r.id),
                "finding_key": r.finding_key,
                "title": r.title,
                "severity": r.severity.value,
                "scanner": r.scanner,
                "scanner_id": r.scanner_id,
            }
            for r in rows
        ]
    elif export_type == "instances":
        rows = (await session.execute(select(Instance).where(Instance.project_id == project_id))).scalars().all()
        data = [
            {
                "id": str(r.id),
                "finding_id": str(r.finding_id),
                "asset_id": str(r.asset_id),
                "service_id": str(r.service_id) if r.service_id else None,
                "status": r.status.value,
                "first_seen": r.first_seen.isoformat(),
                "last_seen": r.last_seen.isoformat(),
            }
            for r in rows
        ]
    else:
        raise ValueError("Invalid export type")

    fields = list(data[0].keys()) if data else []
    return data, fields


def to_csv_bytes(rows: list[dict[str, Any]], fields: list[str]) -> bytes:
    out = io.StringIO()
    writer = csv.DictWriter(out, fieldnames=fields or [])
    if fields:
        writer.writeheader()
        writer.writerows(rows)
    return out.getvalue().encode("utf-8")


async def update_job_status(
    session: AsyncSession,
    job_id: uuid.UUID,
    *,
    status: IngestStatus,
    progress: int | None = None,
    error: str | None = None,
    stats: dict | None = None,
    started_at: datetime | None = None,
    finished_at: datetime | None = None,
    artifact_id: uuid.UUID | None = None,
) -> None:
    values: dict[str, Any] = {"status": status}
    if progress is not None:
        values["progress"] = progress
    if error is not None:
        values["error"] = error
    if stats is not None:
        values["stats"] = stats
    if started_at is not None:
        values["started_at"] = started_at
    if finished_at is not None:
        values["finished_at"] = finished_at
    if artifact_id is not None:
        values["artifact_id"] = artifact_id
    await session.execute(update(IngestJob).where(IngestJob.id == job_id).values(**values))
    await session.commit()