from __future__ import annotations

from pathlib import Path

import pytest

from app.ingest.adapters.nessus import parse_nessus_xml
from app.ingest.adapters.nmap import parse_nmap_xml


@pytest.fixture
def sample_path() -> callable:
    base = Path(__file__).parent / "fixtures"

    def _get(name: str) -> Path:
        return base / name

    return _get


def test_parse_nmap(sample_path):
    rows = list(parse_nmap_xml(str(sample_path("nmap_sample.xml"))))
    assert any(getattr(r, "ip", None) == "192.168.1.10" for r in rows)
    assert any(getattr(r, "port", None) == 80 for r in rows)


def test_parse_nessus(sample_path):
    rows = list(parse_nessus_xml(str(sample_path("nessus_sample.xml"))))
    assert any(getattr(r, "finding_key", "").startswith("nessus:10267") for r in rows)
    assert any(getattr(r, "asset_ip", None) == "192.168.1.20" for r in rows)