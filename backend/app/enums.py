from __future__ import annotations

from enum import StrEnum


class Severity(StrEnum):
    info = "info"
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class InstanceStatus(StrEnum):
    open = "open"
    closed = "closed"
    accepted = "accepted"
    false_positive = "false_positive"


class IngestStatus(StrEnum):
    queued = "queued"
    running = "running"
    succeeded = "succeeded"
    failed = "failed"