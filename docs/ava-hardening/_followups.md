# Ava Hardening — Follow-ups

Items identified and deferred from this session.

| Item | Owner | Notes |
|------|-------|-------|
| Vercel cron for daily digest | Ava sprint 3 | `vercel.json` cron at 18:30 Mon–Fri → `GET /api/ava/digest` |
| Stage 7 live smoke test | Jamal | Call 07424829343 after deploy, verify call_log + InsightEvent write |
| Existing agent tool rotation | Jamal | Run `/api/ava/rotate-tools` for Spires after S2-T1 deploy to pick up intake fields |
| Red-flag routing logic | LangGraph sprint | `is_red_flag_screened: false` → route to escalation node. Not in this sprint. |
| `contact_requests` admin list view | Ava UI sprint | List view in Ava dashboard for no-PMS contact capture |
| TM3 / PPS integration hooks on no-pms-handler | Integration sprint | SMS / webhook channel when those PMS integrations ship |
| Mid-call dual-channel SMS | Ava sprint 4 | Requires ElevenLabs custom tool + Twilio reply webhook |
| Intelligence module hardening | Intelligence session | Separate brief |
| Pulse module hardening | Pulse session | Separate brief |
