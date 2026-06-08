/**
 * Live Cliniko Insurance Intake smoke test.
 *
 * Exercises the REAL adapter code (discover → write → readback) against a live
 * Cliniko account. Requires CLINIKO_SANDBOX_API_KEY + CLINIKO_SANDBOX_SHARD in
 * the environment — run through Doppler so the key is never written to disk:
 *
 *   doppler run -- npx tsx scripts/cliniko-insurance-smoke.ts
 *
 * Writes a marked summary to one patient's invoice_extra_information (reversible,
 * sandbox-only). Safe to re-run.
 */

import {
  discoverClinikoInsuranceFields,
  writeInsuranceToCliniko,
} from "../src/lib/integrations/pms/cliniko/insurance";
import { clinikoFetch } from "../src/lib/integrations/pms/cliniko/client";
import { normaliseFormSubmission } from "../src/lib/insurance/normalise";

async function main() {
  const shard = process.env.CLINIKO_SANDBOX_SHARD;
  const apiKey = process.env.CLINIKO_SANDBOX_API_KEY;
  if (!shard || !apiKey) {
    throw new Error(
      "Missing CLINIKO_SANDBOX_API_KEY / CLINIKO_SANDBOX_SHARD — run via `doppler run -- npx tsx scripts/cliniko-insurance-smoke.ts`",
    );
  }
  const config = { apiKey, baseUrl: `https://api.${shard}.cliniko.com/v1` };

  console.log(`\n→ Discovering insurance fields on shard ${shard} ...`);
  const fieldMap = await discoverClinikoInsuranceFields(config);
  console.log("  insurerOptions:", fieldMap.insurerOptions);
  console.log("  templateId:", fieldMap.templateId);
  console.log("  fallbackToInvoiceExtraInfo:", fieldMap.fallbackToInvoiceExtraInfo);

  console.log("\n→ Fetching a patient ...");
  const { patients } = await clinikoFetch<{
    patients: Array<{ id: string; first_name?: string; last_name?: string }>;
  }>(config, "/patients?per_page=1");
  const patient = patients?.[0];
  if (!patient) throw new Error("No patients in this Cliniko account");
  console.log(`  ${patient.id} — ${patient.first_name ?? ""} ${patient.last_name ?? ""}`);

  console.log("\n→ Normalising a form submission into an InsuranceRecord ...");
  const record = normaliseFormSubmission(
    {
      insurerName: fieldMap.insurerOptions[0] ?? "Bupa",
      policyNumber: "SMOKE-AB123456",
      scheme: "Comprehensive",
      excess: "£100",
      consent: true,
    },
    {
      tenantId: "smoke",
      patientRef: patient.id,
      capturedAt: new Date().toISOString(),
      capturedBy: "patient",
      consentVersion: "intake-v1",
    },
  );

  console.log("\n→ Writing via the real adapter (writeInsuranceToCliniko) ...");
  const result = await writeInsuranceToCliniko(config, record, fieldMap);
  console.log("  result:", result);

  console.log("\n→ Reading the patient back from Cliniko ...");
  const back = await clinikoFetch<{ invoice_extra_information?: string }>(
    config,
    `/patients/${patient.id}`,
  );
  console.log("  invoice_extra_information =>", JSON.stringify(back.invoice_extra_information));

  const ok = result.ok && (back.invoice_extra_information ?? "").includes("SMOKE-AB123456");
  console.log(ok ? "\n✅ SMOKE PASSED — real Cliniko write verified end to end.\n" : "\n❌ SMOKE FAILED.\n");
  if (!ok) process.exit(1);
}

main().catch((e) => {
  console.error("SMOKE ERROR:", e instanceof Error ? e.message : e);
  process.exit(1);
});
