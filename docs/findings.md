# Findings — Owner Summary Dashboard

## Existing Data Shapes

### Appointment (appointments collection)
- `revenueAmountPence: number` — per-session revenue ✓
- `status: "scheduled" | "completed" | "dna" | "cancelled" | "late_cancel"`
- `dateTime: string` — ISO datetime, filter by date portion for today

### Patient (patients collection)
- `lifecycleState: "AT_RISK" | "LAPSED" | "CHURNED" | ...`
- `nextSessionDate: string | null`
- `lastSessionDate: string | null`
- `discharged: boolean`
- `name: string` — use for retention alert list

### WeeklyStats (metrics_weekly)
- `utilisationRate: number` — ratio (0–1)
- `clinicianName: string`
- `weekStart: string`

## Existing Hooks / Queries
- `subscribeAppointments(clinicId, clinicianId, sinceDate, onData, onError)` — already used in useIntelligenceData
- `subscribePatients(clinicId, clinicianId, onData, onError)` — already used
- `useClinicianSummaryStats()` — returns `{ rows: ClinicianSummaryRow[], loading, error }` — each row has `stats.utilisationRate` ✓
- Both hooks use onSnapshot — live updates without polling

## Current /dashboard/page.tsx
- Very large (~1200 lines) "use client" component
- Uses: StatCard, CliniciansTable, LiveActivityFeed, motion/react animations
- Has clinician picker, week navigation, scroll-based hero
- Plan: surgically replace the body content section only, keep auth/role wrappers

## Brand Token Usage in Codebase
- Navy surface: `style={{ background: "linear-gradient(135deg, #0B2545 0%, #132D5E 100%)" }}`
- Card radius: `rounded-[var(--radius-card)]`
- Animate pulse skeletons: `animate-pulse bg-cloud-light rounded-[var(--radius-card)] h-[200px]`

## Demo Data Pattern
- Check `user?.uid === "demo"` — return static demo object
- useIntelligenceData demo example: `if (isDemo) return DEMO_RESULT`
- Demo names used in other files: "Sarah Mitchell", "Tom Okafor", "Emma Clarke" (fictional, never Spires)
