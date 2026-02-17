from __future__ import annotations

import json
import os
import secrets
from pathlib import Path
from urllib.parse import urlparse

from fastapi import Header, HTTPException, Request


LOCAL_HOSTS = {"127.0.0.1", "::1", "localhost", "::ffff:127.0.0.1"}


def ensure_local_bind(host: str, dev_allow_nonlocal: bool) -> None:
    if host not in {"127.0.0.1", "::1", "localhost"} and not dev_allow_nonlocal:
        raise RuntimeError(
            "Refusing to run with non-local HOST. Set DEV_ALLOW_NONLOCAL=true only for dev."
        )


def load_or_create_token(config_path: Path) -> str:
    config_path.parent.mkdir(parents=True, exist_ok=True)
    if config_path.exists():
        data = json.loads(config_path.read_text(encoding="utf-8"))
        token = data.get("api_token")
        if isinstance(token, str) and token:
            return token

    token = secrets.token_urlsafe(48)
    config_path.write_text(json.dumps({"api_token": token}, indent=2), encoding="utf-8")
    try:
        os.chmod(config_path, 0o600)
    except OSError:
        pass
    return token


def _is_local_request(request: Request) -> bool:
    client_host = request.client.host if request.client else ""
    return client_host in LOCAL_HOSTS


def _is_same_origin(request: Request) -> bool:
    host = request.headers.get("host", "")
    origin = request.headers.get("origin")
    if not origin:
        return True
    parsed = urlparse(origin)
    return parsed.netloc == host


async def require_api_token(
    request: Request,
    x_api_token: str | None = Header(default=None),
) -> None:
    expected = request.app.state.api_token
    if x_api_token != expected:
        raise HTTPException(status_code=401, detail="Invalid API token")


def assert_bootstrap_allowed(request: Request) -> None:
    if not _is_local_request(request):
        raise HTTPException(status_code=403, detail="Bootstrap allowed only from localhost")
    if not _is_same_origin(request):
        raise HTTPException(status_code=403, detail="Bootstrap requires same-origin request")