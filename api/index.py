"""Vercel serverless function entrypoint."""

import os
import sys

# Ensure backend package is on the sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

from app.main import app  # noqa: E402
