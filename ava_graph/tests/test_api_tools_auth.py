"""Security tests for the /api/tools/execute endpoint and tenant fail-closed behaviour.

Covers P0-2:
- the tool endpoint rejects unauthenticated callers,
- a valid internal secret with a body-supplied api_key does NOT let that api_key reach
  the PMS layer (credentials are resolved server-side from the clinic record),
- _clinic_exists fails CLOSED when Firestore raises.
"""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from ava_graph.main import app
from ava_graph.api.tenant import _clinic_exists
from ava_graph.tests.conftest import TEST_INTERNAL_SECRET


def _tool_body(**overrides):
    body = {
        "tool_name": "check_availability",
        "tool_input": {"start_date": "2026-04-21", "duration_minutes": 60, "days_ahead": 14},
        "clinic_id": "clinic_1",
        "pms_type": "cliniko",
        "api_key": "ATTACKER-SUPPLIED-KEY",
        "base_url": "https://evil.example.com",
    }
    body.update(overrides)
    return body


def test_tool_execute_rejects_unauthenticated(fake_firestore):
    """No X-Internal-Secret header => 401, request never reaches PMS layer."""
    client = TestClient(app)
    resp = client.post("/api/tools/execute?clinic_id=clinic_1", json=_tool_body())
    assert resp.status_code == 401


def test_tool_execute_rejects_wrong_secret(fake_firestore):
    """Wrong internal secret => 403."""
    client = TestClient(app)
    resp = client.post(
        "/api/tools/execute?clinic_id=clinic_1",
        json=_tool_body(),
        headers={"X-Internal-Secret": "not-the-secret"},
    )
    assert resp.status_code == 403


def test_tool_execute_ignores_body_api_key(fake_firestore):
    """A valid internal secret + body-supplied api_key must NOT use that api_key.

    The seeded clinic resolves to provider=cliniko, apiKey='seeded-key'. We assert the
    Cliniko availability call receives the SEEDED key, never the attacker body key, and
    that base_url comes from the clinic record (empty), not the attacker body value.
    """
    with patch(
        "ava_graph.tools.cliniko.get_cliniko_availability", new_callable=AsyncMock
    ) as mock_avail:
        mock_avail.return_value = ["2026-04-21T14:00:00"]
        client = TestClient(app)
        resp = client.post(
            "/api/tools/execute?clinic_id=clinic_1",
            json=_tool_body(api_key="ATTACKER-SUPPLIED-KEY", base_url="https://evil.example.com"),
            headers={"X-Internal-Secret": TEST_INTERNAL_SECRET},
        )

    assert resp.status_code == 200, resp.text
    assert mock_avail.await_count == 1
    kwargs = mock_avail.await_args.kwargs
    assert kwargs["api_key"] == "seeded-key"
    assert kwargs["api_key"] != "ATTACKER-SUPPLIED-KEY"
    assert kwargs["base_url"] == ""  # resolved from clinic record, not attacker body


def test_tool_execute_unknown_clinic_returns_404(fake_firestore):
    """Authenticated call for a clinic with no PMS config => 404, no PMS call made."""
    client = TestClient(app)
    resp = client.post(
        "/api/tools/execute?clinic_id=ghost_clinic",
        json=_tool_body(clinic_id="ghost_clinic"),
        headers={"X-Internal-Secret": TEST_INTERNAL_SECRET},
    )
    # Tenant middleware rejects the unknown clinic before the handler runs.
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_clinic_exists_fails_closed_on_firestore_error(fake_firestore):
    """_clinic_exists returns False (fail CLOSED) when Firestore raises."""
    fake_firestore.raise_on_get = True
    assert await _clinic_exists("clinic_1") is False


@pytest.mark.asyncio
async def test_clinic_exists_true_for_known_clinic(fake_firestore):
    """Sanity: _clinic_exists returns True for a seeded clinic."""
    assert await _clinic_exists("clinic_1") is True


@pytest.mark.asyncio
async def test_clinic_exists_false_for_unknown_clinic(fake_firestore):
    """_clinic_exists returns False for a clinic that does not exist."""
    assert await _clinic_exists("nope") is False
