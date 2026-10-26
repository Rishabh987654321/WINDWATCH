"""Export OpenAPI JSON schema from FastAPI app with deterministic formatting."""

import json
import os
import sys
from pathlib import Path

# Ensure backend is in python path
ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR / "backend"))

from app.main import app

OUT_PATH = ROOT_DIR / "frontend" / "src" / "api" / "openapi.json"


def export_openapi() -> None:
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    schema = app.openapi()

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(schema, f, indent=2, sort_keys=True)
        f.write("\n")

    print(f"Exported OpenAPI schema to {OUT_PATH}")


if __name__ == "__main__":
    export_openapi()
