from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app import crud
from app.deps import get_session
from app.schemas import FindingDetailOut, FindingOut, InstanceOut, PageMeta

router = APIRouter(prefix="/api")


@router.get("/projects/{project_id}/findings")
async def list_findings(
    project_id: uuid.UUID,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    severity: str | None = None,
    status: str | None = None,
    scanner: str | None = None,
    q: str | None = None,
    sort: str = "updated_at",
    order: str = "desc",
    session: AsyncSession = Depends(get_session),
) -> dict:
    total, rows = await crud.list_findings(
        session, project_id, limit, offset, severity, status, scanner, q, sort, order
    )
    return {
        "meta": PageMeta(total=total, limit=limit, offset=offset),
        "items": [FindingOut.model_validate(r) for r in rows],
    }


@router.get("/findings/{finding_id}", response_model=FindingDetailOut)
async def get_finding(finding_id: uuid.UUID, session: AsyncSession = Depends(get_session)) -> FindingDetailOut:
    finding, instances = await crud.get_finding_with_instances(session, finding_id)
    if finding is None:
        raise HTTPException(status_code=404, detail="Finding not found")
    return FindingDetailOut(
        **FindingOut.model_validate(finding).model_dump(),
        instances=[InstanceOut.model_validate(i) for i in instances],
    )