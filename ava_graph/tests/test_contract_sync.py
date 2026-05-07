"""Snapshot tests asserting Pydantic models in `ava_graph/api/routes.py` match the
canonical TypeScript contract types in `dashboard/src/lib/contracts/index.ts` §6
and §7.

Each test compares the Pydantic model's `model_fields` against a hardcoded
expected list of `(field_name, required)` tuples copied from the TS types.
The expected lists are intentionally hardcoded — we do NOT parse the TS file at
runtime — so any drift on either side of the boundary surfaces as a clear,
local test failure in CI.

If a test here fails:
    1. Decide which side is wrong.
    2. The TypeScript file is canonical — update the Pydantic model in
       `ava_graph/api/routes.py` to match TS.
    3. If TS itself was the change, update both the TS file AND the expected
       list in this test in the same commit.
"""

from typing import List, Tuple

import pytest

from ava_graph.api.routes import (
    AvaWebhookResponse,
    CallStartedWebhook,
    PatientConfirmedWebhook,
    ToolExecuteRequest,
    ToolExecuteResponse,
)


def _actual_fields(model) -> List[Tuple[str, bool]]:
    """Return [(field_name, is_required), ...] in declaration order."""
    return [(name, info.is_required()) for name, info in model.model_fields.items()]


def _assert_field_parity(model, expected: List[Tuple[str, bool]]) -> None:
    """Compare actual model fields against expected list, with a clear message."""
    actual = _actual_fields(model)

    actual_names = [n for n, _ in actual]
    expected_names = [n for n, _ in expected]

    missing = [n for n in expected_names if n not in actual_names]
    extra = [n for n in actual_names if n not in expected_names]

    assert not missing, (
        f"{model.__name__} is missing fields present in TS contract: {missing}. "
        f"Expected: {expected_names}, got: {actual_names}."
    )
    assert not extra, (
        f"{model.__name__} has extra fields not in TS contract: {extra}. "
        f"Expected: {expected_names}, got: {actual_names}."
    )

    # Order check (Pydantic preserves declaration order; mirror TS order)
    assert actual_names == expected_names, (
        f"{model.__name__} field order does not match TS contract. "
        f"Expected order: {expected_names}, got: {actual_names}."
    )

    # Required-ness check, field by field
    actual_required = dict(actual)
    for name, expected_required in expected:
        got = actual_required[name]
        assert got == expected_required, (
            f"{model.__name__}.{name} required-ness mismatch: "
            f"TS contract says required={expected_required}, "
            f"Pydantic has required={got}."
        )


# ─── §6: AvaEngineRequest / AvaEngineResponse ─────────────────────────────────

# TS `AvaEngineRequest`:
#   tool_name: AvaToolName       (required)
#   tool_input: Record<...>      (required)
#   clinic_id: string            (required)
#   pms_type: AvaPmsType         (required)
#   api_key: string              (required)
#   base_url?: string            (optional — default "")
EXPECTED_AVA_ENGINE_REQUEST: List[Tuple[str, bool]] = [
    ("tool_name", True),
    ("tool_input", True),
    ("clinic_id", True),
    ("pms_type", True),
    ("api_key", True),
    ("base_url", False),
]


def test_ToolExecuteRequest_field_parity():
    """ToolExecuteRequest must mirror TS AvaEngineRequest (§6)."""
    _assert_field_parity(ToolExecuteRequest, EXPECTED_AVA_ENGINE_REQUEST)


# TS `AvaEngineResponse`:
#   result: string               (required)
#   booking_id?: string          (optional)
#   slots?: string[]             (optional)
EXPECTED_AVA_ENGINE_RESPONSE: List[Tuple[str, bool]] = [
    ("result", True),
    ("booking_id", False),
    ("slots", False),
]


def test_ToolExecuteResponse_field_parity():
    """ToolExecuteResponse must mirror TS AvaEngineResponse (§6)."""
    _assert_field_parity(ToolExecuteResponse, EXPECTED_AVA_ENGINE_RESPONSE)


# ─── §7: Webhook request / response models ────────────────────────────────────

# TS `AvaCallStartedRequest`:
#   call_id: string              (required)
#   patient_name: string         (required)
#   patient_phone: string        (required)
#   requested_service?: string   (optional — default "General")
#   preferred_time?: string      (optional — default "")
EXPECTED_AVA_CALL_STARTED_REQUEST: List[Tuple[str, bool]] = [
    ("call_id", True),
    ("patient_name", True),
    ("patient_phone", True),
    ("requested_service", False),
    ("preferred_time", False),
]


def test_CallStartedWebhook_field_parity():
    """CallStartedWebhook must mirror TS AvaCallStartedRequest (§7)."""
    _assert_field_parity(CallStartedWebhook, EXPECTED_AVA_CALL_STARTED_REQUEST)


# TS `AvaPatientConfirmedRequest`:
#   session_id: string           (required)
#   confirmed: boolean           (required)
EXPECTED_AVA_PATIENT_CONFIRMED_REQUEST: List[Tuple[str, bool]] = [
    ("session_id", True),
    ("confirmed", True),
]


def test_PatientConfirmedWebhook_field_parity():
    """PatientConfirmedWebhook must mirror TS AvaPatientConfirmedRequest (§7)."""
    _assert_field_parity(
        PatientConfirmedWebhook, EXPECTED_AVA_PATIENT_CONFIRMED_REQUEST
    )


# TS `AvaWebhookResponse`:
#   response: string             (required)
#   end_conversation: boolean    (required)
#   session_id: string           (required)
#   status: string               (required)
#   response_message: string     (required)
#   booking_id?: string          (optional — present only on terminal `confirmed`)
EXPECTED_AVA_WEBHOOK_RESPONSE: List[Tuple[str, bool]] = [
    ("response", True),
    ("end_conversation", True),
    ("session_id", True),
    ("status", True),
    ("response_message", True),
    ("booking_id", False),
]


def test_AvaWebhookResponse_field_parity():
    """AvaWebhookResponse must mirror TS AvaWebhookResponse (§7)."""
    _assert_field_parity(AvaWebhookResponse, EXPECTED_AVA_WEBHOOK_RESPONSE)
