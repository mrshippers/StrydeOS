"""FastAPI application for Ava booking agent."""

import logging
import os
from pathlib import Path
from typing import Dict, Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from ava_graph.api.routes import router


# Configure logging
def setup_logging() -> logging.Logger:
    """
    Configure root logger with console and file handlers.

    Creates logs directory if it doesn't exist.

    Returns:
        Configured logger instance.
    """
    # Create logs directory if it doesn't exist
    log_dir = Path("logs")
    log_dir.mkdir(exist_ok=True)

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

    # File handler
    file_handler = logging.FileHandler(log_dir / "ava_graph.log")
    file_handler.setLevel(logging.INFO)
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)

    return logger


# Setup logging
logger = setup_logging()

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
app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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


# Health check endpoint
@app.get("/health")
async def health_check() -> Dict[str, str]:
    """
    Health check endpoint.

    Returns:
        JSON with status.
    """
    return {"status": "ok"}


logger.info("Ava Booking Agent FastAPI application initialized")


if __name__ == "__main__":
    import uvicorn

    # Get host and port from environment variables or use defaults
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))

    uvicorn.run(app, host=host, port=port, log_level="info")
