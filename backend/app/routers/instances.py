from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud import patch_instance
from app.deps import get_session
from app.schemas import InstanceOut, InstancePatch

router = APIRouter(prefix="/api")


@router.patch("/instances/{instance_id}", response_model=InstanceOut)
async def patch_instance_route(
    instance_id: uuid.UUID,
    payload: InstancePatch,
    session: AsyncSession = Depends(get_session),
) -> InstanceOut:
    row = await patch_instance(session, instance_id, payload)
    if not row:
        raise HTTPException(status_code=404, detail="Instance not found")
    return InstanceOut.model_validate(row)