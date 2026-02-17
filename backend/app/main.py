from __future__ import annotations

import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.db import SessionLocal, engine
from app.ingest.runner import IngestRunner
from app.logging import configure_logging
from app.routers import exports, findings, instances, jobs, projects
from app.security import assert_bootstrap_allowed, ensure_local_bind, load_or_create_token, require_api_token

configure_logging(settings.log_level)
log = logging.getLogger(__name__)

ensure_local_bind(settings.host, settings.dev_allow_nonlocal)

app = FastAPI(title="Doghouse", version="0.1.0")

if settings.app_env == "dev":
    origins = [o.strip() for o in settings.dev_frontend_origins.split(",") if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
        allow_headers=["*"],
    )


@app.middleware("http")
async def api_token_middleware(request: Request, call_next):
    if request.url.path.startswith("/api/"):
        await require_api_token(request, request.headers.get("X-API-Token"))
    return await call_next(request)


@app.on_event("startup")
async def startup() -> None:
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    (settings.data_dir / "uploads").mkdir(parents=True, exist_ok=True)
    (settings.data_dir / "artifacts").mkdir(parents=True, exist_ok=True)

    config_path = settings.data_dir / "config.json"
    token = load_or_create_token(config_path)
    app.state.api_token = token

    runner = IngestRunner(SessionLocal, settings.data_dir)
    await runner.start()
    app.state.ingest_runner = runner
    engine.app = app


@app.on_event("shutdown")
async def shutdown() -> None:
    runner: IngestRunner = app.state.ingest_runner
    await runner.stop()
    await engine.dispose()


@app.get("/bootstrap")
async def bootstrap(request: Request) -> dict[str, str]:
    assert_bootstrap_allowed(request)
    return {"token": request.app.state.api_token}


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(projects.router)
app.include_router(jobs.router)
app.include_router(findings.router)
app.include_router(instances.router)
app.include_router(exports.router)

frontend_dist = settings.frontend_dist_dir.resolve()
if frontend_dist.exists():
    app.mount("/assets", StaticFiles(directory=str(frontend_dist / "assets")), name="assets")

    @app.get("/{path:path}")
    async def spa(path: str) -> FileResponse:
        index = frontend_dist / "index.html"
        if not index.exists():
            raise HTTPException(status_code=404, detail="Frontend not built")
        return FileResponse(index)