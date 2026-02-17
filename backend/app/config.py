from __future__ import annotations

from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "dev"
    database_url: str
    host: str = "127.0.0.1"
    port: int = 8000
    dev_allow_nonlocal: bool = False
    data_dir: Path = Path("../data")
    frontend_dist_dir: Path = Path("../frontend/dist")
    dev_frontend_origins: str = "http://127.0.0.1:5173,http://localhost:5173"
    log_level: str = "INFO"

    @field_validator("data_dir", "frontend_dist_dir", mode="before")
    @classmethod
    def _normalize_path(cls, value: str | Path) -> Path:
        return Path(value)


settings = Settings()