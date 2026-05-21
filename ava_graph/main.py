"""FastAPI application for Ava booking agent."""

import logging
import os
from pathlib import Path
from typing import Any, Dict

import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from ava_graph.api.rate_limit import limiter
from ava_graph.api.routes import router
from ava_graph.api.tenant import TenantResolverMiddleware


# Configure logging
def setup_logging() -> logging.Logger:
    """
    Configure root logger with console and file handlers.

    Creates logs directory if it doesn't exist.

    Returns:
        Configured logger instance.
    """
    # Get root logger
    logger = logging.getLogger()
    logger.setLevel(logging.INFO)

    # Remove any existing handlers to avoid duplicates
    for handler in logger.handlers[:]:
        logger.removeHandler(handler)

    # Create formatters
    formatter = logging.Formatter(
        "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )

    # Console handler
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

    # Only attach file handler in local dev; serverless filesystems are ephemeral
    if os.getenv("DOPPLER_CONFIG", "dev") == "dev" and os.getenv("ENABLE_FILE_LOGS") == "1":
        log_dir = Path("logs")
        log_dir.mkdir(exist_ok=True)
        file_handler = logging.FileHandler(log_dir / "ava_graph.log")
        file_handler.setLevel(logging.INFO)
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)

    return logger


# Setup logging
logger = setup_logging()

sentry_sdk.init(
    dsn=os.environ["SENTRY_DSN"],
    environment=os.getenv("DOPPLER_CONFIG", "dev"),
    release=os.getenv("GIT_SHA", "dev"),
    integrations=[FastApiIntegration(), StarletteIntegration()],
    traces_sample_rate=0.1,
    profiles_sample_rate=0.1,
)

ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]
if not ALLOWED_ORIGINS:
    raise RuntimeError("ALLOWED_ORIGINS must be set in Doppler. Refusing to start with wildcard CORS.")

# Create FastAPI app
app = FastAPI(
    title="Ava Booking Agent",
    description="FastAPI application for Ava booking workflow",
    version="1.0.0",
)


# Request logging middleware
class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Middleware to log HTTP requests and responses."""

    async def dispatch(self, request: Request, call_next) -> Response:
        """
        Log request and response details.

        Args:
            request: HTTP request object.
            call_next: Next middleware/route handler.

        Returns:
            HTTP response object.
        """
        logger.info(f"{request.method} {request.url.path}")
        response = await call_next(request)
        logger.info(f"{request.method} {request.url.path} - {response.status_code}")
        return response


# Add middleware
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(TenantResolverMiddleware)
app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type", "X-Twilio-Signature", "X-Elevenlabs-Signature"],
)

# Include routes with /api prefix
app.include_router(router, prefix="/api")


# Root endpoint
@app.get("/")
async def root() -> Dict[str, Any]:
    """
    Root endpoint returning app info.

    Returns:
        JSON with app name and version.
    """
    return {
        "name": "Ava Booking Agent",
        "version": "1.0.0",
    }


async def _ping_firestore() -> bool:
    try:
        from ava_graph.config import get_firestore_db
        db = get_firestore_db()
        # Lightweight read — just fetch a single known doc rather than a full list
        await db.collection("clinics").limit(1).get()
        return True
    except Exception:
        return False


async def _ping_elevenlabs() -> bool:
    import httpx
    key = os.getenv("ELEVENLABS_API_KEY", "")
    if not key:
        return False
    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            resp = await client.get(
                "https://api.elevenlabs.io/v1/user",
                headers={"xi-api-key": key},
            )
        return resp.status_code == 200
    except Exception:
        return False


def _ping_twilio() -> bool:
    from ava_graph.config import TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
    return bool(TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN)


@app.get("/health")
async def health_check() -> Dict[str, Any]:
    """Liveness + dependency check. Returns 503 if any critical dep is down."""
    checks = {
        "firestore": await _ping_firestore(),
        "elevenlabs": await _ping_elevenlabs(),
        "twilio": _ping_twilio(),
    }
    healthy = all(checks.values())
    return JSONResponse(
        content={
            "status": "ok" if healthy else "degraded",
            "checks": checks,
            "version": os.getenv("GIT_SHA", "dev"),
        },
        status_code=200 if healthy else 503,
    )


logger.info("Ava Booking Agent FastAPI application initialized")


if __name__ == "__main__":
    import uvicorn

    # Get host and port from environment variables or use defaults
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))

    uvicorn.run(app, host=host, port=port, log_level="info")
