/**
 * A failed insurance-intake SMS must NOT lock the patient out for 24h.
 *
 * Bug (harness #10): handleSendInsuranceLink persisted the intake link (status
 * "issued" + createdAt) BEFORE sending the SMS. checkIntakeSuppression keys its
 * 24h "recently_sent" cooldown on that createdAt regardless of whether the text
 * actually went — and the send catch only console.error'd, with no rollback. So
 * a Twilio failure suppressed both Ava re-offers and the 09:00 insurance cron
 * for 24h. The fix rolls the link back on a send failure (so suppression no
 * longer counts it) and writes a comms_log row on both outcomes.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { checkIntakeSuppression } from "@/lib/insurance/dedupe";

vi.mock("@/lib/request-logger", () => ({ withRequestLog: (fn: unknown) => fn }));
vi.mock("@/lib/firebase-admin", () => ({ getAdminDb: vi.fn() }));
vi.mock("@/lib/integrations/pms/factory", () => ({ createPMSAdapter: vi.fn() }));
vi.mock("@/lib/twilio", () => ({
  getTwilio: vi.fn(),
  getSmsSender: vi.fn(() => "StrydeOS"),
}));
vi.mock("@/lib/insurance/create-link", () => ({ createIntakeLink: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

const AGENT_ID = "agent_spires_001";
const CLINIC_ID = "clinic-spires";
const TOOLS_SECRET = "test_tools_secret";
const PATIENT_REF = "pat_77";

const CLINIC_DATA = { name: "Spires", ava: { agent_id: AGENT_ID } };

function makeDb() {
  // Stateful insurance_intake_links store so the REAL checkIntakeSuppression
  // can observe whether a failed send's link was genuinely rolled back.
  const links = new Map<string, Record<string, unknown>>();
  let auto = 0;
  const refFor = (id: string) => ({
    id,
    set: vi.fn(async (d: Record<string, unknown>) => { links.set(id, d); }),
    delete: vi.fn(async () => { links.delete(id); }),
  });
  const linksCol = {
    doc: vi.fn((id?: string) => refFor(id ?? `link_${++auto}`)),
    where: vi.fn((field: string, _op: string, val: unknown) => ({
      get: vi.fn(async () => ({
        docs: [...links.entries()]
          .filter(([, d]) => d[field] === val)
          .map(([id, d]) => ({ id, data: () => d })),
      })),
    })),
  };

  const commsAdds: Record<string, unknown>[] = [];
  const commsCol = {
    add: vi.fn(async (d: Record<string, unknown>) => { commsAdds.push(d); return { id: "c1" }; }),
  };

  const pmsDocRef = { get: vi.fn(async () => ({ data: () => ({ provider: "cliniko", apiKey: "k", baseUrl: "" }) })) };

  const clinicDocRef = {
    get: vi.fn(async () => ({ exists: true, data: () => CLINIC_DATA })),
    collection: vi.fn((name: string) => {
      if (name === "insurance_intake_links") return linksCol;
      if (name === "comms_log") return commsCol;
      if (name === "integrations_config") return { doc: vi.fn(() => pmsDocRef) };
      return { doc: vi.fn(() => ({ set: vi.fn(), get: vi.fn(), delete: vi.fn() })) };
    }),
  };

  const clinicsCol = {
    where: vi.fn(() => ({
      limit: vi.fn(() => ({
        get: vi.fn(async () => ({ empty: false, docs: [{ id: CLINIC_ID, data: () => CLINIC_DATA }] })),
      })),
    })),
    doc: vi.fn(() => clinicDocRef),
  };

  const shortlinksCol = { doc: vi.fn(() => ({ set: vi.fn(async () => {}) })) };

  const db = {
    collection: vi.fn((name: string) => {
      if (name === "clinics") return clinicsCol;
      if (name === "intake_shortlinks") return shortlinksCol;
      return { doc: vi.fn(() => ({ set: vi.fn(), get: vi.fn(), delete: vi.fn() })) };
    }),
  };
  return { db, links, commsAdds };
}

function insuranceRequest() {
  return new NextRequest("http://localhost/api/ava/tools", {
    method: "POST",
    body: JSON.stringify({
      agent_id: AGENT_ID,
      conversation_id: "conv_ins_1",
      caller_phone: "+447700900123",
      tool_name: "send_insurance_intake_link",
      parameters: { patient_external_id: PATIENT_REF },
    }),
    headers: { "Content-Type": "application/json", authorization: `Bearer ${TOOLS_SECRET}` },
  });
}

/** Mocked createIntakeLink that writes a real link doc into the shared store. */
function wireCreateLink(createIntakeLink: ReturnType<typeof vi.fn>) {
  createIntakeLink.mockImplementation(
    async (
      db: { collection: (n: string) => { doc: (id: string) => { collection: (n: string) => { doc: () => { id: string; set: (d: unknown) => Promise<void> } } } } },
      clinicId: string,
      params: { patientRef: string; nowMs: number },
    ) => {
      const ref = db.collection("clinics").doc(clinicId).collection("insurance_intake_links").doc();
      await ref.set({ patientRef: params.patientRef, status: "issued", createdAt: new Date(params.nowMs).toISOString() });
      return {
        linkId: ref.id,
        token: "tok",
        url: "https://portal.strydeos.com/intake/tok",
        shortUrl: "https://portal.strydeos.com/i/abc",
        slug: "abc",
        expiresAt: new Date(params.nowMs + 1000).toISOString(),
        insurerOptions: [],
        derivedInsurer: null,
      };
    },
  );
}

describe("POST /api/ava/tools — insurance link rolls back on a failed send (harness #10)", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.AVA_ENGINE_URL;
    process.env.ELEVENLABS_WEBHOOK_SECRET = TOOLS_SECRET;
  });
  afterEach(() => {
    delete process.env.ELEVENLABS_WEBHOOK_SECRET;
    vi.clearAllMocks();
  });

  it("rolls the link back so suppression no longer counts it, and logs send_failed, when Twilio rejects", async () => {
    const { getAdminDb } = await import("@/lib/firebase-admin");
    const { createPMSAdapter } = await import("@/lib/integrations/pms/factory");
    const { getTwilio } = await import("@/lib/twilio");
    const { createIntakeLink } = await import("@/lib/insurance/create-link");

    const { db, links, commsAdds } = makeDb();
    vi.mocked(getAdminDb).mockReturnValue(db as never);
    vi.mocked(createPMSAdapter).mockReturnValue({} as never);
    wireCreateLink(vi.mocked(createIntakeLink));
    vi.mocked(getTwilio).mockReturnValue({
      messages: { create: vi.fn(async () => { throw new Error("carrier reject"); }) },
    } as never);

    const { POST } = await import("../route");
    const res = await POST(insuranceRequest());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.response).toMatch(/went wrong|follow up/i);

    // The just-created link must be gone — the cooldown keys on createdAt
    // regardless of status, so a lingering link would lock the patient out.
    expect(links.size).toBe(0);

    // A subsequent suppression check must therefore allow a re-offer.
    const supp = await checkIntakeSuppression(db as never, CLINIC_ID, PATIENT_REF, Date.now());
    expect(supp.suppress).toBe(false);

    // And the failed send is recorded.
    const failed = commsAdds.find((d) => d.outcome === "send_failed");
    expect(failed).toBeDefined();
    expect(failed).toMatchObject({ channel: "sms", outcome: "send_failed" });

    // The failure must reach monitoring, not just console.error.
    const Sentry = await import("@sentry/nextjs");
    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalled();
  });

  it("happy path: issues the link, sends, writes a pending comms_log row, and keeps the cooldown", async () => {
    const { getAdminDb } = await import("@/lib/firebase-admin");
    const { createPMSAdapter } = await import("@/lib/integrations/pms/factory");
    const { getTwilio } = await import("@/lib/twilio");
    const { createIntakeLink } = await import("@/lib/insurance/create-link");

    const { db, links, commsAdds } = makeDb();
    vi.mocked(getAdminDb).mockReturnValue(db as never);
    vi.mocked(createPMSAdapter).mockReturnValue({} as never);
    wireCreateLink(vi.mocked(createIntakeLink));
    const create = vi.fn(async () => ({ sid: "SM_ins_1" }));
    vi.mocked(getTwilio).mockReturnValue({ messages: { create } } as never);

    const { POST } = await import("../route");
    const res = await POST(insuranceRequest());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.response).toMatch(/texted|secure link/i);
    expect(create).toHaveBeenCalledTimes(1);

    // Link persists -> a subsequent send is suppressed (recently_sent).
    expect(links.size).toBe(1);
    const supp = await checkIntakeSuppression(db as never, CLINIC_ID, PATIENT_REF, Date.now());
    expect(supp.suppress).toBe(true);

    const pending = commsAdds.find((d) => d.outcome === "pending");
    expect(pending).toMatchObject({ channel: "sms", outcome: "pending", twilioSid: "SM_ins_1" });
  });
});
