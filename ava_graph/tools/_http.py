"""Shared async HTTP retry helper for Ava's PMS tools (Cliniko, WriteUpp).

A live phone call cannot afford an unhandled failure on the first transient
blip, so reads (availability) retry on 429/5xx/network with backoff that
honours Retry-After. Bookings are different: a POST that reaches the server
might create the appointment even if the response never comes back, so booking
retries are restricted to cases where the request provably did NOT reach the
server (HTTP 429 rejection, or a connection error) — never on a read timeout
or a 5xx, where a blind retry could double-book.

The helper wraps a zero-arg thunk that issues the request (e.g.
`lambda: client.get(...)`) rather than calling client.request itself, so the
existing per-method test mocks (mc.get / mc.post) keep working unchanged.
"""

import asyncio
import logging
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Awaitable, Callable, Optional

import httpx

logger = logging.getLogger(__name__)

_MAX_RETRIES = 3
_BASE_DELAY_SECONDS = 0.5
_MAX_DELAY_SECONDS = 8.0
_RETRY_STATUSES = {429, 500, 502, 503, 504}


def _backoff(attempt: int) -> float:
    """Exponential backoff: 0.5s, 1s, 2s, ... capped at 8s."""
    return min(_MAX_DELAY_SECONDS, _BASE_DELAY_SECONDS * (2 ** attempt))


def _parse_retry_after(response: httpx.Response) -> Optional[float]:
    """Parse a Retry-After header (delta-seconds or HTTP-date) into seconds."""
    raw = response.headers.get("Retry-After")
    if not raw:
        return None
    try:
        return max(0.0, float(raw))
    except (TypeError, ValueError):
        pass
    try:
        when = parsedate_to_datetime(raw)
        if when is not None:
            if when.tzinfo is None:
                when = when.replace(tzinfo=timezone.utc)
            return max(0.0, (when - datetime.now(timezone.utc)).total_seconds())
    except (TypeError, ValueError):
        pass
    return None


async def request_with_retry(
    call: Callable[[], Awaitable[httpx.Response]],
    *,
    idempotent: bool,
    sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
) -> httpx.Response:
    """
    Run `call()` with retry on transient failures.

    Args:
        call: zero-arg thunk issuing the request and returning the response.
        idempotent: True for safe-to-repeat reads (GET). When False (bookings),
            only HTTP 429 and connection errors are retried — read timeouts and
            5xx are surfaced immediately so a possibly-applied write is never
            silently repeated.
        sleep: injectable sleep (tests).
    """
    last_exc: Optional[BaseException] = None
    for attempt in range(_MAX_RETRIES + 1):
        try:
            response = await call()
        except httpx.ConnectError as exc:
            # Never reached the server — safe to retry for any method.
            last_exc = exc
            if attempt == _MAX_RETRIES:
                raise
            await sleep(_backoff(attempt))
            continue
        except httpx.TimeoutException as exc:
            # A write may have been applied server-side; only retry reads.
            last_exc = exc
            if not idempotent or attempt == _MAX_RETRIES:
                raise
            await sleep(_backoff(attempt))
            continue

        status = getattr(response, "status_code", None)
        retryable = status == 429 or (idempotent and status in _RETRY_STATUSES)
        if retryable and attempt < _MAX_RETRIES:
            delay = _parse_retry_after(response)
            if delay is None:
                delay = _backoff(attempt)
            logger.warning(
                "PMS request -> HTTP %s, retrying in %.1fs (attempt %d/%d)",
                status, delay, attempt + 1, _MAX_RETRIES,
            )
            await sleep(delay)
            continue
        return response

    # Unreachable: loop returns or raises. Belt-and-braces.
    if last_exc is not None:
        raise last_exc
    raise RuntimeError("request_with_retry exhausted without a response")
