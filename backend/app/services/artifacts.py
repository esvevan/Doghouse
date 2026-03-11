from __future__ import annotations

import gzip
import hashlib
import mimetypes
import shutil
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Artifact, IngestJob, ToolOutput


def _artifact_relpath(sha256_hex: str) -> str:
    return f"artifacts/{sha256_hex[0:2]}/{sha256_hex[2:4]}/{sha256_hex}"


def _hash_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        while chunk := f.read(1024 * 1024):
            h.update(chunk)
    return h.hexdigest()


def gzip_copy(src: Path, dst: Path) -> int:
    dst.parent.mkdir(parents=True, exist_ok=True)
    with src.open("rb") as f_in, gzip.open(dst, "wb") as f_out:
        shutil.copyfileobj(f_in, f_out)
    return dst.stat().st_size


async def store_file_as_gzip_artifact(
    session: AsyncSession,
    *,
    project_id,
    data_dir: Path,
    source_file: Path,
    original_name: str,
) -> Artifact:
    tmp = data_dir / "tmp" / f"{source_file.name}.gz"
    tmp.parent.mkdir(parents=True, exist_ok=True)
    size = gzip_copy(source_file, tmp)
    sha = _hash_file(tmp)

    existing = await session.scalar(select(Artifact).where(Artifact.sha256 == sha))
    if existing:
        tmp.unlink(missing_ok=True)
        return existing

    rel = _artifact_relpath(sha)
    final_path = data_dir / rel
    final_path.parent.mkdir(parents=True, exist_ok=True)
    tmp.replace(final_path)

    artifact = Artifact(
        project_id=project_id,
        sha256=sha,
        size=size,
        mime=mimetypes.guess_type(original_name)[0] or "application/gzip",
        original_name=original_name,
        relative_path=rel,
    )
    session.add(artifact)
    await session.commit()
    await session.refresh(artifact)
    return artifact


async def delete_artifact_if_unreferenced(
    session: AsyncSession,
    *,
    artifact_id,
    data_dir: Path,
) -> None:
    artifact = await session.get(Artifact, artifact_id)
    if artifact is None:
        return

    tool_output_refs = await session.scalar(
        select(func.count()).select_from(ToolOutput).where(ToolOutput.artifact_id == artifact_id)
    )
    ingest_refs = await session.scalar(
        select(func.count()).select_from(IngestJob).where(IngestJob.artifact_id == artifact_id)
    )
    if int(tool_output_refs or 0) > 0 or int(ingest_refs or 0) > 0:
        return

    file_path = data_dir / artifact.relative_path
    file_path.unlink(missing_ok=True)
    await session.delete(artifact)
    await session.commit()
