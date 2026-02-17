from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud import get_ingest_job, list_jobs
from app.deps import get_session
from app.schemas import IngestJobOut, PageMeta

router = APIRouter(prefix="/api")


@router.get("/jobs/{job_id}", response_model=IngestJobOut)
async def get_job(job_id: uuid.UUID, session: AsyncSession = Depends(get_session)) -> IngestJobOut:
    row = await get_ingest_job(session, job_id)
    if not row:
        raise HTTPException(status_code=404, detail="Job not found")
    return IngestJobOut.model_validate(row)


@router.get("/projects/{project_id}/jobs")
async def get_project_jobs(
    project_id: uuid.UUID,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_session),
) -> dict:
    total, rows = await list_jobs(session, project_id, limit, offset)
    return {"meta": PageMeta(total=total, limit=limit, offset=offset), "items": [IngestJobOut.model_validate(r) for r in rows]}