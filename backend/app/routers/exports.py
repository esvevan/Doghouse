from __future__ import annotations

import json
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud import export_rows, to_csv_bytes
from app.deps import get_session

router = APIRouter(prefix="/api")


@router.get("/projects/{project_id}/export")
async def export_project(
    project_id: uuid.UUID,
    type: str = Query(..., pattern="^(findings|instances|assets|services)$"),
    format: str = Query(..., pattern="^(json|csv)$"),
    session: AsyncSession = Depends(get_session),
) -> Response:
    try:
        rows, fields = await export_rows(session, project_id, type)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if format == "json":
        payload = json.dumps(rows, ensure_ascii=True, indent=2).encode("utf-8")
        return Response(
            content=payload,
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="{type}.json"'},
        )

    payload = to_csv_bytes(rows, fields)
    return Response(
        content=payload,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{type}.csv"'},
    )