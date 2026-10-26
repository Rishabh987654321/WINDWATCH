"""Tests ensuring responses never emit NaN or Infinity per AGENTS.md rule 7."""

from typing import Any

import pytest
from httpx import AsyncClient

from tests.api.test_contract import GOLDEN_ENDPOINTS


def assert_no_nan_or_infinity(obj: Any, path: str = "root") -> None:
    """Recursively assert that no NaN, Infinity, or -Infinity values exist."""
    if isinstance(obj, float):
        import math

        assert not math.isnan(obj), f"NaN float found at {path}"
        assert not math.isinf(obj), f"Infinity float found at {path}"
    elif isinstance(obj, str):
        lower = obj.lower()
        assert lower not in ("nan", "infinity", "-infinity", "+infinity"), (
            f"Non-finite string found at {path}: {obj}"
        )
    elif isinstance(obj, dict):
        for k, v in obj.items():
            assert_no_nan_or_infinity(v, f"{path}.{k}")
    elif isinstance(obj, list):
        for i, item in enumerate(obj):
            assert_no_nan_or_infinity(item, f"{path}[{i}]")


@pytest.mark.asyncio
@pytest.mark.parametrize("url", list(GOLDEN_ENDPOINTS.values()))
async def test_no_nan_or_infinity_in_any_response(client: AsyncClient, url: str) -> None:
    """Verify raw JSON text and parsed JSON object contain no NaN/Infinity."""
    resp = await client.get(url)
    assert resp.status_code == 200

    raw_text = resp.text
    # Strict raw substring check for forbidden tokens
    for token in (": NaN", ": -NaN", ": Infinity", ": -Infinity", ": +Infinity"):
        assert token not in raw_text, f"Forbidden JSON token '{token}' found in {url} response"

    data = resp.json()
    assert_no_nan_or_infinity(data)
