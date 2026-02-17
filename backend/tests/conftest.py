from __future__ import annotations

import os

import pytest


@pytest.fixture(scope="session")
def test_db_url() -> str | None:
    return os.getenv("TEST_DATABASE_URL")