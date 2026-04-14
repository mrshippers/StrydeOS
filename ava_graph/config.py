"""Configuration and API client factories for Ava LangGraph backend."""

import os
from functools import lru_cache
from typing import Optional

import httpx
from twilio.rest import Client as TwilioClient

# Environment variables
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
CLINIKO_API_KEY = os.getenv("CLINIKO_API_KEY", "")
CLINIKO_PRACTICE_ID = os.getenv("CLINIKO_PRACTICE_ID", "")
WRITEUPP_API_KEY = os.getenv("WRITEUPP_API_KEY", "")
JANE_API_KEY = os.getenv("JANE_API_KEY", "")
TM3_API_KEY = os.getenv("TM3_API_KEY", "")
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_FROM_NUMBER = os.getenv("TWILIO_FROM_NUMBER", "")

# API base URLs
CLINIKO_BASE_URL = "https://api.cliniko.com/v1"
WRITEUPP_BASE_URL = "https://app.writeuppms.com/api"
JANE_BASE_URL = "https://api.integratedhealthtech.com"
TM3_BASE_URL = "https://api.tm3.co.uk"

# HTTP client configuration
DEFAULT_TIMEOUT = 60.0  # increased from 30s as PMS APIs can take 15-20+ seconds
DEFAULT_MAX_RETRIES = 3


@lru_cache(maxsize=1)
def get_cliniko_client() -> httpx.AsyncClient:
    """
    Factory for Cliniko API client.

    Returns an httpx.AsyncClient configured with Cliniko auth headers
    and base URL.
    """
    headers = {
        "Authorization": f"Bearer {CLINIKO_API_KEY}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }

    return httpx.AsyncClient(
        base_url=CLINIKO_BASE_URL,
        headers=headers,
        timeout=DEFAULT_TIMEOUT,
    )


@lru_cache(maxsize=1)
def get_writeupp_client() -> httpx.AsyncClient:
    """
    Factory for WriteUpp API client.

    Returns an httpx.AsyncClient configured with WriteUpp auth headers
    and base URL.
    """
    headers = {
        "Authorization": f"Bearer {WRITEUPP_API_KEY}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }

    return httpx.AsyncClient(
        base_url=WRITEUPP_BASE_URL,
        headers=headers,
        timeout=DEFAULT_TIMEOUT,
    )


@lru_cache(maxsize=1)
def get_jane_client() -> httpx.AsyncClient:
    """
    Factory for Jane App API client.

    Returns an httpx.AsyncClient configured with Jane auth headers
    and base URL.
    """
    headers = {
        "Authorization": f"Bearer {JANE_API_KEY}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }

    return httpx.AsyncClient(
        base_url=JANE_BASE_URL,
        headers=headers,
        timeout=DEFAULT_TIMEOUT,
    )


@lru_cache(maxsize=1)
def get_tm3_client() -> httpx.AsyncClient:
    """
    Factory for TM3 API client.

    Returns an httpx.AsyncClient configured with TM3 auth headers
    and base URL.
    """
    headers = {
        "Authorization": f"Bearer {TM3_API_KEY}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }

    return httpx.AsyncClient(
        base_url=TM3_BASE_URL,
        headers=headers,
        timeout=DEFAULT_TIMEOUT,
    )


@lru_cache(maxsize=1)
def get_twilio_client() -> TwilioClient:
    """
    Factory for Twilio SMS client.

    Returns a configured Twilio client instance for sending SMS messages.
    """
    return TwilioClient(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
