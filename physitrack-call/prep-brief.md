# StrydeOS x Physitrack - Discovery Call Brief

**Wed 17 June 2026, 13:00-13:30 BST (30 min).** Google Meet: https://meet.google.com/wrm-bcda-xnn
In the room: **Kamil Wyszynski** (Technical Product Manager - the gatekeeper) and **Sven Ehlers** (BD, optional).

This is a partner / API-access call, not a sales pitch. You want their API. The one question that decides everything: **are you a complement or a competitor, and do you qualify for access.** Win those two and you win the call.

---

## 1. The spine (say this, believe this)
StrydeOS is the operating layer above the PMS for private physio. Physitrack is the best HEP + engagement + outcomes engine there is. **You do not build exercise content, telehealth, or triage. You surface Physitrack's adherence and outcomes into one clinic view, and trigger programme assignment automatically off PMS events.** Net effect for Physitrack: more programmes assigned, deeper utilisation, stickier clinic accounts, lower churn. You drive demand INTO their platform. You are a channel, not a rival.

## 2. The ask (reaffirm, already sent in writing)
1. API access - sandbox now, prod later - under your API Usage Agreement.
2. Per-clinic auth: each clinic authorises its own Physitrack account, no shared master key.
3. Read scope: adherence + programme / outcome data (their "get patient details").
4. Write scope: assign programmes / templates via API.
5. Webhooks: subscribe to Physitrack events; trigger assignment off PMS (WriteUpp / Cliniko) events.

## 3. The qualification problem (they WILL push here - pre-empt it)
Their stated bar: 500+ practitioner PMS, or 50+ practitioner practices on in-house PMS. You are neither yet. Get ahead of it:
- "We are not asking to be a PMS integration. **Every clinic uses its own paid Physitrack subscription, authorised per-clinic.** We amplify your existing seats, we do not resell or share keys."
- "**Spires is a live paying Physitrack + WriteUpp clinic** - our own. Start there as a 1-clinic pilot, prove the loop, then roll to the StrydeOS clinic base."
- "We are a **distribution channel.** Clinics we onboard that are not yet on Physitrack are net-new subscriptions we route to you."
- "Happy to **start on the basic shared-secret integration** to prove it fast, then graduate to OAuth." (Their docs call the basic token integration robust and easy - low ask, high trust.)

## 4. Likely questions and your answers

### Kamil (technical)
- **What exactly do you need from the API?** Read patient adherence + programme/outcome data; write programme assignment; webhooks. Maps to your assign-templates + get-patient-details + webhooks endpoints.
- **How do clinics connect / what auth?** Per-clinic, each authorises its own account, no shared keys. "Can you confirm your OAuth direction - are you the provider, or are we? We can also start with per-practitioner tokens."
- **Expected volume / rate?** Low to start (Spires + a handful), event-driven not polling-heavy, we respect rate limits and can batch.
- **Where does data live / security / GDPR?** EU residency (Supabase, Ireland), read-only mirror, encrypted, minimal PII, clinic owns its data, DPA in place.
- **Sandbox?** "Can we get sandbox credentials for a single-clinic pilot today or this week?"

### Sven (commercial)
- **Who are you, what stage?** Early but real: live product, own clinic on Physitrack, building the clinic OS, pipeline of private physio clinics.
- **Are you a competitor?** No - see the spine. You orchestrate, they deliver. (Mind the Nexa/Ava line below.)
- **Commercial model between us?** Propose: revenue-neutral pilot first, then either a referral/channel arrangement (you bring subscriptions) or a partner API tier. Open to their standard partner terms.
- **Rollout?** Spires now, then the pipeline.
- **What do you need from us?** API Usage Agreement + sandbox.

## 5. Competitive landmines (do not walk into these)
- **Nexa (their AI triage) vs Ava (your AI receptionist).** Do NOT pitch Ava as triage or assessment. "Ava is the front-desk / phone / scheduling layer. Clinical triage is your domain - Nexa is exactly the kind of thing we would want to surface, not rebuild."
- **Outcomes / PROMs / adherence are theirs.** You display them, you do not generate them.
- **Do not oversell Evidence (RAG).** It is clinician decision support, a separate lane, not their content. Keep it out of this call unless asked.

## 6. Demo - right-sized for 30 minutes (VERIFIED + SEEDED 14 Jun)
Reality: this is discovery. Budget **~5 min max** for show-and-tell, only if it lands. A clean screen-share beats a flaky live demo.

**LOGIN: jamal@spiresphysiotherapy.com / spires2015** (now a superadmin, lands on /admin, sees all clinics). The clinic with real data is **clinic-spires** (153 patients, 290 appointments, 11 weeks of metrics seeded from the real WriteUpp export).

Surfaces, in order to show:
1. **Settings -> HEP Integration card = hero surface.** Physitrack wired as a provider tile with a "Programme Assignment" badge, PMS = Cliniko Connected. The 30-second proof: "here is where Physitrack plugs into our integration layer." LEAD WITH THIS. (screenshots/settings-hep.png)
2. **Admin -> Integration Health** (superadmin only, now works): 3 integrations, success-rate / degraded / down tiles, per-clinic sync table with clinic-spires Healthy at 96.3%. Shows the monitoring Physitrack data would sit inside. (screenshots/sa-integration-health.png)
3. **Pulse / Continuity** now shows the full ~150 patient board (was empty before the seed). (screenshots/sa-continuity.png)
4. **Dashboard** loads with real clinicians + a rich Insights-to-Action feed. (screenshots/sa-dashboard.png)

**KNOWN GOTCHA:** the seeded data is real Spires history from **Jan-Mar 2026**, so the dashboard's "last 30 days / this month" headline tiles (Revenue, appointments, follow-up rate) read near-zero - the window is June. The Insights feed, patient board, and Integration Health are all populated regardless. For a Physitrack audience this is fine (they care about the integration surfaces, not your clinic's June KPIs). If you want the headline tiles alive too, ask and I will shift the seed dates into the recent window.

App is light-themed (your Xero/Bloomberg aesthetic); the dark one-pager is the leave-behind. Both on-brand.
**Pre-call:** close other heavy local processes (dev cold-compiles take 30-60s under load), pre-warm each route once, sign in as the superadmin above. Do NOT live-code.

## 7. Functionality to get up to scratch before Wed (decide scope, do not gold-plate)
**Must:** dashboard loads clean on a shared screen, real Spires data, no console errors, StrydeOS dark theme, no lorem/placeholder. A tangible "Physitrack" surface exists in the UI even if mocked. Integration health view shows honest connection state.
**Nice:** Pulse adherence panel with a sample patient + re-engagement action. A one-screen "data we would read / write" map to share.
**Skip:** real live Physitrack API calls (you do not have creds - that is the call). Ava / Evidence in this story.

## 8. Opening (about 90 seconds)
"Thanks both. Quick frame: StrydeOS is the operating layer above the PMS for private physio. We do not build exercise content, telehealth, or triage - that is you, and you are the best at it. What we do is surface Physitrack adherence and outcomes into one clinic view, and trigger programme assignment automatically off PMS events, so clinicians stop double-keying and patients do not fall through the gaps. We run our own clinic, Spires, on Physitrack and WriteUpp, so we build on real data not slides. Today I would love to understand your API access path and partner model, and show you where you slot in."

## 9. Questions to ask THEM (signals you are serious + technical)
- Fastest path to sandbox access for a single-clinic pilot?
- OAuth: are you the provider or are we? Per-practitioner token vs per-clinic?
- Which webhook events are available - assignment, adherence, completion?
- Adherence granularity via API - per-exercise, per-session, completion %?
- Any partner tier or commercial expectation we should know now?
- What does the commercial relationship with a Jane / Cliniko-style partner look like?

## 10. Leave the call with (the close)
- Sandbox credentials, or the named path to them.
- The API Usage Agreement to review.
- Kamil as the named technical contact.
- Agreement to a 1-clinic Spires pilot.
- A dated next step.

## 11. How not to blow it
- Be honest you are early. Lead with realness (Spires, live product), not vanity numbers.
- Never position as a competitor. Never ask for a shared master key - per-clinic auth IS your credibility.
- Keep to time. It is their 30 minutes.
- RSVP Yes before the day.
