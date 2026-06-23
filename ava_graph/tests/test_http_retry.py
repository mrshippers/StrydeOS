"""Tests for the shared PMS HTTP retry helper (ava_graph.tools._http)."""

import httpx
import pytest

from ava_graph.tools._http import request_with_retry


def _resp(status_code: int, retry_after: str | None = None) -> httpx.Response:
    headers = {"Retry-After": retry_after} if retry_after else {}
    return httpx.Response(status_code=status_code, headers=headers)


async def _nosleep(_seconds: float) -> None:
    return None


@pytest.mark.asyncio
async def test_retries_429_then_succeeds():
    """A 429 followed by a 200 should retry and return the 200."""
    responses = [_resp(429, retry_after="0"), _resp(200)]
    calls = {"n": 0}

    async def call():
        calls["n"] += 1
        return responses.pop(0)

    res = await request_with_retry(call, idempotent=True, sleep=_nosleep)
    assert res.status_code == 200
    assert calls["n"] == 2


@pytest.mark.asyncio
async def test_read_retries_5xx():
    """Idempotent reads retry on 5xx."""
    responses = [_resp(503), _resp(503), _resp(200)]
    calls = {"n": 0}

    async def call():
        calls["n"] += 1
        return responses.pop(0)

    res = await request_with_retry(call, idempotent=True, sleep=_nosleep)
    assert res.status_code == 200
    assert calls["n"] == 3


@pytest.mark.asyncio
async def test_booking_does_not_retry_5xx():
    """A write (idempotent=False) must NOT retry a 5xx — could double-book."""
    calls = {"n": 0}

    async def call():
        calls["n"] += 1
        return _resp(500)

    res = await request_with_retry(call, idempotent=False, sleep=_nosleep)
    assert res.status_code == 500
    assert calls["n"] == 1  # surfaced immediately, no retry


@pytest.mark.asyncio
async def test_booking_retries_429():
    """A write may retry a 429 — the request was rejected, never processed."""
    responses = [_resp(429, retry_after="0"), _resp(200)]
    calls = {"n": 0}

    async def call():
        calls["n"] += 1
        return responses.pop(0)

    res = await request_with_retry(call, idempotent=False, sleep=_nosleep)
    assert res.status_code == 200
    assert calls["n"] == 2


@pytest.mark.asyncio
async def test_connect_error_retried_for_writes():
    """ConnectError never reached the server — safe to retry even for writes."""
    outcomes = [httpx.ConnectError("refused"), _resp(200)]
    calls = {"n": 0}

    async def call():
        calls["n"] += 1
        outcome = outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome

    res = await request_with_retry(call, idempotent=False, sleep=_nosleep)
    assert res.status_code == 200
    assert calls["n"] == 2


@pytest.mark.asyncio
async def test_timeout_not_retried_for_writes():
    """A read timeout on a write is surfaced (the write may have applied)."""
    calls = {"n": 0}

    async def call():
        calls["n"] += 1
        raise httpx.ReadTimeout("slow")

    with pytest.raises(httpx.ReadTimeout):
        await request_with_retry(call, idempotent=False, sleep=_nosleep)
    assert calls["n"] == 1
