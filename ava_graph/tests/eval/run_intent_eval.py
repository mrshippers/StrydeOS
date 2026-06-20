#!/usr/bin/env python3
"""
Intent evaluation runner for Ava.

Usage:
    # Validate the eval set format + distribution (no classifier needed)
    python -m ava_graph.tests.eval.run_intent_eval --dry-run

    # Score the eval set against a live HTTP classifier and gate on accuracy.
    # Requires CLASSIFIER_URL (a POST endpoint that takes {"text": ...} and
    # returns {"intent": ...}); exits non-zero if accuracy < threshold.
    CLASSIFIER_URL=https://... python -m ava_graph.tests.eval.run_intent_eval

The scoring core (`score`) is decoupled from any transport: it takes a plain
`classifier: Callable[[str], str]` so it can be driven by a live HTTP endpoint,
a local function, or a stub in tests. That makes the 95% accuracy claim backed
by runnable, testable code rather than a TODO.
"""
import argparse
import os
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Callable

import yaml


EVAL_FILE = Path(__file__).parent / "intent_eval.yaml"
VALID_INTENTS = {"booking", "cancel", "reschedule", "insurer-question"}

# Accuracy gate. Mirrors the README / intent_eval.yaml target.
ACCURACY_THRESHOLD = 0.95

# A classifier maps an utterance to one of VALID_INTENTS (or any string; an
# unrecognised label simply counts as a miss).
Classifier = Callable[[str], str]


def load_eval_set() -> list[dict]:
    with open(EVAL_FILE) as f:
        data = yaml.safe_load(f)
    return data["utterances"]


def dry_run(utterances: list[dict]) -> None:
    """Print distribution stats and validate format."""
    errors = []
    for u in utterances:
        for field in ("id", "intent", "text"):
            if field not in u:
                errors.append(f"{u.get('id', '?')}: missing {field!r}")
        if u.get("intent") not in VALID_INTENTS:
            errors.append(f"{u['id']}: unknown intent {u['intent']!r}")

    if errors:
        print("VALIDATION ERRORS:")
        for e in errors:
            print(f"  {e}")
        sys.exit(1)

    counts = Counter(u["intent"] for u in utterances)
    print(f"Eval set ready: {len(utterances)} utterances across {len(counts)} intents")
    for intent in sorted(VALID_INTENTS):
        print(f"  {intent}: {counts.get(intent, 0)}")


def score(
    utterances: list[dict],
    classifier: Classifier,
    threshold: float = ACCURACY_THRESHOLD,
) -> dict:
    """Run every utterance through `classifier` and compute scoring.

    Returns a dict with:
        total, correct, accuracy, passed (accuracy >= threshold),
        confusion (expected -> {predicted: count}),
        per_intent (intent -> {"total", "correct", "recall"}),
        misses (list of {id, text, expected, predicted}).

    Pure and transport-agnostic — no network, no env vars. This is the unit
    that the threshold gate and the tests both exercise.
    """
    total = len(utterances)
    correct = 0
    confusion: dict[str, Counter] = defaultdict(Counter)
    per_intent_total: Counter = Counter()
    per_intent_correct: Counter = Counter()
    misses: list[dict] = []

    for u in utterances:
        expected = u["intent"]
        predicted = classifier(u["text"])
        per_intent_total[expected] += 1
        confusion[expected][predicted] += 1
        if predicted == expected:
            correct += 1
            per_intent_correct[expected] += 1
        else:
            misses.append(
                {
                    "id": u.get("id", "?"),
                    "text": u["text"],
                    "expected": expected,
                    "predicted": predicted,
                }
            )

    accuracy = correct / total if total else 0.0
    per_intent = {
        intent: {
            "total": per_intent_total[intent],
            "correct": per_intent_correct[intent],
            "recall": (
                per_intent_correct[intent] / per_intent_total[intent]
                if per_intent_total[intent]
                else 0.0
            ),
        }
        for intent in sorted(per_intent_total)
    }

    return {
        "total": total,
        "correct": correct,
        "accuracy": accuracy,
        "passed": accuracy >= threshold,
        "confusion": {k: dict(v) for k, v in confusion.items()},
        "per_intent": per_intent,
        "misses": misses,
    }


def print_report(result: dict, threshold: float = ACCURACY_THRESHOLD) -> None:
    """Human-readable confusion matrix + accuracy summary."""
    labels = sorted(VALID_INTENTS)
    confusion = result["confusion"]

    print("\nConfusion matrix (rows = expected, cols = predicted):")
    header = "  expected \\ predicted | " + " | ".join(f"{l[:6]:>6}" for l in labels)
    print(header)
    print("  " + "-" * (len(header) - 2))
    for expected in labels:
        row = confusion.get(expected, {})
        cells = " | ".join(f"{row.get(p, 0):>6}" for p in labels)
        print(f"  {expected:>20} | {cells}")

    print("\nPer-intent recall:")
    for intent, stats in result["per_intent"].items():
        print(
            f"  {intent:>18}: {stats['correct']}/{stats['total']} "
            f"= {stats['recall']:.1%}"
        )

    if result["misses"]:
        print(f"\nMisclassified ({len(result['misses'])}):")
        for m in result["misses"]:
            print(
                f"  [{m['id']}] expected {m['expected']!r}, "
                f"got {m['predicted']!r} :: {m['text']}"
            )

    print(
        f"\nOverall accuracy: {result['correct']}/{result['total']} "
        f"= {result['accuracy']:.2%} (threshold {threshold:.0%})"
    )
    print("RESULT:", "PASS" if result["passed"] else "FAIL")


def http_classifier(classifier_url: str) -> Classifier:
    """Build a classifier that POSTs each utterance to a live HTTP endpoint.

    Contract: POST {"text": <utterance>} -> 200 {"intent": <label>}.
    Raises at call time if the endpoint is unreachable or malformed so a broken
    classifier fails the run loudly rather than silently scoring 0.
    """
    import httpx

    client = httpx.Client(timeout=30.0)

    def classify(text: str) -> str:
        resp = client.post(classifier_url, json={"text": text})
        resp.raise_for_status()
        data = resp.json()
        intent = data.get("intent")
        if not isinstance(intent, str):
            raise ValueError(f"Classifier response missing string 'intent': {data!r}")
        return intent.strip()

    return classify


def live_run(utterances: list[dict]) -> None:
    """Score the eval set against the live classifier and gate on accuracy.

    Exits non-zero when accuracy is below ACCURACY_THRESHOLD (the gate) or when
    no classifier endpoint is configured.
    """
    classifier_url = os.environ.get("CLASSIFIER_URL")
    if not classifier_url:
        print(
            "Live mode requires CLASSIFIER_URL env var (a POST endpoint that "
            "takes {\"text\": ...} and returns {\"intent\": ...}).\n"
            "Run with --dry-run to validate the eval set without a classifier."
        )
        sys.exit(1)

    classifier = http_classifier(classifier_url)
    result = score(utterances, classifier)
    print_report(result)
    sys.exit(0 if result["passed"] else 1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    utterances = load_eval_set()
    if args.dry_run:
        dry_run(utterances)
    else:
        live_run(utterances)
