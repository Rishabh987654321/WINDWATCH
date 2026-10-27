"""Vercel serverless function entrypoint."""

import os
import sys

# Ensure workspace root and backend directory are on sys.path
root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
backend_dir = os.path.join(root_dir, "backend")

for path in [backend_dir, root_dir]:
    if path not in sys.path:
        sys.path.insert(0, path)

from app.main import app  # noqa: E402
