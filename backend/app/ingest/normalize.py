from __future__ import annotations

import ipaddress
from dataclasses import dataclass
from datetime import UTC, datetime


def utcnow() -> datetime:
    return datetime.now(UTC)


def normalize_ip(ip: str) -> str:
    return str(ipaddress.ip_address(ip.strip()))


def normalize_hostname(value: str | None) -> str | None:
    if not value:
        return None
    out = value.strip().lower()
    return out or None


def truncate_evidence(value: str | None) -> str | None:
    if value is None:
        return None
    return value[:65536]


@dataclass(slots=True)
class AssetRecord:
    ip: str
    primary_hostname: str | None
    hostnames: list[str]
    os_name: str | None
    seen_at: datetime


@dataclass(slots=True)
class ServiceRecord:
    asset_ip: str
    proto: str
    port: int
    name: str | None
    product: str | None
    version: str | None
    banner: str | None
    seen_at: datetime


@dataclass(slots=True)
class FindingRecord:
    finding_key: str
    title: str
    severity: str
    description: str | None
    remediation: str | None
    references: list[str]
    scanner: str
    scanner_id: str | None


@dataclass(slots=True)
class InstanceRecord:
    finding_key: str
    asset_ip: str
    service_proto: str | None
    service_port: int | None
    evidence_snippet: str | None
    status: str
    seen_at: datetime
