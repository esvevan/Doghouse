from __future__ import annotations

import csv
import io
import ipaddress
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import asc, desc, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.enums import IngestStatus, InstanceStatus, Severity
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
    assets = list((await session.execute(query)).scalars().all())
    if not assets:
        return int(total or 0), []

    asset_ids = [a.id for a in assets]
    ports_rows = await session.execute(
        select(Service.asset_id, Service.port).where(Service.asset_id.in_(asset_ids)).order_by(Service.port.asc())
    )
    ports_map: dict[uuid.UUID, list[int]] = {}
    for asset_id, port in ports_rows.all():
        ports_map.setdefault(asset_id, [])
        if port not in ports_map[asset_id]:
            ports_map[asset_id].append(port)

    vuln_rows = await session.execute(
        select(Instance.asset_id, Finding.severity, func.count())
        .join(Finding, Finding.id == Instance.finding_id)
        .where(Instance.asset_id.in_(asset_ids))
        .group_by(Instance.asset_id, Finding.severity)
    )
    vuln_map: dict[uuid.UUID, dict[str, int]] = {}
    for asset_id, severity, count in vuln_rows.all():
        vuln_map.setdefault(
            asset_id, {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}
        )
        vuln_map[asset_id][severity.value if hasattr(severity, "value") else str(severity)] = int(count)

    rows: list[dict[str, Any]] = []
    for a in assets:
        counts = vuln_map.get(a.id, {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0})
        rows.append(
            {
                "id": str(a.id),
                "project_id": str(a.project_id),
                "ip": str(a.ip),
                "primary_hostname": a.primary_hostname,
                "os_name": a.os_name,
                "tested": a.tested,
                "open_ports": a.open_ports_override if a.open_ports_override is not None else ports_map.get(a.id, []),
                "vuln_counts": {
                    "critical": counts.get("critical", 0),
                    "high": counts.get("high", 0),
                    "medium": counts.get("medium", 0),
                    "low": counts.get("low", 0),
                    "info": counts.get("info", 0),
                },
            }
        )
    return int(total or 0), rows


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


async def list_service_summary(
    session: AsyncSession,
    project_id: uuid.UUID,
    limit: int,
    offset: int,
    port: str | None,
    proto: str | None,
    service: str | None,
    product: str | None,
    sort: str,
    order: str,
) -> tuple[int, list[dict[str, Any]], list[str]]:
    base = (
        select(Service, Asset.ip)
        .join(Asset, Asset.id == Service.asset_id)
        .where(Service.project_id == project_id)
    )

    if port:
        if port.isdigit():
            base = base.where(Service.port == int(port))
    if proto:
        base = base.where(Service.proto.ilike(f"%{proto}%"))
    if service:
        base = base.where(func.coalesce(Service.name, "").ilike(f"%{service}%"))
    if product:
        base = base.where(func.coalesce(Service.product, "").ilike(f"%{product}%"))

    hosts_rows = await session.execute(
        select(func.distinct(Asset.ip))
        .select_from(Service)
        .join(Asset, Asset.id == Service.asset_id)
        .where(Service.project_id == project_id)
        .where(Service.port == int(port) if port and port.isdigit() else True)
        .where(Service.proto.ilike(f"%{proto}%") if proto else True)
        .where(func.coalesce(Service.name, "").ilike(f"%{service}%") if service else True)
        .where(func.coalesce(Service.product, "").ilike(f"%{product}%") if product else True)
        .order_by(Asset.ip.asc())
    )
    hosts = [str(x[0]) for x in hosts_rows.all() if x[0] is not None]

    grouped = (
        select(
            Service.port.label("port"),
            Service.proto.label("proto"),
            func.coalesce(Service.name, "").label("service"),
            func.coalesce(Service.product, "").label("product"),
            func.count(func.distinct(Service.asset_id)).label("host_count"),
        )
        .where(Service.project_id == project_id)
    )
    if port and port.isdigit():
        grouped = grouped.where(Service.port == int(port))
    if proto:
        grouped = grouped.where(Service.proto.ilike(f"%{proto}%"))
    if service:
        grouped = grouped.where(func.coalesce(Service.name, "").ilike(f"%{service}%"))
    if product:
        grouped = grouped.where(func.coalesce(Service.product, "").ilike(f"%{product}%"))

    grouped = grouped.group_by(
        Service.port,
        Service.proto,
        func.coalesce(Service.name, ""),
        func.coalesce(Service.product, ""),
    )
    grouped_sub = grouped.subquery()

    sort_map = {
        "port": grouped_sub.c.port,
        "proto": grouped_sub.c.proto,
        "service": grouped_sub.c.service,
        "product": grouped_sub.c.product,
        "host_count": grouped_sub.c.host_count,
    }
    order_fn = asc if order == "asc" else desc

    total = await session.scalar(select(func.count()).select_from(grouped_sub))
    rows = await session.execute(
        select(grouped_sub)
        .order_by(order_fn(sort_map.get(sort, grouped_sub.c.port)))
        .limit(limit)
        .offset(offset)
    )
    items = [
        {
            "port": int(r.port),
            "proto": str(r.proto),
            "service": str(r.service) if r.service else "",
            "product": str(r.product) if r.product else "",
            "host_count": int(r.host_count),
        }
        for r in rows.all()
    ]
    return int(total or 0), items, hosts


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
) -> tuple[Finding | None, list[dict[str, Any]]]:
    finding = await session.get(Finding, finding_id)
    if finding is None:
        return None, []
    result = await session.execute(
        select(Instance, Asset, Service)
        .join(Asset, Asset.id == Instance.asset_id)
        .outerjoin(Service, Service.id == Instance.service_id)
        .where(Instance.finding_id == finding_id)
        .order_by(Instance.last_seen.desc())
    )
    rows: list[dict[str, Any]] = []
    for inst, asset, service in result.all():
        rows.append(
            {
                "id": str(inst.id),
                "asset_id": str(inst.asset_id),
                "asset_ip": asset.ip,
                "asset_primary_hostname": asset.primary_hostname,
                "service_id": str(inst.service_id) if inst.service_id else None,
                "service_proto": service.proto if service else None,
                "service_port": service.port if service else None,
                "status": inst.status.value,
                "evidence_snippet": inst.evidence_snippet,
                "analyst_note": inst.analyst_note,
                "first_seen": inst.first_seen.isoformat(),
                "last_seen": inst.last_seen.isoformat(),
            }
        )
    return finding, rows


async def patch_instance(session: AsyncSession, instance_id: uuid.UUID, payload: InstancePatch) -> Instance | None:
    instance = await session.get(Instance, instance_id)
    if not instance:
        return None
    if payload.status is not None:
        instance.status = payload.status
    if payload.evidence_snippet is not None:
        instance.evidence_snippet = truncate_evidence(payload.evidence_snippet)
    if payload.analyst_note is not None:
        instance.analyst_note = payload.analyst_note
    await session.commit()
    await session.refresh(instance)
    return instance


async def delete_instance(session: AsyncSession, instance_id: uuid.UUID) -> bool:
    instance = await session.get(Instance, instance_id)
    if not instance:
        return False
    finding_id = instance.finding_id
    await session.delete(instance)
    await session.flush()

    remaining = await session.scalar(
        select(func.count()).select_from(Instance).where(Instance.finding_id == finding_id)
    )
    if int(remaining or 0) == 0:
        finding = await session.get(Finding, finding_id)
        if finding is not None:
            await session.delete(finding)
    await session.commit()
    return True


async def patch_asset_note(session: AsyncSession, asset_id: uuid.UUID, note: str | None) -> Asset | None:
    asset = await session.get(Asset, asset_id)
    if not asset:
        return None
    asset.note = note
    await session.commit()
    await session.refresh(asset)
    return asset


async def patch_asset(
    session: AsyncSession,
    asset_id: uuid.UUID,
    *,
    note: str | None = None,
    tested: bool | None = None,
    ip: str | None = None,
    primary_hostname: str | None = None,
    os_name: str | None = None,
    open_ports_override: list[int] | None = None,
) -> Asset | None:
    asset = await session.get(Asset, asset_id)
    if not asset:
        return None
    if note is not None:
        asset.note = note
    if tested is not None:
        asset.tested = tested
    if ip is not None:
        asset.ip = normalize_ip(ip)
    if primary_hostname is not None:
        asset.primary_hostname = primary_hostname or None
    if os_name is not None:
        asset.os_name = os_name or None
    if open_ports_override is not None:
        asset.open_ports_override = sorted(set([int(p) for p in open_ports_override]))
    await session.commit()
    await session.refresh(asset)
    return asset


async def create_manual_finding_for_asset(
    session: AsyncSession,
    *,
    asset_id: uuid.UUID,
    title: str,
    service: str | None,
    severity: str,
    description: str | None,
    finding_detail: str | None,
) -> tuple[Finding, Instance]:
    asset = await session.get(Asset, asset_id)
    if not asset:
        raise ValueError("Asset not found")

    finding = Finding(
        project_id=asset.project_id,
        finding_key=f"manual:{uuid.uuid4()}",
        title=title,
        severity=Severity(severity),
        description=description,
        remediation=None,
        references=[],
        scanner="manual",
        scanner_id=None,
    )
    session.add(finding)
    await session.flush()

    combined_detail = finding_detail or ""
    if service:
        combined_detail = f"Service: {service}\n\n{combined_detail}".strip()

    instance = Instance(
        project_id=asset.project_id,
        finding_id=finding.id,
        asset_id=asset.id,
        service_id=None,
        status=InstanceStatus.open,
        evidence_snippet=truncate_evidence(combined_detail),
        first_seen=utcnow(),
        last_seen=utcnow(),
    )
    session.add(instance)
    await session.commit()
    await session.refresh(finding)
    await session.refresh(instance)
    return finding, instance


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
    instance_rows = await session.execute(
        select(Instance, Finding, Service)
        .join(Finding, Finding.id == Instance.finding_id)
        .outerjoin(Service, Service.id == Instance.service_id)
        .where(Instance.asset_id == asset_id)
        .order_by(Instance.last_seen.desc())
    )
    findings_by_instance: list[dict[str, Any]] = []
    for inst, finding, service in instance_rows.all():
        findings_by_instance.append(
            {
                "instance_id": str(inst.id),
                "finding_id": str(finding.id),
                "finding_key": finding.finding_key,
                "title": finding.title,
                "severity": finding.severity.value,
                "description": finding.description,
                "scanner": finding.scanner,
                "scanner_id": finding.scanner_id,
                "status": inst.status.value,
                "service_id": str(inst.service_id) if inst.service_id else None,
                "service_proto": service.proto if service else None,
                "service_port": service.port if service else None,
                "evidence_snippet": inst.evidence_snippet,
                "analyst_note": inst.analyst_note,
                "first_seen": inst.first_seen.isoformat(),
                "last_seen": inst.last_seen.isoformat(),
            }
        )
    return {"asset": asset, "services": list(services), "findings": findings_by_instance}


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
