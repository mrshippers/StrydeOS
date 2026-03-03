# 15-second StrydeOS product demo

Two ways to get a downloadable Loom/Higglefield-style demo video:

---

## Option A: Record it yourself (fastest)

1. Start the dashboard: `npm run dev` (from `dashboard/`).
2. Open **Loom** (loom.com), **QuickTime** (File → New Screen Recording), or **Higglefield**.
3. Follow the **15-second script** below. Start recording, then do the steps.

### 15-second script

| Time | What to do |
|------|------------|
| 0–3s | Show **login** page. Say: “Sign in to your clinic dashboard.” |
| 3–6s | Click **Sign in** (or “Enter dashboard (demo)” if no Firebase). |
| 6–10s | On **dashboard**: “Weekly stats, clinician performance, and targets at a glance.” |
| 10–13s | Click **Intelligence** or **Pulse** in the sidebar. “Drill into insights and continuity.” |
| 13–15s | End on dashboard or sidebar. “StrydeOS — clinical performance, simplified.” |

---

## Option B: Generate from screenshots (code) — quick one-liner

**1. Capture frames** (dashboard must be running on 3000 or 3001):

```bash
cd dashboard && npm run dev
# In another terminal:
npx playwright test demo-video/capture-frames.spec.mjs
```

If you see the login form (no “Enter dashboard (demo)”), the script needs real sign-in or you can drop your own screenshots into `demo-video/frames/` as `01-login.png`, `02-dashboard.png`, `03-features.png`.

**2. Build the video** (needs ffmpeg once: `brew install ffmpeg`):

```bash
cd dashboard/demo-video && ./build-video.sh
```

Output: **`strydeos-demo-15s.mp4`** (~15 s). Open it or drag into Loom/Notion.

### 3. Download

The file is at `dashboard/demo-video/strydeos-demo-15s.mp4`. Open it, or drag into Loom/Notion etc.

---

**Can you use “Claude code” to do this?**  
Yes. Option B uses Cursor’s browser to capture the app and a small script to build the MP4. Option A is a tight script you can record yourself in Loom/Higglefield in one take.
