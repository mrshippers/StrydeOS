# Physitrack Call - Findings

## Logistics (CORRECTED)
- **Wed 17 June 2026, 13:00-13:30 BST** (08:00-08:30 ET). Google Meet: https://meet.google.com/wrm-bcda-xnn
- It is **30 minutes, not an hour.** Invite is explicit. Prep a tight discovery call, not a long demo.
- Organiser: **Kamil Wyszynski - Technical Product Manager** (the technical gatekeeper for API access).
- **Sven Ehlers** - cc'd, marked optional. Likely BD / partnerships angle.

## What this call actually is
- NOT a clinic sales pitch. It is a **partner / API-access discovery call** with the vendor whose API StrydeOS wants to consume.
- Jamal already stated the ask in writing (8 Jun email). Reaffirm, do not re-explain from scratch.

## The ask (Jamal's own words, already sent)
- StrydeOS = orchestration layer above the PMS (WriteUpp, Cliniko) for private physio.
- On Physitrack want: **per-clinic OAuth** (each clinic authorises its own account, no shared keys), **read-only adherence + programme data** into the dashboard, **programme assignment via API triggered by PMS events.**
- Spires (own London clinic) runs Physitrack + WriteUpp = real data / design partner.

## Physitrack intel (web, June 2026)
- **Partner bar:** usually only integrate commercial PMS/EHR with 500+ practitioners; exceptions for 50+ practitioner practices on in-house PMS. May require **API Usage Agreement.** => StrydeOS must justify an exception. Angle = per-clinic authorised subscribers + Spires pilot + channel/distribution of net-new subscriptions.
- **Auth:** supports basic shared-secret token (practitioner adds token to their Physitrack account) AND OAuth (partner system is the OAuth provider). Clarify direction on the call.
- **API capability:** RESTful - assign templates, get patient details; register webhooks for events. Maps cleanly to the ask.
- **Products:** Lifecare/Physitrack Platform (17k+ exercises, HEP, telehealth, PROMs, outcomes), Champion Health (wellness), **Nexa = AI digital triage agent.**
- Competitive overlap to manage: Nexa (AI triage) vs Ava (AI receptionist). Outcomes/PROMs/adherence are theirs.

## StrydeOS state (for demo scoping)
- Dashboard in /dashboard/; modules Intelligence GBP129, Ava GBP199, Pulse GBP149, Full Stack GBP399.
- Pulse = adherence / re-engagement. Cliniko polling live; Spires on WriteUpp + Physitrack.
- No live Physitrack API creds yet (that is the point of the call). Any Physitrack panel = mocked / Spires-framed, do not claim live.

Sources: physitrack.com/developer-information, support.physitrack.com, physitrackgroup.com/products
