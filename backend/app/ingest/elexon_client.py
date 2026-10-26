"""Elexon BMRS async API client with retry, backoff, and chunk planning."""

import asyncio
import random
from datetime import UTC, date, datetime, timedelta
from typing import Any

import httpx
import structlog

logger = structlog.get_logger(__name__)

BASE_URL = "https://data.elexon.co.uk/bmrs/api/v1"


class ElexonClientError(Exception):
    """Raised when Elexon API requests fail after exhausting retries."""

    pass


def plan_date_chunks(
    start_date: date,
    end_date: date,
    chunk_days: int = 7,
) -> list[tuple[date, date]]:
    """Plan inclusive date chunks for FUELHH settlement dates.

    Args:
        start_date: Start date (inclusive).
        end_date: End date (inclusive).
        chunk_days: Maximum number of days per chunk.

    Returns:
        List of (chunk_start, chunk_end) tuples, each inclusive.
    """
    if start_date > end_date:
        raise ValueError(f"start_date ({start_date}) must be <= end_date ({end_date})")
    if chunk_days < 1:
        raise ValueError("chunk_days must be >= 1")

    chunks: list[tuple[date, date]] = []
    current = start_date
    while current <= end_date:
        chunk_end = min(current + timedelta(days=chunk_days - 1), end_date)
        chunks.append((current, chunk_end))
        current = chunk_end + timedelta(days=1)
    return chunks


def plan_datetime_chunks(
    start_dt: datetime,
    end_dt: datetime,
    chunk_days: int = 7,
) -> list[tuple[datetime, datetime]]:
    """Plan datetime chunks for WINDFOR publish date times.

    Args:
        start_dt: UTC start datetime.
        end_dt: UTC end datetime.
        chunk_days: Maximum number of days per chunk.

    Returns:
        List of (chunk_start, chunk_end) UTC datetime tuples.
    """
    if start_dt.tzinfo is None:
        start_dt = start_dt.replace(tzinfo=UTC)
    if end_dt.tzinfo is None:
        end_dt = end_dt.replace(tzinfo=UTC)

    if start_dt > end_dt:
        raise ValueError(f"start_dt ({start_dt}) must be <= end_dt ({end_dt})")
    if chunk_days < 1:
        raise ValueError("chunk_days must be >= 1")

    chunks: list[tuple[datetime, datetime]] = []
    current = start_dt
    delta = timedelta(days=chunk_days)
    while current < end_dt:
        chunk_end = min(current + delta, end_dt)
        chunks.append((current, chunk_end))
        current = chunk_end
    return chunks


class ElexonAsyncClient:
    """Async HTTP client for Elexon BMRS stream datasets."""

    def __init__(
        self,
        base_url: str = BASE_URL,
        timeout: float = 30.0,
        max_concurrency: int = 4,
        max_retries: int = 5,
        backoff_base: float = 0.5,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.max_retries = max_retries
        self.backoff_base = backoff_base
        self.semaphore = asyncio.Semaphore(max_concurrency)
        self._external_client = client is not None
        self.client = client or httpx.AsyncClient(
            timeout=timeout,
            headers={"User-Agent": "WindWatch-Ingest/1.0", "Accept": "application/json"},
        )

    async def close(self) -> None:
        """Close client if owned."""
        if not self._external_client:
            await self.client.aclose()

    async def __aenter__(self) -> "ElexonAsyncClient":
        return self

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        await self.close()

    async def _fetch_with_retry(
        self,
        url: str,
        params: dict[str, Any],
        dataset_name: str,
    ) -> list[dict[str, Any]]:
        """Fetch endpoint with exponential backoff and jitter."""
        attempts = 0
        last_error: Exception | None = None

        while attempts < self.max_retries:
            attempts += 1
            t0 = asyncio.get_event_loop().time()
            try:
                async with self.semaphore:
                    resp = await self.client.get(url, params=params)

                t_ms = int((asyncio.get_event_loop().time() - t0) * 1000)

                # Success
                if resp.status_code == 200:
                    data = resp.json()
                    logger.info(
                        "elexon_fetch_chunk_success",
                        dataset=dataset_name,
                        params=params,
                        rows=len(data),
                        attempts=attempts,
                        duration_ms=t_ms,
                    )
                    return data  # type: ignore[no-any-return]

                # Handle rate limiting (429) or server errors (5xx)
                if resp.status_code == 429 or 500 <= resp.status_code < 600:
                    retry_after_hdr = resp.headers.get("Retry-After")
                    delay: float
                    if retry_after_hdr:
                        try:
                            delay = float(retry_after_hdr)
                        except ValueError:
                            delay = self.backoff_base * (2 ** (attempts - 1))
                    else:
                        delay = self.backoff_base * (2 ** (attempts - 1)) + random.uniform(
                            0.05, 0.2
                        )

                    logger.warning(
                        "elexon_fetch_retryable_error",
                        dataset=dataset_name,
                        status_code=resp.status_code,
                        attempt=attempts,
                        delay_s=delay,
                        duration_ms=t_ms,
                    )
                    if attempts < self.max_retries:
                        await asyncio.sleep(delay)
                        continue
                    else:
                        raise ElexonClientError(
                            f"Elexon {dataset_name} failed with status {resp.status_code} "
                            f"after {attempts} attempts. Response: {resp.text[:300]}"
                        )

                # Non-retryable client error (4xx != 429)
                raise ElexonClientError(
                    f"Elexon {dataset_name} returned non-retryable status {resp.status_code}: "
                    f"{resp.text[:300]}"
                )

            except (httpx.TimeoutException, httpx.NetworkError) as exc:
                last_error = exc
                t_ms = int((asyncio.get_event_loop().time() - t0) * 1000)
                delay = self.backoff_base * (2 ** (attempts - 1)) + random.uniform(0.05, 0.2)
                logger.warning(
                    "elexon_fetch_network_error",
                    dataset=dataset_name,
                    error=str(exc),
                    attempt=attempts,
                    delay_s=delay,
                    duration_ms=t_ms,
                )
                if attempts < self.max_retries:
                    await asyncio.sleep(delay)
                else:
                    raise ElexonClientError(
                        f"Elexon {dataset_name} connection error after {attempts} attempts: {exc}"
                    ) from exc

        raise ElexonClientError(
            f"Elexon {dataset_name} exhausted {self.max_retries} attempts: {last_error}"
        )

    async def fetch_fuelhh_chunk(
        self,
        date_from: date,
        date_to: date,
        fuel_type: str = "WIND",
    ) -> list[dict[str, Any]]:
        """Fetch FUELHH stream chunk for settlement date range (inclusive)."""
        url = f"{self.base_url}/datasets/FUELHH/stream"
        params = {
            "settlementDateFrom": date_from.strftime("%Y-%m-%d"),
            "settlementDateTo": date_to.strftime("%Y-%m-%d"),
            "fuelType": fuel_type,
            "format": "json",
        }
        return await self._fetch_with_retry(url, params, "FUELHH")

    async def fetch_windfor_chunk(
        self,
        pub_from: datetime,
        pub_to: datetime,
    ) -> list[dict[str, Any]]:
        """Fetch WINDFOR stream chunk for publish datetime range."""
        url = f"{self.base_url}/datasets/WINDFOR/stream"
        params = {
            "publishDateTimeFrom": pub_from.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "publishDateTimeTo": pub_to.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "format": "json",
        }
        return await self._fetch_with_retry(url, params, "WINDFOR")

    async def fetch_all_fuelhh(
        self,
        start_date: date,
        end_date: date,
        chunk_days: int = 7,
    ) -> list[dict[str, Any]]:
        """Fetch all FUELHH data chunked across date range."""
        chunks = plan_date_chunks(start_date, end_date, chunk_days=chunk_days)
        tasks = [self.fetch_fuelhh_chunk(c_from, c_to, fuel_type="WIND") for c_from, c_to in chunks]
        results = await asyncio.gather(*tasks)
        combined: list[dict[str, Any]] = []
        for r in results:
            combined.extend(r)
        return combined

    async def fetch_all_windfor(
        self,
        start_dt: datetime,
        end_dt: datetime,
        chunk_days: int = 7,
    ) -> list[dict[str, Any]]:
        """Fetch all WINDFOR data chunked across datetime range."""
        chunks = plan_datetime_chunks(start_dt, end_dt, chunk_days=chunk_days)
        tasks = [self.fetch_windfor_chunk(c_from, c_to) for c_from, c_to in chunks]
        results = await asyncio.gather(*tasks)
        combined: list[dict[str, Any]] = []
        for r in results:
            combined.extend(r)
        return combined
