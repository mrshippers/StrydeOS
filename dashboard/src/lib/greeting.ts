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

const PROMPT_RULES: PromptRule[] = [
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
  {
    id: "UNREAD_INSIGHTS",
    condition: (d) => d.unreadInsightCount >= 2,
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
  ],
  withoutName: [
    "Welcome back",
  ],
};

const GREETINGS_MORNING: GreetingPool = {
  withName: [
    "Morning, {name}. I've already read the numbers",
    "Morning rounds, {name}",
    "Morning, {name}. The data didn't sleep either",
    "Early start, {name}. I like the commitment",
  ],
  withoutName: [
    "Morning. I've already read the numbers",
    "Morning rounds",
    "Morning. The data didn't sleep either",
    "Early start. I like the commitment",
  ],
};

const GREETINGS_AFTERNOON: GreetingPool = {
  withName: [
    "Afternoon, {name}. The clinic's been busy \u2014 I've been busier",
    "Afternoon clinic, {name}",
    "Afternoon, {name}. Nothing's on fire. Mostly",
    "Midday check-in, {name}. I've been expecting you",
  ],
  withoutName: [
    "Afternoon. The clinic's been busy \u2014 I've been busier",
    "Afternoon clinic",
    "Afternoon. Nothing's on fire. Mostly",
    "Midday check-in. I've been expecting you",
  ],
};

const GREETINGS_EVENING: GreetingPool = {
  withName: [
    "Evening, {name}. Another one in the books",
    "Post-clinic debrief, {name}",
    "Shift's over, {name}. Let's see how it went",
    "Evening, {name}. I saved you a summary",
  ],
  withoutName: [
    "Evening. Another one in the books",
    "Post-clinic debrief",
    "Shift's over. Let's see how it went",
    "Evening. I saved you a summary",
  ],
};

const GREETINGS_LATE: GreetingPool = {
  withName: [
    "You're up late, {name}. So am I, apparently",
    "After-hours, {name}. Dedication noted",
    "Still here, {name}? Same",
    "Burning the midnight oil, {name}. I'll keep you company",
  ],
  withoutName: [
    "You're up late. So am I, apparently",
    "After-hours. Dedication noted",
    "Still here? Same",
    "Burning the midnight oil. I'll keep you company",
  ],
};

// ─── Public API ─────────────────────────────────────────────────────────────

const SESSION_GREETED_KEY = "strydeos_greeted";

export function getGreeting(
  firstName: string,
  isFirstMount: boolean,
  data: GreetingData
): { greeting: string; subtext: string } {
  const name = firstName || "";
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
  const greeting = template.replace(/\{name\}/g, name);

  const day = new Date().toLocaleDateString("en-GB", { weekday: "long" });
  const subtext = selectSubtext(data, day);

  return { greeting, subtext };
}

export { SESSION_GREETED_KEY };
