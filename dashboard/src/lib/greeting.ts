import type { WeeklyStats, Patient, Clinician } from "@/types";
import { formatRate, formatPence } from "@/lib/utils";

// ─── Data contract ──────────────────────────────────────────────────────────

export interface GreetingData {
  latest: WeeklyStats | null;
  previous: WeeklyStats | null;
  patients: Patient[];
  clinicians: Clinician[];
  selectedClinician: string; // "all" or clinicianId
  unreadInsightCount: number;
  /** Days since the `latest` WeeklyStats doc was computed (NaN/undefined if unknown). */
  dataAgeDays?: number;
}

// ─── Prompt rules (priority waterfall — first match wins) ───────────────────

interface PromptRule {
  id: string;
  condition: (d: GreetingData) => boolean;
  template: (d: GreetingData) => string;
}

function churnCount(d: GreetingData): number {
  const pts =
    d.selectedClinician === "all"
      ? d.patients
      : d.patients.filter((p) => p.clinicianId === d.selectedClinician);
  return pts.filter((p) => !p.discharged && p.churnRisk).length;
}

function churnRevenue(d: GreetingData): number {
  const pts =
    d.selectedClinician === "all"
      ? d.patients
      : d.patients.filter((p) => p.clinicianId === d.selectedClinician);
  const revPerSession = d.latest?.revenuePerSessionPence ?? 0;
  return pts
    .filter((p) => !p.discharged && p.churnRisk)
    .reduce((sum, p) => sum + Math.max(0, p.courseLength - p.sessionCount) * revPerSession, 0);
}

function isDataStale(d: GreetingData, days: number): boolean {
  return typeof d.dataAgeDays === "number" && isFinite(d.dataAgeDays) && d.dataAgeDays > days;
}

const PROMPT_RULES: PromptRule[] = [
  // ── Stale data guard — must run first, otherwise every downstream rule
  //     ends up citing numbers that are weeks out of date.
  {
    id: "STALE_DATA",
    condition: (d) => !!d.latest && isDataStale(d, 7),
    template: (d) => {
      const days = Math.round(d.dataAgeDays!);
      const wk = d.latest!.weekStart;
      return `Metrics below are from w/c ${wk} — last synced ${days} days ago. Refresh to see current numbers.`;
    },
  },

  // ── Critical alerts ───────────────────────────────────────────────────────
  {
    id: "HIGH_DNA",
    condition: (d) => !!d.latest && d.latest.dnaRate > 0.12,
    template: (d) =>
      `${Math.round(d.latest!.dnaRate * 100)}% DNA rate this week \u2014 above the danger line.`,
  },
  {
    id: "FOLLOWUP_DANGER",
    condition: (d) =>
      !!d.latest && d.latest.followUpRate < d.latest.followUpTarget * 0.85,
    template: (d) => {
      const gap = (d.latest!.followUpTarget - d.latest!.followUpRate).toFixed(1);
      return `Follow-up rate at ${formatRate(d.latest!.followUpRate)} against a ${formatRate(d.latest!.followUpTarget)} target. ${gap} sessions per patient to close.`;
    },
  },
  {
    id: "CHURN_CLUSTER",
    condition: (d) => !!d.latest && churnCount(d) >= 5,
    template: (d) =>
      `${churnCount(d)} patients at churn risk \u2014 roughly ${formatPence(churnRevenue(d))} in open course value.`,
  },

  // ── Week-on-week trend signals ────────────────────────────────────────────
  {
    id: "DNA_SPIKE",
    condition: (d) =>
      !!d.latest &&
      !!d.previous &&
      d.latest.dnaRate > d.previous.dnaRate * 1.5 &&
      d.latest.dnaRate > 0.06,
    template: (d) => {
      const delta = Math.round(
        ((d.latest!.dnaRate - d.previous!.dnaRate) / d.previous!.dnaRate) * 100
      );
      return `DNA rate up ${delta}% week-on-week. Worth checking which slots are dropping.`;
    },
  },
  {
    id: "FOLLOWUP_IMPROVING",
    condition: (d) =>
      !!d.latest &&
      !!d.previous &&
      d.latest.followUpRate > d.previous.followUpRate * 1.1 &&
      d.latest.followUpRate < d.latest.followUpTarget,
    template: (d) =>
      `Follow-up rate climbing \u2014 ${formatRate(d.latest!.followUpRate)}, up from ${formatRate(d.previous!.followUpRate)} last week.`,
  },
  {
    id: "REVENUE_DROP",
    condition: (d) =>
      !!d.latest &&
      !!d.previous &&
      d.previous.revenuePerSessionPence > 0 &&
      d.latest.revenuePerSessionPence < d.previous.revenuePerSessionPence * 0.9,
    template: (d) => {
      const drop = Math.round(
        ((d.previous!.revenuePerSessionPence - d.latest!.revenuePerSessionPence) /
          d.previous!.revenuePerSessionPence) *
          100
      );
      return `Revenue per session down ${drop}% this week. Check for missed billings or DNA-heavy sessions.`;
    },
  },

  // ── Insight integration ───────────────────────────────────────────────────
  // Only surface unread insights when the underlying data is recent. Insights
  // generated on stale pipeline runs shouldn't be framed as "may need action".
  {
    id: "UNREAD_INSIGHTS",
    condition: (d) => d.unreadInsightCount >= 2 && !isDataStale(d, 14),
    template: (d) =>
      `${d.unreadInsightCount} unread insights in Intelligence. The top one may need action.`,
  },

  // ── Utilisation context ───────────────────────────────────────────────────
  {
    id: "NEAR_CAPACITY",
    condition: (d) => !!d.latest && d.latest.utilisationRate >= 0.92,
    template: (d) =>
      `${Math.round(d.latest!.utilisationRate * 100)}% utilisation \u2014 running near capacity across ${d.latest!.appointmentsTotal} appointments.`,
  },
  {
    id: "LOW_UTILISATION",
    condition: (d) => !!d.latest && d.latest.utilisationRate < 0.65,
    template: (d) => {
      const util = d.latest!.utilisationRate;
      const total = d.latest!.appointmentsTotal;
      const room = util > 0 ? Math.round(total * ((1 - util) / util)) : 0;
      return `${Math.round(util * 100)}% utilisation this week. Room for ~${room} more bookings.`;
    },
  },

  // ── Positive reinforcement ────────────────────────────────────────────────
  {
    id: "ALL_GREEN",
    condition: (d) =>
      !!d.latest &&
      d.latest.followUpRate >= d.latest.followUpTarget &&
      d.latest.hepRate >= 0.95 &&
      d.latest.dnaRate <= 0.05,
    template: (d) =>
      `All KPIs on target. ${d.latest!.appointmentsTotal} appointments, ${formatRate(d.latest!.followUpRate)} follow-up rate, ${Math.round(d.latest!.dnaRate * 100)}% DNA.`,
  },

  // ── Default contextual (always matches) ───────────────────────────────────
  {
    id: "DEFAULT_CONTEXTUAL",
    condition: () => true,
    template: (d) =>
      `${d.latest!.appointmentsTotal} appointments this week \u2014 ${d.latest!.followUps} follow-ups from ${d.latest!.initialAssessments} initial assessments.`,
  },
];

// ─── Subtext selection ──────────────────────────────────────────────────────

function selectSubtext(data: GreetingData, day: string): string {
  if (!data.latest) {
    return `Here\u2019s your weekly overview for ${day}.`;
  }

  for (const rule of PROMPT_RULES) {
    if (rule.condition(data)) {
      return rule.template(data);
    }
  }

  return `Here\u2019s this week at a glance.`;
}

// ─── Greeting pools ─────────────────────────────────────────────────────────

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

type GreetingPool = { withName: string[]; withoutName: string[] };

const GREETINGS_FIRST_MOUNT: GreetingPool = {
  withName: [
    "Welcome back, {name}",
    "Good to see you, {name}",
    "Hey {name}. Let\u2019s take a look",
  ],
  withoutName: [
    "Welcome back",
    "Good to see you",
    "Hey. Let\u2019s take a look",
  ],
};

const GREETINGS_MORNING: GreetingPool = {
  withName: [
    "Morning, {name}. I\u2019ve already read the numbers",
    "Morning, {name}. Fresh week, fresh data",
    "Morning, {name}. The data didn\u2019t sleep either",
    "Good morning, {name}. Here\u2019s where things stand",
    "Morning, {name}. Coffee first, then metrics",
    "Top of the morning, {name}. Your numbers are ready",
    "Hey {name}. Early bird gets the insights",
    "Morning, {name}. Let\u2019s see how the week\u2019s shaping up",
  ],
  withoutName: [
    "Morning. I\u2019ve already read the numbers",
    "Morning. Fresh week, fresh data",
    "Morning. The data didn\u2019t sleep either",
    "Good morning. Here\u2019s where things stand",
    "Morning. Coffee first, then metrics",
    "Top of the morning. Your numbers are ready",
    "Hey. Early bird gets the insights",
    "Morning. Let\u2019s see how the week\u2019s shaping up",
  ],
};

const GREETINGS_AFTERNOON: GreetingPool = {
  withName: [
    "Afternoon, {name}. The clinic\u2019s been busy \u2014 I\u2019ve been busier",
    "Afternoon, {name}. Nothing\u2019s on fire. Mostly",
    "Hey {name}. Quick check-in before the next patient",
    "Afternoon, {name}. Your numbers are looking interesting",
    "Hey {name}. Halfway through \u2014 here\u2019s the picture so far",
    "Afternoon, {name}. I\u2019ve been keeping score",
    "Good afternoon, {name}. Let\u2019s see where you\u2019re at",
    "Hey {name}. The data\u2019s been waiting for you",
  ],
  withoutName: [
    "Afternoon. The clinic\u2019s been busy \u2014 I\u2019ve been busier",
    "Afternoon. Nothing\u2019s on fire. Mostly",
    "Quick check-in before the next patient",
    "Afternoon. Your numbers are looking interesting",
    "Halfway through \u2014 here\u2019s the picture so far",
    "Afternoon. I\u2019ve been keeping score",
    "Good afternoon. Let\u2019s see where you\u2019re at",
    "The data\u2019s been waiting for you",
  ],
};

const GREETINGS_EVENING: GreetingPool = {
  withName: [
    "Evening, {name}. Another one in the books",
    "Evening, {name}. Let\u2019s see how it went",
    "Evening, {name}. I saved you a summary",
    "Hey {name}. Good day at the clinic?",
    "Evening, {name}. Here\u2019s the debrief",
    "Day\u2019s done, {name}. Numbers are in",
    "Evening, {name}. Time to see what the data says",
    "Hey {name}. Winding down? Here\u2019s the rundown",
  ],
  withoutName: [
    "Evening. Another one in the books",
    "Evening. Let\u2019s see how it went",
    "Evening. I saved you a summary",
    "Good day at the clinic?",
    "Evening. Here\u2019s the debrief",
    "Day\u2019s done. Numbers are in",
    "Evening. Time to see what the data says",
    "Winding down? Here\u2019s the rundown",
  ],
};

const GREETINGS_LATE: GreetingPool = {
  withName: [
    "You\u2019re up late, {name}. So am I, apparently",
    "After-hours, {name}. Dedication noted",
    "Still here, {name}? Same",
    "Burning the midnight oil, {name}. I\u2019ll keep you company",
    "Late one, {name}. The numbers never sleep",
    "Hey {name}. Night owl mode activated",
    "Can\u2019t sleep either, {name}? Let\u2019s look at the data",
    "After midnight, {name}. Your dashboard doesn\u2019t judge",
  ],
  withoutName: [
    "You\u2019re up late. So am I, apparently",
    "After-hours. Dedication noted",
    "Still here? Same",
    "Burning the midnight oil. I\u2019ll keep you company",
    "Late one. The numbers never sleep",
    "Night owl mode activated",
    "Can\u2019t sleep either? Let\u2019s look at the data",
    "After midnight. Your dashboard doesn\u2019t judge",
  ],
};

// ─── Session-persistent greeting ────────────────────────────────────────────

const SESSION_GREETED_KEY = "strydeos_greeted";
const SESSION_GREETING_KEY = "strydeos_greeting_text";

/**
 * Returns a greeting that is stable for the entire browser session.
 * The greeting is picked once and stored in sessionStorage so re-renders,
 * data loads, and banner dismissals don't cause the greeting to change.
 */
export function getGreeting(
  firstName: string,
  isFirstMount: boolean,
  data: GreetingData
): { greeting: string; subtext: string } {
  const name = firstName || "";

  // Check for a session-cached greeting first
  let greeting: string | null = null;
  try {
    greeting = sessionStorage.getItem(SESSION_GREETING_KEY);
  } catch { /* sessionStorage unavailable */ }

  if (!greeting) {
    const hour = new Date().getHours();

    let pool: GreetingPool;
    if (isFirstMount) {
      pool = GREETINGS_FIRST_MOUNT;
    } else if (hour >= 5 && hour < 12) {
      pool = GREETINGS_MORNING;
    } else if (hour >= 12 && hour < 17) {
      pool = GREETINGS_AFTERNOON;
    } else if (hour >= 17 && hour < 22) {
      pool = GREETINGS_EVENING;
    } else {
      pool = GREETINGS_LATE;
    }

    const template = name
      ? pickRandom(pool.withName)
      : pickRandom(pool.withoutName);
    greeting = template.replace(/\{name\}/g, name);

    try {
      sessionStorage.setItem(SESSION_GREETING_KEY, greeting);
    } catch { /* sessionStorage unavailable */ }
  }

  const day = new Date().toLocaleDateString("en-GB", { weekday: "long" });
  const subtext = selectSubtext(data, day);

  return { greeting, subtext };
}

export { SESSION_GREETED_KEY };
