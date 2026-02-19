from __future__ import annotations

import asyncio
import contextlib
import logging
import uuid
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.crud import truncate_evidence, update_job_status, utcnow
from app.enums import IngestStatus, InstanceStatus, Severity
from app.ingest.adapters.nessus import parse_nessus_xml
from app.ingest.adapters.nmap import parse_nmap_xml
from app.ingest.normalize import AssetRecord, FindingRecord, InstanceRecord, ServiceRecord
from app.models import Asset, Finding, IngestJob, Instance, Service

log = logging.getLogger(__name__)


class IngestRunner:
    def __init__(self, sessionmaker: async_sessionmaker[AsyncSession], data_dir: Path):
        self.sessionmaker = sessionmaker
        self.data_dir = data_dir
        self.queue: asyncio.Queue[uuid.UUID] = asyncio.Queue()
        self._task: asyncio.Task | None = None
        self._stop = asyncio.Event()

    async def start(self) -> None:
        self._stop.clear()
        self._task = asyncio.create_task(self._loop(), name="ingest-runner")

    async def stop(self) -> None:
        self._stop.set()
        if self._task:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task

    async def enqueue(self, job_id: uuid.UUID) -> None:
        await self.queue.put(job_id)

    async def _loop(self) -> None:
        while not self._stop.is_set():
            job_id = await self.queue.get()
            try:
                await self._process_job(job_id)
            except Exception as exc:  # noqa: BLE001
                log.exception("ingest job failed", extra={"job_id": str(job_id)})
                async with self.sessionmaker() as session:
                    await update_job_status(
                        session,
                        job_id,
                        status=IngestStatus.failed,
                        progress=100,
                        error=str(exc),
                        finished_at=utcnow(),
                    )

    async def _process_job(self, job_id: uuid.UUID) -> None:
        async with self.sessionmaker() as session:
            job = await session.get(IngestJob, job_id)
            if not job:
                return
            stats = dict(job.stats or {})
            upload_rel = stats.get("upload_relative_path")
            if not upload_rel:
                raise RuntimeError("job missing upload path")

            await update_job_status(
                session,
                job_id,
                status=IngestStatus.running,
                progress=1,
                started_at=utcnow(),
            )

            upload_path = self.data_dir / upload_rel
            if not upload_path.exists():
                raise RuntimeError("upload file not found")

            parser = parse_nmap_xml if job.source_type == "nmap" else parse_nessus_xml
            counters = {"assets": 0, "services": 0, "findings": 0, "instances": 0}

            for idx, rec in enumerate(parser(str(upload_path)), start=1):
                if isinstance(rec, AssetRecord):
                    await self._upsert_asset(session, job.project_id, rec)
                    counters["assets"] += 1
                elif isinstance(rec, ServiceRecord):
                    await self._upsert_service(session, job.project_id, rec)
                    counters["services"] += 1
                elif isinstance(rec, FindingRecord):
                    await self._upsert_finding(session, job.project_id, rec)
                    counters["findings"] += 1
                elif isinstance(rec, InstanceRecord):
                    await self._upsert_instance(session, job.project_id, rec)
                    counters["instances"] += 1

                if idx % 250 == 0:
                    await session.commit()
                    await update_job_status(
                        session,
                        job_id,
                        status=IngestStatus.running,
                        progress=min(95, 1 + idx // 250),
                        stats=counters,
                    )

            await session.commit()
            await update_job_status(
                session,
                job_id,
                status=IngestStatus.succeeded,
                progress=100,
                stats=counters,
                finished_at=utcnow(),
            )

    async def _upsert_asset(self, session: AsyncSession, project_id: uuid.UUID, rec: AssetRecord) -> Asset:
        row = await session.scalar(
            select(Asset).where(Asset.project_id == project_id, Asset.ip == rec.ip)
        )
        if row:
            names = set(row.hostnames or [])
            names.update(rec.hostnames)
            row.hostnames = sorted(names)
            if rec.primary_hostname and not row.primary_hostname:
                row.primary_hostname = rec.primary_hostname
            if rec.os_name and not row.os_name:
                row.os_name = rec.os_name
            row.last_seen = rec.seen_at
            return row
        row = Asset(
            project_id=project_id,
            ip=rec.ip,
            primary_hostname=rec.primary_hostname,
            hostnames=rec.hostnames,
            os_name=rec.os_name,
            tags=[],
            first_seen=rec.seen_at,
            last_seen=rec.seen_at,
        )
        session.add(row)
        return row

    async def _upsert_service(self, session: AsyncSession, project_id: uuid.UUID, rec: ServiceRecord) -> Service | None:
        asset = await session.scalar(
            select(Asset).where(Asset.project_id == project_id, Asset.ip == rec.asset_ip)
        )
        if not asset:
            return None
        row = await session.scalar(
            select(Service).where(
                Service.asset_id == asset.id, Service.proto == rec.proto, Service.port == rec.port
            )
        )
        if row:
            row.name = rec.name or row.name
            row.product = rec.product or row.product
            row.version = rec.version or row.version
            row.banner = rec.banner or row.banner
            row.last_seen = rec.seen_at
            return row
        row = Service(
            project_id=project_id,
            asset_id=asset.id,
            proto=rec.proto,
            port=rec.port,
            name=rec.name,
            product=rec.product,
            version=rec.version,
            banner=rec.banner,
            first_seen=rec.seen_at,
            last_seen=rec.seen_at,
        )
        session.add(row)
        return row

    async def _upsert_finding(self, session: AsyncSession, project_id: uuid.UUID, rec: FindingRecord) -> Finding:
        row = await session.scalar(
            select(Finding).where(Finding.project_id == project_id, Finding.finding_key == rec.finding_key)
        )
        if row:
            row.title = rec.title
            row.severity = Severity(rec.severity)
            row.description = rec.description
            row.remediation = rec.remediation
            row.references = rec.references
            row.scanner = rec.scanner
            row.scanner_id = rec.scanner_id
            row.updated_at = utcnow()
            return row
        row = Finding(
            project_id=project_id,
            finding_key=rec.finding_key,
            title=rec.title,
            severity=Severity(rec.severity),
            description=rec.description,
            remediation=rec.remediation,
            references=rec.references,
            scanner=rec.scanner,
            scanner_id=rec.scanner_id,
        )
        session.add(row)
        return row

    async def _upsert_instance(self, session: AsyncSession, project_id: uuid.UUID, rec: InstanceRecord) -> Instance | None:
        asset = await session.scalar(
            select(Asset).where(Asset.project_id == project_id, Asset.ip == rec.asset_ip)
        )
        finding = await session.scalar(
            select(Finding).where(Finding.project_id == project_id, Finding.finding_key == rec.finding_key)
        )
        if not asset or not finding:
            return None

        service_id = None
        if rec.service_proto and rec.service_port:
            svc = await session.scalar(
                select(Service).where(
                    Service.asset_id == asset.id,
                    Service.proto == rec.service_proto,
                    Service.port == rec.service_port,
                )
            )
            service_id = svc.id if svc else None

        row = await session.scalar(
            select(Instance).where(
                Instance.project_id == project_id,
                Instance.finding_id == finding.id,
                Instance.asset_id == asset.id,
                Instance.service_id.is_(service_id) if service_id is None else Instance.service_id == service_id,
            )
        )
        if row:
            row.last_seen = rec.seen_at
            if rec.evidence_snippet is not None:
                row.evidence_snippet = truncate_evidence(rec.evidence_snippet)
            return row

        row = Instance(
            project_id=project_id,
            finding_id=finding.id,
            asset_id=asset.id,
            service_id=service_id,
            status=InstanceStatus(rec.status),
            evidence_snippet=truncate_evidence(rec.evidence_snippet),
            first_seen=rec.seen_at,
            last_seen=rec.seen_at,
        )
        session.add(row)
        return row
