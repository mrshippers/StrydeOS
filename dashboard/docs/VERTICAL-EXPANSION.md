# StrydeOS Vertical Expansion — Scaffold

Return-to reference for adapting StrydeOS to each vertical. Same platform, same three-stakeholder model. Only the KPIs, PMS integrations, and copy change.

---

## The Universal Playbook

Every vertical follows the same pattern:

1. **Owner can't see what's happening** → StrydeOS shows them
2. **Clinician/practitioner has no feedback loop** → StrydeOS creates one
3. **Patient drops off silently** → StrydeOS catches it early
4. **Revenue leaks invisibly** → StrydeOS quantifies it

The pitch is always: "You can't manage what you can't measure."

---

## Chiropractic / Osteopathy

### Why it's first after physio
- Same PMS ecosystem (Cliniko, Jane, Power Diary)
- Same treatment model (initial assessment → course of care → discharge)
- Same blind spots (rebooking, mid-programme dropout, no NPS)
- Until members are exactly this demographic — solo chiro/osteo practitioners

### KPIs (recalibrated from physio)

| Metric | Chiro/Osteo equivalent | Notes |
|--------|----------------------|-------|
| Follow-up rate | Rebooking rate | Same calc — follow-ups ÷ initial consults |
| HEP compliance | Home care plan adherence | Fewer formal HEP programmes — may track advice sheets instead |
| Programme assignment | Treatment plan acceptance | Did the patient agree to the recommended course? |
| Utilisation | Utilisation | Identical — booked ÷ available |
| DNA rate | DNA rate | Identical |
| Revenue per session | Revenue per session | Typically higher per session than physio (£50-80 vs £40-65) |
| NPS | NPS | Identical flow — works out of the box |

### PMS Integrations needed
- **Cliniko** (already live)
- **Jane App** (on roadmap — dominant in chiro/osteo, especially Canada + AU)
- **Power Diary / Zanda** (already live)

### Landing page copy angles
- "Your patients aren't coming back. You just don't know which ones."
- "You're losing £X/month from patients who started care and never rebooked."
- "Every chiropractor thinks they're busy. StrydeOS shows you whether that's true."

### Until channel
- Solo practitioners, commercially savvy, premium-positioned
- They'll respond to: ROI, time savings, looking professional
- They're already paying for nice things — StrydeOS Solo tier fits naturally
- Demo pathway: "See what Andrew's numbers look like at Spires" → real data, real gaps

---

## Sports Therapy / Sports Rehab

### Why it's close to physio
- Virtually identical clinical model
- Often shares PMS with physio (Cliniko, WriteUpp)
- Higher average session price (performance athletes pay more)
- Outcome measures even more relevant (return-to-sport timelines)

### KPI differences
- **Return-to-sport rate** — did the athlete get back to their sport/level? (Unique to this vertical)
- **Programme adherence** — athletes are more engaged with HEP, so higher baseline expected
- Higher NPS expected — sports patients are more motivated, but also more demanding

### Landing page copy angles
- "Your athletes trust you with their season. Show them the data to prove it."
- "Return-to-sport rate is the metric that builds your reputation. Are you tracking it?"

---

## Medspa / Aesthetics

### Why it's different (and lucrative)
- Course-based treatments (e.g. 6x laser sessions, Botox every 3 months)
- Rebooking IS the business — lifetime value per client is everything
- Much higher revenue per client than MSK
- Owners are even more commercially minded (margins, conversion, LTV)

### KPIs (significantly different)

| Metric | Medspa equivalent | Notes |
|--------|------------------|-------|
| Follow-up rate | Course completion rate | Did they complete all 6 sessions? |
| HEP compliance | Aftercare compliance | Did they follow post-treatment instructions? |
| Programme assignment | Upsell / cross-sell rate | Did they book additional treatments? |
| Utilisation | Chair utilisation | Same concept, different language |
| DNA rate | DNA rate | Identical — higher revenue impact per missed slot |
| Revenue per session | Revenue per treatment | Much higher (£100-500+) |
| NPS | NPS | Identical flow — Google Reviews even more critical for aesthetics |
| — | **Client retention rate** | New metric: % of clients who return within 90 days |
| — | **Treatment plan acceptance** | New metric: presented treatment plan vs booked |

### PMS Integrations needed
- **Pabau** (dominant in UK aesthetics — awaiting API key)
- **Fresha** (booking-heavy, less clinical)
- **Aesthetic iQ** (niche but growing)

### Landing page copy angles
- "Your best clients ghost after 3 sessions. StrydeOS catches them before they leave."
- "Every empty chair is £200 you'll never get back."
- "You know your treatments work. StrydeOS proves it — to your clients and to Google."

### Key differences from MSK
- Language: "clients" not "patients", "treatments" not "sessions", "practitioners" not "clinicians"
- Aesthetics buyers care about: LTV, rebooking revenue, Google/Instagram reviews
- Less clinical outcome focus, more commercial outcome focus
- Dark mode dashboard will appeal — aesthetics brands skew premium/dark

---

## Dental

### Why it's the biggest market
- Massive private practice market in the UK
- Hygienist utilisation is the #1 blind spot (same as physio utilisation)
- Recall rate (6-monthly check-ups) is the dental equivalent of rebooking
- Treatment plan acceptance is the revenue lever most practices ignore

### KPIs (dental-specific)

| Metric | Dental equivalent | Notes |
|--------|------------------|-------|
| Follow-up rate | Recall rate | % of patients who return for their 6-month check-up |
| HEP compliance | Oral hygiene compliance | Harder to track — may rely on hygienist notes |
| Programme assignment | Treatment plan acceptance | Presented vs accepted vs completed |
| Utilisation | Chair utilisation | Critical — dental chairs are expensive |
| DNA rate | DNA rate | Identical — very high in dental (10-15% industry average) |
| Revenue per session | Revenue per appointment | Mix of NHS and private — track private separately |
| NPS | NPS | Identical flow |
| — | **Hygienist utilisation** | New metric: hygienist specifically (often underbooked) |
| — | **Case acceptance rate** | New metric: £ value of treatment presented vs accepted |

### PMS Integrations needed
- **Dentally** (cloud-native, modern — best first target)
- **SOE (Software of Excellence)** (legacy but dominant)
- **Exact / Henry Schein One** (large install base)
- **Aerona** (growing in UK)

### Landing page copy angles
- "Your hygienist has 8 empty slots this week. You didn't know."
- "73% of treatment plans go unaccepted. StrydeOS shows you which ones and why."
- "Your recall rate is your revenue forecast. What's yours?"

### Key differences from MSK
- Language: "dentist/hygienist" not "clinician", "recall" not "follow-up", "case acceptance" not "programme assignment"
- Dental owners are VERY numbers-driven (they already think in chair-hours)
- NHS/private split adds complexity — StrydeOS should focus on private revenue only
- Regulatory: CQC compliance angle could be a differentiator

---

## Cross-Vertical Constants

These stay the same regardless of vertical:

1. **Three-stakeholder model** — owner / practitioner / patient (client)
2. **NPS → Google Review pipeline** — works identically everywhere
3. **Detractor alerting** — same urgency, same flow
4. **Revenue leakage detection** — same formula (sessions remaining × avg price)
5. **The pitch** — "You can't manage what you can't measure"
6. **Dashboard UX** — same layout, same brand tokens, vertical-specific empty states
7. **Pricing** — Solo / Studio / Clinic tiers apply to all verticals

---

## Landing Page Template

Each vertical landing page needs:

1. **Hero** — vertical-specific headline + the contrast ("You think X. Reality is Y.")
2. **3 stat cards** — the three most shocking blind spots for that vertical
3. **How it works** — 3-step: Connect PMS → See your numbers → Act on insights
4. **Social proof** — Spires data (physio) initially, then vertical-specific once live
5. **Pricing** — link to main pricing page
6. **CTA** — "See your clinic's numbers in 5 minutes"

---

## Priority Order

1. **Chiro landing page** — closest to physio, Until channel ready, minimal KPI recalibration
2. **Medspa materials** — Pabau integration unlocks this, highest revenue per client
3. **Dental materials** — biggest market, most PMS work needed, save for post-Series A
4. **Sports therapy** — can share the physio landing page with minor copy tweaks
