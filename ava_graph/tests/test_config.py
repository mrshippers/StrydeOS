import os
import pytest
from ava_graph.config import (
    get_cliniko_client,
    get_writeupp_client,
    get_jane_client,
    get_tm3_client,
    get_twilio_client,
    ANTHROPIC_API_KEY,
)


def test_config_loads_from_env():
    """Verify config reads required env vars."""
    assert ANTHROPIC_API_KEY is not None, "ANTHROPIC_API_KEY env var missing"


def test_cliniko_client_factory():
    """Verify Cliniko client can be instantiated."""
    client = get_cliniko_client()
    assert client is not None
    assert hasattr(client, 'get'), "Client should have HTTP methods"


def test_writeupp_client_factory():
    """Verify WriteUpp client can be instantiated."""
    client = get_writeupp_client()
    assert client is not None


def test_jane_client_factory():
    """Verify Jane client can be instantiated."""
    client = get_jane_client()
    assert client is not None


def test_tm3_client_factory():
    """Verify TM3 client can be instantiated."""
    client = get_tm3_client()
    assert client is not None


def test_twilio_client_factory():
    """Verify Twilio client can be instantiated."""
    client = get_twilio_client()
    assert client is not None
    assert hasattr(client, 'messages'), "Twilio client should have messages API"
