#!/usr/bin/env python3
"""
Intent evaluation runner for Ava.

Usage:
    python -m ava_graph.tests.eval.run_intent_eval --dry-run
    python -m ava_graph.tests.eval.run_intent_eval  (requires CLASSIFIER_URL env var)
"""
import argparse
import sys
from pathlib import Path
from collections import Counter
import yaml


EVAL_FILE = Path(__file__).parent / "intent_eval.yaml"
VALID_INTENTS = {"booking", "cancel", "reschedule", "insurer-question"}


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


def live_run(utterances: list[dict]) -> None:
    import os
    classifier_url = os.environ.get("CLASSIFIER_URL")
    if not classifier_url:
        print("Live mode requires CLASSIFIER_URL env var. Exiting.")
        sys.exit(1)
    print("Live eval not yet implemented. Run with --dry-run.")
    sys.exit(0)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    utterances = load_eval_set()
    if args.dry_run:
        dry_run(utterances)
    else:
        live_run(utterances)
