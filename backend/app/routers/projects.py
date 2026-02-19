from __future__ import annotations

import shutil
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app import crud
from app.config import settings
from app.deps import get_session
from app.schemas import (
    AssetPatch,
    AssetOut,
    IngestJobOut,
    NoteCreate,
    NoteOut,
    PageMeta,
    ProjectCreate,
    ProjectOut,
    ServiceOut,
)
from app.services.artifacts import store_file_as_gzip_artifact

router = APIRouter(prefix="/api")


@router.post("/projects", response_model=ProjectOut)
async def create_project(payload: ProjectCreate, session: AsyncSession = Depends(get_session)) -> ProjectOut:
    project = await crud.create_project(session, payload.name, payload.description)
    return ProjectOut.model_validate(project)


@router.get("/projects", response_model=list[ProjectOut])
async def get_projects(session: AsyncSession = Depends(get_session)) -> list[ProjectOut]:
    rows = await crud.list_projects(session)
    return [ProjectOut.model_validate(r) for r in rows]


@router.post("/projects/{project_id}/imports", response_model=IngestJobOut)
async def import_scan(
    project_id: uuid.UUID,
    request: Request,
    file: UploadFile = File(...),
    source_type: str = Form(...),
    store_source_file: bool = Form(False),
    session: AsyncSession = Depends(get_session),
) -> IngestJobOut:
    source_type = source_type.lower().strip()
    if source_type not in {"nmap", "nessus"}:
        raise HTTPException(status_code=400, detail="source_type must be nmap or nessus")

    temp_dir = settings.data_dir / "uploads"
    temp_dir.mkdir(parents=True, exist_ok=True)

    placeholder_path = f"uploads/pending/{file.filename}"
    job = await crud.create_ingest_job(session, project_id, source_type, file.filename, placeholder_path)

    upload_dir = settings.data_dir / "uploads" / str(job.id)
    upload_dir.mkdir(parents=True, exist_ok=True)
    dest = upload_dir / Path(file.filename).name
    with dest.open("wb") as f_out:
        shutil.copyfileobj(file.file, f_out)

    job.stats = {
        **(job.stats or {}),
        "upload_relative_path": str(dest.relative_to(settings.data_dir)).replace("\\", "/"),
    }
    if store_source_file:
        artifact = await store_file_as_gzip_artifact(
            session,
            project_id=project_id,
            data_dir=settings.data_dir,
            source_file=dest,
            original_name=file.filename,
        )
        job.artifact_id = artifact.id
    await session.commit()
    await session.refresh(job)

    await request.app.state.ingest_runner.enqueue(job.id)
    return IngestJobOut.model_validate(job)


@router.get("/projects/{project_id}/assets")
async def list_assets(
    project_id: uuid.UUID,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    search: str | None = None,
    sort: str = "last_seen",
    order: str = "desc",
    session: AsyncSession = Depends(get_session),
) -> dict:
    total, rows = await crud.list_assets(session, project_id, limit, offset, search, sort, order)
    return {"meta": PageMeta(total=total, limit=limit, offset=offset), "items": rows}


@router.get("/projects/{project_id}/services")
async def list_services(
    project_id: uuid.UUID,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    port: int | None = None,
    proto: str | None = None,
    name: str | None = None,
    sort: str = "last_seen",
    order: str = "desc",
    session: AsyncSession = Depends(get_session),
) -> dict:
    total, rows = await crud.list_services(session, project_id, limit, offset, port, proto, name, sort, order)
    return {"meta": PageMeta(total=total, limit=limit, offset=offset), "items": [ServiceOut.model_validate(r) for r in rows]}


@router.get("/assets/{asset_id}")
async def get_asset_detail(asset_id: uuid.UUID, session: AsyncSession = Depends(get_session)) -> dict:
    payload = await crud.get_asset_detail(session, asset_id)
    if not payload:
        raise HTTPException(status_code=404, detail="Asset not found")
    return {
        "asset": AssetOut.model_validate(payload["asset"]),
        "services": [ServiceOut.model_validate(s) for s in payload["services"]],
        "findings": payload["findings"],
    }


@router.patch("/assets/{asset_id}", response_model=AssetOut)
async def patch_asset(
    asset_id: uuid.UUID,
    payload: AssetPatch,
    session: AsyncSession = Depends(get_session),
) -> AssetOut:
    try:
        row = await crud.patch_asset(
            session,
            asset_id,
            note=payload.note,
            tested=payload.tested,
            ip=payload.ip,
            primary_hostname=payload.primary_hostname,
            os_name=payload.os_name,
            open_ports_override=payload.open_ports_override,
        )
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail="Asset update conflicts with existing host data") from exc
    if not row:
        raise HTTPException(status_code=404, detail="Asset not found")
    return AssetOut.model_validate(row)


@router.post("/projects/{project_id}/notes", response_model=NoteOut)
async def create_note(
    project_id: uuid.UUID,
    payload: NoteCreate,
    session: AsyncSession = Depends(get_session),
) -> NoteOut:
    row = await crud.create_note(session, project_id, payload.title, payload.body)
    return NoteOut.model_validate(row)


@router.get("/projects/{project_id}/notes")
async def list_notes(
    project_id: uuid.UUID,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    q: str | None = None,
    sort: str = "updated_at",
    order: str = "desc",
    session: AsyncSession = Depends(get_session),
) -> dict:
    total, rows = await crud.list_notes(session, project_id, limit, offset, q, sort, order)
    return {"meta": PageMeta(total=total, limit=limit, offset=offset), "items": [NoteOut.model_validate(r) for r in rows]}
