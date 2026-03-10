from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app import crud
from app.deps import get_session
from app.schemas import LootCredentialCreate, LootCredentialOut, LootCredentialUpdate, PageMeta

router = APIRouter(prefix="/api")


@router.get("/projects/{project_id}/loot")
async def list_loot(
    project_id: uuid.UUID,
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    q: str | None = None,
    session: AsyncSession = Depends(get_session),
) -> dict:
    total, rows = await crud.list_loot_credentials(session, project_id, limit, offset, q)
    return {
        "meta": PageMeta(total=total, limit=limit, offset=offset),
        "items": [LootCredentialOut.model_validate(r) for r in rows],
    }


@router.post("/projects/{project_id}/loot", response_model=LootCredentialOut)
async def create_loot(
    project_id: uuid.UUID,
    payload: LootCredentialCreate,
    session: AsyncSession = Depends(get_session),
) -> LootCredentialOut:
    row = await crud.create_loot_credential(
        session,
        project_id,
        username=payload.username,
        password=payload.password,
        format=payload.format,
        hash_value=payload.hash,
        host=payload.host,
        service=payload.service,
    )
    return LootCredentialOut.model_validate(row)


@router.patch("/loot/{credential_id}", response_model=LootCredentialOut)
async def update_loot(
    credential_id: uuid.UUID,
    payload: LootCredentialUpdate,
    session: AsyncSession = Depends(get_session),
) -> LootCredentialOut:
    row = await crud.update_loot_credential(
        session,
        credential_id,
        username=payload.username,
        password=payload.password,
        format=payload.format,
        hash_value=payload.hash,
        host=payload.host,
        service=payload.service,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Loot entry not found")
    return LootCredentialOut.model_validate(row)


@router.delete("/loot/{credential_id}", status_code=204)
async def delete_loot(
    credential_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> Response:
    deleted = await crud.delete_loot_credential(session, credential_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Loot entry not found")
    return Response(status_code=204)

