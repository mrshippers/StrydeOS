"""Shared pytest fixtures for the Ava engine API tests.

These tests exercise route logic, auth, and tenant resolution in isolation. Firestore
is faked here so the suite does not depend on a live Firestore project (the previous
suite hit live Firestore through the tenant middleware and failed for any clinic id
that did not happen to exist). The fake supports the two access paths the engine uses:

- clinics/{clinic_id}                                  (tenant existence check)
- clinics/{clinic_id}/integrations_config/pms          (server-side credential resolve)
"""

import os
from unittest.mock import patch

import pytest

# Internal secret used by /api/tools/execute auth. Set before app import so the
# auth module picks it up at import time.
TEST_INTERNAL_SECRET = "test-internal-secret"
os.environ.setdefault("AVA_INTERNAL_SECRET", TEST_INTERNAL_SECRET)

# main.py runs sentry_sdk.init(dsn=os.environ["SENTRY_DSN"]) at import time. An
# empty DSN disables Sentry, so the suite stays hermetic with no real secret and
# importing `ava_graph.main` never raises a KeyError under a bare test env.
os.environ.setdefault("SENTRY_DSN", "")

# main.py refuses to import without an explicit CORS allow-list (no wildcard).
# Match the origins the CORS test exercises so the suite is hermetic; production
# sets the real origins via Doppler.
os.environ.setdefault("ALLOWED_ORIGINS", "http://testserver,http://localhost:3000")

# The /webhook/ava route now fails CLOSED when the signing secret is unset (the
# P0-2 hardening: no fail-open). Provide a dummy so the configured-path tests run;
# signature-rejection has its own dedicated tests, and the booking-flow tests
# override the signature dependency via bypass_elevenlabs_auth.
os.environ.setdefault("ELEVENLABS_WEBHOOK_SECRET", "test-elevenlabs-webhook-secret")


class _FakeDoc:
    """Minimal stand-in for a Firestore DocumentSnapshot."""

    def __init__(self, data):
        self._data = data
        self.exists = data is not None

    def to_dict(self):
        return self._data


class _FakeDocRef:
    def __init__(self, store, path):
        self._store = store
        self._path = path

    def collection(self, name):
        return _FakeCollection(self._store, f"{self._path}/{name}")

    async def get(self):
        if self._store.raise_on_get:
            raise RuntimeError("simulated Firestore outage")
        return _FakeDoc(self._store.docs.get(self._path))


class _FakeCollection:
    def __init__(self, store, path):
        self._store = store
        self._path = path

    def document(self, doc_id):
        return _FakeDocRef(self._store, f"{self._path}/{doc_id}")


class FakeFirestore:
    """In-memory Firestore double keyed by document path."""

    def __init__(self):
        # path -> dict (None means the doc does not exist)
        self.docs = {}
        self.raise_on_get = False

    def collection(self, name):
        return _FakeCollection(self, name)

    def seed_clinic(self, clinic_id, pms_config=None):
        self.docs[f"clinics/{clinic_id}"] = {"name": clinic_id}
        if pms_config is not None:
            self.docs[f"clinics/{clinic_id}/integrations_config/pms"] = pms_config


@pytest.fixture
def fake_firestore():
    """Patch get_firestore_db and yield a double pre-seeded with a default clinic.

    Seeds `clinic_1` (the id used by the legacy webhook tests) so tenant resolution
    passes. Tests that need other clinics / failure modes mutate the returned store.
    """
    store = FakeFirestore()
    store.seed_clinic(
        "clinic_1",
        pms_config={"provider": "cliniko", "apiKey": "seeded-key", "baseUrl": ""},
    )
    with patch("ava_graph.config.get_firestore_db", return_value=store):
        yield store


@pytest.fixture(autouse=True)
def _auto_fake_firestore(fake_firestore):
    """Apply the Firestore double to every test so no test reaches live Firestore."""
    yield fake_firestore


@pytest.fixture
def bypass_elevenlabs_auth():
    """Override the ElevenLabs signature dependency for booking-flow tests.

    The /webhook/ava route is gated by verify_elevenlabs_secret. Tests that exercise
    the booking workflow (not the signature check itself) override that dependency so
    they can post unsigned bodies. Signature verification has its own dedicated tests.
    """
    from ava_graph.main import app
    from ava_graph.api.auth import verify_elevenlabs_secret

    app.dependency_overrides[verify_elevenlabs_secret] = lambda: None
    yield
    app.dependency_overrides.pop(verify_elevenlabs_secret, None)
