from __future__ import annotations

import shutil
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app import crud
from app.config import settings
from app.deps import get_session
from app.schemas import (
    DomainCreate,
    DomainFindingCreate,
    DomainFindingOut,
    DomainOut,
    DomainPatch,
    DomainUserListOut,
)
from app.services.artifacts import store_file_as_gzip_artifact
from app.services.tool_outputs import read_preview_text

router = APIRouter(prefix="/api")


@router.post("/projects/{project_id}/domains", response_model=DomainOut)
async def create_domain(
    project_id: uuid.UUID,
    payload: DomainCreate,
    session: AsyncSession = Depends(get_session),
) -> DomainOut:
    row = await crud.create_domain(session, project_id, payload.name)
    return DomainOut.model_validate(row)


@router.get("/projects/{project_id}/domains", response_model=list[DomainOut])
async def list_domains(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> list[DomainOut]:
    rows = await crud.list_domains(session, project_id)
    return [DomainOut.model_validate(row) for row in rows]


@router.get("/domains/{domain_id}")
async def get_domain_detail(domain_id: uuid.UUID, session: AsyncSession = Depends(get_session)) -> dict:
    payload = await crud.get_domain_detail(session, domain_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="Domain not found")
    return {
        "domain": DomainOut.model_validate(payload["domain"]),
        "findings": [DomainFindingOut.model_validate(row) for row in payload["findings"]],
        "user_lists": [DomainUserListOut.model_validate(row) for row in payload["user_lists"]],
    }


@router.patch("/domains/{domain_id}", response_model=DomainOut)
async def patch_domain(
    domain_id: uuid.UUID,
    payload: DomainPatch,
    session: AsyncSession = Depends(get_session),
) -> DomainOut:
    row = await crud.patch_domain(session, domain_id, note=payload.note)
    if row is None:
        raise HTTPException(status_code=404, detail="Domain not found")
    return DomainOut.model_validate(row)


@router.post("/domains/{domain_id}/findings", response_model=DomainFindingOut)
async def add_domain_finding(
    domain_id: uuid.UUID,
    payload: DomainFindingCreate,
    session: AsyncSession = Depends(get_session),
) -> DomainFindingOut:
    row = await crud.create_domain_finding(
        session,
        domain_id=domain_id,
        title=payload.title,
        severity=payload.severity.value,
        description=payload.description,
        finding_detail=payload.finding_detail,
    )
    return DomainFindingOut.model_validate(row)


@router.post("/domains/{domain_id}/user-lists")
async def upload_domain_user_list(
    domain_id: uuid.UUID,
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
) -> DomainUserListOut:
    domain_payload = await crud.get_domain_detail(session, domain_id)
    if domain_payload is None:
        raise HTTPException(status_code=404, detail="Domain not found")

    upload_dir = settings.data_dir / "uploads" / "domain-user-lists" / str(uuid.uuid4())
    upload_dir.mkdir(parents=True, exist_ok=True)
    dest = upload_dir / Path(file.filename).name
    with dest.open("wb") as f_out:
        shutil.copyfileobj(file.file, f_out)

    artifact = await store_file_as_gzip_artifact(
        session,
        project_id=domain_payload["domain"].project_id,
        data_dir=settings.data_dir,
        source_file=dest,
        original_name=file.filename,
    )
    preview = read_preview_text(dest)
    row = await crud.create_domain_user_list(
        session,
        domain_id=domain_id,
        artifact_id=artifact.id,
        original_filename=file.filename,
        preview_text=preview,
    )
    return DomainUserListOut.model_validate(row)
