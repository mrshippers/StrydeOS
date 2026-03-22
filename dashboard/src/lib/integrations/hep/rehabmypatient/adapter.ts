import type { HEPAdapter, HEPProgramme, HEPIntegrationConfig } from "../types";
import {
  rehabMyPatientFetch,
  testRehabMyPatientConnection,
  type RehabMyPatientConfig,
} from "./client";
import {
  mapRehabMyPatientPlan,
  type RehabMyPatientPlanRow,
  type RehabMyPatientExerciseRow,
} from "./mappers";

export function createRehabMyPatientAdapter(config: HEPIntegrationConfig): HEPAdapter {
  const clientConfig: RehabMyPatientConfig = {
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
  };

  return {
    provider: "rehab_my_patient",

    async testConnection() {
      return testRehabMyPatientConnection(clientConfig);
    },

    async getProgrammes(params): Promise<HEPProgramme[]> {
      const { patientExternalId, dateFrom, dateTo } = params;

      if (!patientExternalId) {
        // RehabMyPatient requires a patient ID to fetch plans
        return [];
      }

      // Fetch all plans for this patient
      // API returns { plans: [...], total_items: N, pagination: {...} }
      const data = await rehabMyPatientFetch<{ plans?: RehabMyPatientPlanRow[] }>(
        clientConfig,
        `/patientPlans/${encodeURIComponent(patientExternalId)}`
      );

      const rows = data.plans ?? [];
      
      let programmes = rows.map(mapRehabMyPatientPlan);

      // Filter by date range if provided
      if (dateFrom || dateTo) {
        programmes = programmes.filter((p) => {
          const assignedDate = new Date(p.assignedAt);
          if (dateFrom && assignedDate < new Date(dateFrom)) return false;
          if (dateTo && assignedDate > new Date(dateTo)) return false;
          return true;
        });
      }

      return programmes;
    },

    async getProgramme(externalId: string): Promise<HEPProgramme> {
      // API returns { plan: {...}, exercises: [...] } — exercises are a sibling key
      const data = await rehabMyPatientFetch<{
        plan?: RehabMyPatientPlanRow;
        exercises?: RehabMyPatientExerciseRow[];
      }>(
        clientConfig,
        `/patientPlan/${encodeURIComponent(externalId)}`
      );

      const plan = data.plan ?? ({} as RehabMyPatientPlanRow);
      // Merge sibling exercises array into the plan row for the mapper
      plan.exercises = data.exercises ?? plan.exercises ?? [];
      return mapRehabMyPatientPlan(plan);
    },
  };
}
