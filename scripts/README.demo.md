# Demo recording

One-shot Playwright spec that records a ~32-second walkthrough of the live
portal at `portal.strydeos.com` for VO overlay in post. Scenes run in order:
Ava (10s), Pulse (10s), Intelligence (8s). Scoped by the root
`playwright.config.ts` so it never runs against local dev.

## Run

From the repo root, install the Chromium runtime once, then run the spec.
The browser launches headed at 1920×1080 and navigates itself — do not click
inside the window while it runs.

```bash
npx playwright install chromium
npx playwright test scripts/record-demo.spec.ts
```

## Output

Playwright writes the recording to
`test-results/record-demo-strydeos-demo-Ava-Pulse-Intelligence/video.webm`
(the directory name follows the test title). Every run overwrites the
previous `test-results/` folder.

## Convert to MP4 and save to Desktop

ffmpeg transcodes the `.webm` to a VO-ready `.mp4` and drops it straight onto
the Desktop. `libx264` + `yuv420p` is the safe combo for QuickTime, Premiere,
and Final Cut.

```bash
ffmpeg -y -i test-results/*/video.webm \
  -c:v libx264 -crf 18 -preset slow -pix_fmt yuv420p \
  ~/Desktop/strydeos-demo-raw.mp4
```
