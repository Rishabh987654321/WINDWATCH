"""Fixtures for API testing."""

from collections.abc import AsyncIterator
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from app.config import settings
from app.data.store import store
from app.main import app

MINI_SNAPSHOT_DIR = Path(__file__).resolve().parent.parent / "fixtures" / "snapshot_mini"
REAL_SNAPSHOT_DIR = Path(settings.resolved_snapshot_dir())


@pytest.fixture
def mini_store() -> None:
    """Ensure DataStore is loaded with mini fixture snapshot."""
    store.load(str(MINI_SNAPSHOT_DIR))
    assert store.is_ready, f"Mini store failed to load: {store.load_error}"


@pytest.fixture
def real_store() -> None:
    """Ensure DataStore is loaded with real snapshot."""
    store.load(str(REAL_SNAPSHOT_DIR))
    assert store.is_ready, f"Real store failed to load: {store.load_error}"


@pytest.fixture
async def client(mini_store: None) -> AsyncIterator[AsyncClient]:
    """AsyncClient using in-memory ASGI transport on mini snapshot."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def uninitialized_client() -> AsyncIterator[AsyncClient]:
    """AsyncClient with empty/unready store for 503 testing."""
    prev_state = store.is_ready
    prev_err = store.load_error
    store.is_ready = False
    store.load_error = "Snapshot not loaded"
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            yield ac
    finally:
        store.is_ready = prev_state
        store.load_error = prev_err
