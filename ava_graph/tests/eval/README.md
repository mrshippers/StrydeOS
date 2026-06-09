# Ava Intent Eval Set

100 labelled utterances for evaluating Ava's intent classification accuracy.

## Intents
- `booking` — patient wants to make a new appointment
- `cancel` — patient wants to cancel
- `reschedule` — patient wants to move an existing appointment
- `insurer-question` — patient asking about insurance coverage/payment

## Target
95%+ accuracy across all four intents on the production classifier.

## Dry run (validate format + distribution)
```
cd /path/to/StrydeOS
python -m ava_graph.tests.eval.run_intent_eval --dry-run
```

## Add utterances
Edit `intent_eval.yaml`. IDs: b=booking, c=cancel, r=reschedule, i=insurer.
Prefix + zero-padded number: b001, b002, ... c001, ... r001, ... i001, ...

## Live eval
Set CLASSIFIER_URL env var and run without --dry-run.
