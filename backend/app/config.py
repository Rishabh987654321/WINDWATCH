"""Application configuration via pydantic-settings."""

import os
from datetime import date

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """WindWatch application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "WindWatch"
    app_version: str = "0.1.0"
    app_env: str = "prod"
    log_level: str = "INFO"

    snapshot_dir: str = "backend/data/snapshot"
    day_ahead_cutoff_local: str = "09:00"
    eval_window_from: date = date(2026, 1, 1)
    eval_window_to: date = date(2026, 1, 31)
    warmup_start: date = date(2025, 12, 1)

    risk_quantile_default: float = 0.90
    risk_window_days_default: int = 28
    risk_min_days: int = 7

    cors_origins: list[str] | str = Field(default_factory=list)
    admin_token: str = ""

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: object) -> list[str]:
        if not v:
            return []
        if isinstance(v, str):
            clean = v.strip()
            if not clean:
                return []
            if clean.startswith("[") and clean.endswith("]"):
                import json

                try:
                    loaded = json.loads(clean)
                    if isinstance(loaded, list):
                        return [str(origin).strip() for origin in loaded if str(origin).strip()]
                except Exception:
                    pass
            return [origin.strip() for origin in clean.split(",") if origin.strip()]
        if isinstance(v, list):
            return [str(origin).strip() for origin in v if str(origin).strip()]
        return []

    def resolved_snapshot_dir(self) -> str:
        """Resolve snapshot directory relative to workspace or backend directory."""
        if os.path.isabs(self.snapshot_dir) and os.path.exists(self.snapshot_dir):
            return self.snapshot_dir

        candidates = [
            self.snapshot_dir,
            os.path.join("backend", self.snapshot_dir),
            os.path.join("..", self.snapshot_dir),
            os.path.join(os.path.dirname(__file__), "..", "data", "snapshot"),
        ]
        for c in candidates:
            if os.path.exists(c) and (
                os.path.exists(os.path.join(c, "manifest.json"))
                or os.path.exists(os.path.join(c, "actuals.parquet"))
            ):
                return os.path.abspath(c)

        # Fallback to absolute path from current file
        return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "snapshot"))


settings = Settings()
