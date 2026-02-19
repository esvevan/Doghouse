from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator

from app.enums import IngestStatus, InstanceStatus, Severity


class PageMeta(BaseModel):
    total: int
    limit: int
    offset: int


class ProjectCreate(BaseModel):
    name: str
    description: str | None = None


class ProjectOut(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    created_at: datetime

    class Config:
        from_attributes = True


class AssetOut(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    ip: str
    primary_hostname: str | None
    hostnames: list[str]
    tags: list[str]
    note: str | None = None
    tested: bool = False
    os_name: str | None = None
    open_ports_override: list[int] | None = None
    first_seen: datetime
    last_seen: datetime

    @field_validator("ip", mode="before")
    @classmethod
    def _coerce_ip_to_str(cls, value: Any) -> str:
        return str(value)

    class Config:
        from_attributes = True


class ServiceOut(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    asset_id: uuid.UUID
    proto: str
    port: int
    name: str | None
    product: str | None
    version: str | None
    banner: str | None
    first_seen: datetime
    last_seen: datetime

    class Config:
        from_attributes = True


class FindingOut(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    finding_key: str
    title: str
    severity: Severity
    description: str | None
    remediation: str | None
    references: Any
    scanner: str
    scanner_id: str | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class InstanceOut(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    finding_id: uuid.UUID
    asset_id: uuid.UUID
    service_id: uuid.UUID | None
    status: InstanceStatus
    evidence_snippet: str | None
    analyst_note: str | None = None
    first_seen: datetime
    last_seen: datetime

    class Config:
        from_attributes = True


class FindingDetailOut(FindingOut):
    instances: list[InstanceOut]


class NoteCreate(BaseModel):
    title: str
    body: str


class NoteOut(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    title: str
    body: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class IngestJobOut(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    source_type: str
    original_filename: str
    status: IngestStatus
    progress: int = Field(ge=0, le=100)
    stats: dict
    error: str | None
    artifact_id: uuid.UUID | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None

    class Config:
        from_attributes = True


class InstancePatch(BaseModel):
    status: InstanceStatus | None = None
    evidence_snippet: str | None = None
    analyst_note: str | None = None


class AssetPatch(BaseModel):
    note: str | None = None
    tested: bool | None = None
    ip: str | None = None
    primary_hostname: str | None = None
    os_name: str | None = None
    open_ports_override: list[int] | None = None
