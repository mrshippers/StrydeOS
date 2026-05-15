# Cliniko UI Analysis — StrydeOS Integration Brief

**Trial account:** `tgt-physiotherapy.uk3.cliniko.com`
**Email:** `jamal@driiva.co.uk`
**Password:** `StrydeTest2026!`
**API key:** `MS0xOTUwMTgzNTE0NDQ4MDc5NTkwLUw1cG1IQnZ3NnhtM2IySGRJQzNzVExiUHNZRG1iUi9K`
**Shard:** `uk3` → base URL: `https://api.uk3.cliniko.com/v1`

---

## What Cliniko Actually Is

Cliniko is a PMS — it owns the operational layer: booking, patient records, treatment notes, invoicing, comms. It is what physios live in day-to-day.

StrydeOS does not replace this. It reads the data Cliniko generates and turns it into KPIs, retention scoring, and AI call handling. The relationship is: Cliniko produces, StrydeOS consumes.

---

## UI Structure — What Each Section Contains

### Dashboard
- **Message board** — internal team comms (not useful to StrydeOS)
- **Draft treatment notes** — clinician-facing to-do list
- **Recent SMS replies** — patient reply log

No KPI data here. All the useful data lives in Appointments, Patients, and Invoices.

### Appointments
Calendar/schedule view of `individual_appointments`. Per-appointment: practitioner, patient, time, appointment type. Status is derived from boolean flags:
- `did_not_arrive` → DNA
- `cancelled_at` → cancelled
- `patient_arrived` → completed
- else → scheduled

**This is the primary StrydeOS data source** for follow-up rate, DNA rate, and utilisation.

### Patients
Full patient records: name, email, phone, DOB, concession type, DVA card. No lifecycle state here — that's computed by StrydeOS from appointment patterns. No HEP data — that comes from Physitrack/RMP.

### Invoices
Per-session billing with actual revenue amounts. **Not yet in the StrydeOS adapter.** Currently revenue per session is inferred from appointment data, but Invoices is the accurate source and handles concessions, discounts, and cancellation fees.

### Communications
SMS template management and reminder settings. Cliniko has its own native comms layer (reminders, recalls). StrydeOS Pulse owns comms at the AI layer — these must not double-fire. The Settings → Appointment reminders section shows exactly what Cliniko is already sending.

### Reports
Cliniko's built-in analytics: appointment counts, practitioner utilisation, revenue, DNA rates. Good for cross-checking StrydeOS Intelligence KPIs. Missing: benchmarking, coaching layer, retention scoring. Direct overlap but Cliniko's version is backward-looking raw data — no intelligence layer.

### Settings — Key Sections for StrydeOS Integration
| Setting | Why it matters |
|---|---|
| `Appointment types` | Needed to classify IA vs follow-up for follow-up rate calculation |
| `Users & practitioners` | Where the API key lives — also practitioner list |
| `Appointment reminders` | Know what Cliniko is already sending (avoid Pulse double-firing) |
| `Data exports` | CSV fallback if API is blocked |

---

## How Cliniko API Works (Auth Model)

HTTP Basic auth — API key as username, `"x"` as password. No OAuth. No webhooks. Polling only.

```
Authorization: Basic base64(API_KEY:x)
```

Key endpoints StrydeOS currently uses:
| Endpoint | Purpose |
|---|---|
| `GET /individual_appointments` | Appointments with status flags |
| `GET /practitioners` | Clinician list |
| `GET /patients/{id}` | Patient record |
| `POST /individual_appointments` | Create appointment (Ava booking) |

Key endpoints **not yet used** by StrydeOS:
| Endpoint | What we're missing |
|---|---|
| `GET /invoices` | Accurate revenue per session |
| `GET /treatment_notes` | Clinical complexity signals |
| `GET /appointment_types` | IA vs follow-up classification |

---

## Gap Analysis — Adapter vs. Reality

### Bug 1 — Wrong Shard Probes (Critical, Blocks Second Clinic)
`client.ts` probes: `au1`, `uk1`, `us1`

This trial account is on **`uk3`**. Any UK clinic on uk2/uk3/uk4 silently fails auto-detect. Fix:

```ts
// client.ts — line: const SHARD_PROBES = [...]
const SHARD_PROBES = ["uk1", "uk2", "uk3", "uk4", "au1", "au2", "us1", "ca1"];
```

### Gap 2 — No Invoice Endpoint
Revenue KPI is less accurate without `/invoices`. Clinics with variable pricing (concessions, multi-session packages) will show wrong numbers. Medium priority but should be added before onboarding clinic 2.

### Gap 3 — No Appointment Type Classification
Follow-up rate = follow-ups ÷ IAs. The adapter extracts the appointment type ID from the link URL but never resolves what type it is. For a new clinic, the type IDs are unknown. Need a one-time setup step where the owner maps their Cliniko appointment types to IA/follow-up. This belongs in the onboarding wizard.

### Gap 4 — No Onboarding Wizard (v0.12.0 P0)
The adapter code works. There is no UI for a second clinic to:
1. Enter their Cliniko API key
2. Auto-detect their shard
3. Run a test connection
4. Map their appointment types to StrydeOS categories
5. Trigger first sync

---

## What Works Right Now

The adapter is well-built for what it does:
- Correct auth model (Basic + `x` password) ✓
- Correct status derivation from Cliniko's boolean flags ✓
- Pagination via `clinikoFetchAll` ✓
- Rate limit handling and error messages ✓
- `testConnection()` method exists ✓

If you manually set `baseUrl: "https://api.uk3.cliniko.com/v1"` and pass the API key above into the adapter config, it will pull real data from the TGT Physiotherapy trial account right now.

---

## Cliniko vs. WriteUpp — Data Availability

| KPI | WriteUpp (live at Spires) | Cliniko (TGT trial) |
|---|---|---|
| Follow-up rate | ✓ | ✓ (needs appointment types mapped) |
| DNA rate | ✓ | ✓ (`did_not_arrive` flag) |
| Utilisation | ✓ | ✓ |
| Revenue per session | ✓ | ⚠️ (needs invoices endpoint) |
| HEP compliance | Via Physitrack | Via Physitrack/RMP separately |
| NPS | Manual / Pulse | Manual / Pulse |

Cliniko's data model is cleaner than WriteUpp's (explicit booleans vs string statuses). Roughly equivalent KPI coverage once the invoice endpoint is added.

---

## Immediate Next Actions

1. **Fix `SHARD_PROBES`** in `dashboard/src/lib/integrations/pms/cliniko/client.ts` — add uk2/uk3/uk4 (10 min)
2. **Add test data** to TGT Physiotherapy trial — create a practitioner, 10 patients, 3 weeks of appointments with some DNAs
3. **Wire manually** — pass the API key + uk3 shard directly into the adapter and run a sync, see what hits Intelligence
4. **Build onboarding wizard** — PMS selection → API key → shard auto-detect → type mapping → first sync
5. **Add `/invoices` endpoint** to the adapter

