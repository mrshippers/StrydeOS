"""Unit tests for the intent-eval scoring harness.

P0-13b: live_run() was a stub that printed "not yet implemented" and exited 0,
so the "95%+ accuracy" target was unbacked by runnable code. These tests prove
the scoring core and the 95% threshold gate actually work against a pluggable
classifier, independent of any live endpoint (so they run in CI with no key).
"""
from ava_graph.tests.eval.run_intent_eval import (
    ACCURACY_THRESHOLD,
    load_eval_set,
    score,
)


def _perfect_classifier(utterances):
    """A classifier that always returns the labelled intent (100% accuracy)."""
    lookup = {u["text"]: u["intent"] for u in utterances}
    return lambda text: lookup[text]


def test_perfect_classifier_passes_gate():
    utterances = load_eval_set()
    result = score(utterances, _perfect_classifier(utterances))

    assert result["accuracy"] == 1.0
    assert result["passed"] is True
    assert result["correct"] == result["total"] == len(utterances)
    assert result["misses"] == []


def test_threshold_gate_fails_below_95_percent():
    # 100 utterances, 10 forced wrong -> 90% accuracy -> below 95% gate.
    utterances = load_eval_set()
    assert len(utterances) == 100  # gate maths below assumes 100

    wrong_ids = {u["id"] for u in utterances[:10]}

    def flaky(text: str) -> str:
        for u in utterances:
            if u["text"] == text:
                if u["id"] in wrong_ids:
                    # Return a deliberately wrong (but valid) label.
                    return "cancel" if u["intent"] != "cancel" else "booking"
                return u["intent"]
        return "unknown"

    result = score(utterances, flaky)
    assert result["accuracy"] == 0.90
    assert result["passed"] is False
    assert len(result["misses"]) == 10


def test_threshold_gate_passes_at_exactly_95_percent():
    # 100 utterances, exactly 5 wrong -> 95% -> passes (>= threshold).
    utterances = load_eval_set()
    wrong_ids = {u["id"] for u in utterances[:5]}

    def almost(text: str) -> str:
        for u in utterances:
            if u["text"] == text:
                if u["id"] in wrong_ids:
                    return "reschedule" if u["intent"] != "reschedule" else "booking"
                return u["intent"]
        return "unknown"

    result = score(utterances, almost, threshold=ACCURACY_THRESHOLD)
    assert abs(result["accuracy"] - 0.95) < 1e-9
    assert result["passed"] is True


def test_confusion_matrix_and_per_intent_recall():
    # Tiny synthetic set so the matrix is easy to assert.
    utterances = [
        {"id": "x1", "intent": "booking", "text": "book me in"},
        {"id": "x2", "intent": "booking", "text": "i need an appointment"},
        {"id": "x3", "intent": "cancel", "text": "cancel please"},
    ]

    # Misclassify the second booking as cancel.
    def clf(text: str) -> str:
        return {
            "book me in": "booking",
            "i need an appointment": "cancel",
            "cancel please": "cancel",
        }[text]

    result = score(utterances, clf)

    assert result["total"] == 3
    assert result["correct"] == 2
    assert abs(result["accuracy"] - 2 / 3) < 1e-9
    # booking: 1 of 2 correct, 1 leaked to cancel
    assert result["confusion"]["booking"] == {"booking": 1, "cancel": 1}
    assert result["confusion"]["cancel"] == {"cancel": 1}
    assert result["per_intent"]["booking"]["recall"] == 0.5
    assert result["per_intent"]["cancel"]["recall"] == 1.0
    # The miss is recorded with full detail.
    assert result["misses"] == [
        {
            "id": "x2",
            "text": "i need an appointment",
            "expected": "booking",
            "predicted": "cancel",
        }
    ]


def test_unrecognised_label_counts_as_miss():
    utterances = [{"id": "x1", "intent": "booking", "text": "book me in"}]
    result = score(utterances, lambda _t: "garbage_label")
    assert result["accuracy"] == 0.0
    assert result["passed"] is False
    assert result["misses"][0]["predicted"] == "garbage_label"
