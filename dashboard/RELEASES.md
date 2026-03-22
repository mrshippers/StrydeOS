# StrydeOS Releases

> Each release is a post. One screenshot, one headline, one reason to care.
> Rip these straight into LinkedIn / X / email. No fluff, no filler.

---

## v0.8.5 — The Trust Layer
*Infrastructure that proves you're not a side project.*

Your clinic's uptime, at a glance. StrydeOS now monitors 17 connected services in real-time — PMS, voice AI, billing, comms — with a public status page showing 30-day health history. Plus a full API reference (37 endpoints) for anyone who asks "is this thing real?"

**What shipped:**
- Live status page — 17 services pinged in parallel, auto-refresh every 60s
- API documentation — 37 endpoints, searchable, dual-view (owner + developer)
- Error recovery boundary — crashes show a recovery UI, not a white screen
- Pre-commit secret detection — credentials never touch the repo

**Post angle:** *"We built a status page before we had paying customers. That's how you earn trust."*

---

## v0.8.4 — The Polish Pass
*The details that make people trust your product before they trust your pitch.*

Every pixel got attention. The sidebar doesn't snap shut anymore — it breathes. Dark mode actually works. The login page has a password toggle. Small things that compound into "this feels premium."

**What shipped:**
- High-fidelity sidebar motion — sequenced fade, blur, scale, breathing glow strip
- WCAG AA dark mode contrast — tooltips, badges, overlays, chart labels all legible
- Password visibility toggle on sign-in and sign-up
- Demo mode overhaul — 5 rotational data scenarios, realistic UK physio numbers

**Post angle:** *"Nobody notices good UX. They just feel it. Today's update is the kind you feel."*

---

## v0.8.3 — Clinical Depth
*Pulse now sees what's clinically happening — not just operationally.*

Your patient board used to show sessions and risk scores. Now it shows pain levels, psychosocial flags, treatment complexity, and clinical notes — pulled directly from Heidi Health. The physio's clinical record meets the owner's operational view.

**What shipped:**
- Complexity indicators — inline badges for pain score, psych flags, treatment complexity
- Complexity panel — full 6-signal clinical breakdown per patient
- Clinical notes — Heidi-synced session notes with ICD-10/SNOMED codes
- Zero noise — nothing renders unless it's clinically notable

**Post angle:** *"Your dashboard shouldn't just track appointments. It should understand patients."*

---

## v0.8.2 — Your Dashboard Talks Back
*It doesn't say "Good morning" anymore. It says "Your DNA rate spiked 40% — check Thursday slots."*

The dashboard greeting is now driven by your actual clinic data. It picks the most important thing you need to know — churn clusters, revenue drops, follow-up gaps, unread insights — and leads with that. Four personality variants per time slot so it never feels robotic.

**What shipped:**
- Context-aware greeting engine — waterfall rules across 11 KPI conditions
- Greeting personality pools — randomised variants with clinical wit
- Daily snapshot chips — appointments + churn risk count at a glance
- Data-driven subtext — connects directly to revenue impact

**Post angle:** *"Your PMS says 'Good morning.' StrydeOS says 'You have 5 patients about to churn — roughly £1,170 in open course value.'"*

---

## v0.8.1 — Ava Gets a Brain
*Your AI receptionist now knows your clinic — because your team taught her.*

Ava's knowledge base is no longer hardcoded. Clinic staff can add, edit, and organise everything Ava knows — services, team schedules, pricing, policies, FAQs — through a premium in-app editor. Plus: the entire voice stack migrated from Retell AI to ElevenLabs Conversational AI + Twilio SIP.

**What shipped:**
- Knowledge base editor — CRUD by category, Firestore-persisted, syncs to voice agent
- Category suggestions — placeholder templates so clinics aren't starting from blank
- Premium editor UI — glassmorphic header, animated wave layers, breathing status orb
- ElevenLabs + Twilio migration — production-grade voice + telephony stack

**Post angle:** *"Your receptionist should know your cancellation policy, your parking situation, and that Dr. Chen only works Tuesdays. Now she does."*

---

## v0.8.0 — The Intelligence Update
*Your dashboard used to show you numbers. Now it tells you what to do about them.*

The biggest update yet. StrydeOS now detects performance events across your clinic — a clinician's follow-up rate dropping, patients clustering at churn risk, HEP compliance gaps — ranks them by revenue impact, and surfaces the most urgent one directly on your dashboard. Critical alerts hit your notification bell. Weekly digests hit your inbox.

**What shipped:**
- Insight engine — automated event detection across 7 KPI dimensions
- InsightBanner — #1 ranked insight on the dashboard with revenue impact
- Notification bell filtering — only critical/warning alerts, no positive noise
- Owner email notifications — urgent alerts + weekly state-of-clinic digest
- Insight event cards — severity, suggested action, affected clinician, £ impact

**Post angle:** *"Alex had 9 mid-programme patients who didn't rebook this week — roughly £1,170 in estimated leaked revenue. StrydeOS caught it. Would you have?"*

---

## How to use this

1. **Pick a release** — start from v0.8.0 (biggest) or v0.8.2 (most relatable)
2. **Screenshot the feature** — one image, the thing itself
3. **Use the post angle** as your opening line
4. **Add the version number** — "StrydeOS v0.8.2" — it signals velocity
5. **Post 1-2x per week** — you've got 6 releases banked here already
6. **Tag it** — #healthtech #physiotherapy #clinicmanagement #saas

The version numbers compound. By the time you're pitching clinic #2, your LinkedIn shows a product that ships weekly. That's more convincing than any deck.
