/**
 * P0 tests for billing route handlers:
 *   - POST /api/billing/webhooks  (Stripe webhook)
 *   - POST /api/billing/checkout  (Checkout session creation)
 *
 * These test the actual route handler behaviour — signature verification,
 * idempotency dedup, Firestore writes per event type, auth, and error paths.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Env vars (must be set before any dynamic imports) ──────────────────────

// Stripe webhook secret
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";

// Stripe price IDs used by flagsFromSubscriptionItems / billing helpers
process.env.STRIPE_PRICE_INTELLIGENCE_SOLO_MONTH = "price_int_solo_m";
process.env.STRIPE_PRICE_INTELLIGENCE_STUDIO_MONTH = "price_int_studio_m";
process.env.STRIPE_PRICE_INTELLIGENCE_CLINIC_MONTH = "price_int_clinic_m";
process.env.STRIPE_PRICE_PULSE_SOLO_MONTH = "price_pulse_solo_m";
process.env.STRIPE_PRICE_PULSE_STUDIO_MONTH = "price_pulse_studio_m";
process.env.STRIPE_PRICE_AVA_SOLO_MONTH = "price_ava_solo_m";
process.env.STRIPE_PRICE_AVA_STUDIO_MONTH = "price_ava_studio_m";
process.env.STRIPE_PRICE_FULLSTACK_CLINIC_MONTH = "price_fs_clinic_m";
process.env.STRIPE_PRICE_AVA_SETUP = "price_ava_setup";
process.env.STRIPE_PRICE_EXTRA_SEAT_MONTH = "price_seat_month";
process.env.STRIPE_PRICE_EXTRA_SEAT_YEAR = "price_seat_year";
process.env.STRIPE_SECRET_KEY = "sk_test_fake";
process.env.APP_URL = "https://portal.strydeos.com";

// ─── Mock stores ────────────────────────────────────────────────────────────

/** In-memory mock of Firestore collections. Keyed by "collection/doc". */
const firestoreStore: Record<string, Record<string, unknown>> = {};

/** Track update() calls so we can assert field-level writes. */
const updateCalls: Array<{ path: string; data: Record<string, unknown> }> = [];

/** Track set() calls. */
const setCalls: Array<{ path: string; data: Record<string, unknown>; options?: Record<string, unknown> }> = [];

// ─── Mock: firebase-admin ───────────────────────────────────────────────────

function makeMockDocRef(collectionPath: string, docId: string) {
  const fullPath = `${collectionPath}/${docId}`;

  return {
    id: docId,
    get: vi.fn(async () => {
      const data = firestoreStore[fullPath];
      return {
        exists: !!data,
        id: docId,
        data: () => data ?? undefined,
        ref: { update: vi.fn() },
      };
    }),
    set: vi.fn(async (data: Record<string, unknown>, options?: Record<string, unknown>) => {
      firestoreStore[fullPath] = { ...(firestoreStore[fullPath] ?? {}), ...data };
      setCalls.push({ path: fullPath, data, options });
    }),
    update: vi.fn(async (data: Record<string, unknown>) => {
      firestoreStore[fullPath] = { ...(firestoreStore[fullPath] ?? {}), ...data };
      updateCalls.push({ path: fullPath, data });
    }),
  };
}

function makeMockCollection(collectionPath: string) {
  return {
    doc: (id: string) => makeMockDocRef(collectionPath, id),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    get: vi.fn(async () => {
      // Return matching docs based on firestoreStore entries in this collection
      const prefix = `${collectionPath}/`;
      const docs = Object.entries(firestoreStore)
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, data]) => ({
          id: key.replace(prefix, ""),
          data: () => data,
          ref: makeMockDocRef(collectionPath, key.replace(prefix, "")),
        }));
      return { empty: docs.length === 0, docs };
    }),
  };
}

const mockDb = {
  collection: vi.fn((name: string) => makeMockCollection(name)),
};

vi.mock("@/lib/firebase-admin", () => ({
  getAdminDb: () => mockDb,
  getAdminAuth: () => ({
    verifyIdToken: vi.fn(),
  }),
}));

// ─── Mock: stripe ───────────────────────────────────────────────────────────

const mockConstructEvent = vi.fn();
const mockSubscriptionsList = vi.fn();
const mockSubscriptionItemsUpdate = vi.fn();
const mockSubscriptionItemsCreate = vi.fn();
const mockSubscriptionsRetrieve = vi.fn();
const mockCheckoutSessionsCreate = vi.fn();
const mockCustomersCreate = vi.fn();

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    webhooks: {
      constructEvent: mockConstructEvent,
    },
    subscriptions: {
      list: mockSubscriptionsList,
      retrieve: mockSubscriptionsRetrieve,
    },
    subscriptionItems: {
      update: mockSubscriptionItemsUpdate,
      create: mockSubscriptionItemsCreate,
    },
    checkout: {
      sessions: {
        create: mockCheckoutSessionsCreate,
      },
    },
    customers: {
      create: mockCustomersCreate,
    },
  }),
}));

// ─── Mock: Sentry (no-op) ───────────────────────────────────────────────────

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

// ─── Mock: request-logger (passthrough) ─────────────────────────────────────

vi.mock("@/lib/request-logger", () => ({
  withRequestLog: (handler: Function) => handler,
}));

// ─── Mock: auth-guard ───────────────────────────────────────────────────────

const mockVerifyApiRequest = vi.fn();
const mockRequireRole = vi.fn();

vi.mock("@/lib/auth-guard", () => ({
  verifyApiRequest: (...args: unknown[]) => mockVerifyApiRequest(...args),
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
  handleApiError: (error: unknown) => {
    if (error && typeof error === "object" && "statusCode" in error) {
      const e = error as { message: string; statusCode: number };
      return new Response(JSON.stringify({ error: e.message }), {
        status: e.statusCode,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  },
  ApiAuthError: class ApiAuthError extends Error {
    statusCode: number;
    constructor(message: string, statusCode: number) {
      super(message);
      this.statusCode = statusCode;
      this.name = "ApiAuthError";
    }
  },
}));

// ─── Mock: rate-limit (never limited by default) ────────────────────────────

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ limited: false, remaining: 5 })),
}));

// ─── Mock: FieldValue ───────────────────────────────────────────────────────

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    delete: () => "__FIELD_DELETE__",
  },
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeWebhookRequest(body: string, sig?: string): NextRequest {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (sig !== undefined) {
    headers["stripe-signature"] = sig;
  }
  return new NextRequest("https://portal.strydeos.com/api/billing/webhooks", {
    method: "POST",
    body,
    headers,
  });
}

/** Builds a minimal Stripe Subscription object for webhook testing. */
function makeSubscription(overrides: Partial<{
  id: string;
  customer: string;
  status: string;
  metadata: Record<string, string>;
  items: Array<{ price: { id: string }; quantity?: number; current_period_end?: number }>;
  billing_cycle_anchor: number;
}> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: overrides.id ?? "sub_test_123",
    customer: overrides.customer ?? "cus_test_abc",
    status: overrides.status ?? "active",
    metadata: overrides.metadata ?? { tier: "studio" },
    billing_cycle_anchor: overrides.billing_cycle_anchor ?? now,
    items: {
      data: (overrides.items ?? [
        { price: { id: "price_int_studio_m" }, quantity: 1, current_period_end: now + 2592000 },
      ]).map((item) => ({
        ...item,
        price: typeof item.price === "string" ? { id: item.price } : item.price,
      })),
    },
  };
}

/** Builds a minimal Stripe Invoice object for webhook testing. */
function makeInvoice(overrides: Partial<{
  customer: string;
  subscriptionId: string;
}> = {}) {
  return {
    customer: overrides.customer ?? "cus_test_abc",
    parent: {
      type: "subscription",
      subscription_details: {
        subscription: overrides.subscriptionId ?? "sub_test_123",
      },
    },
  };
}

/** Seeds a clinic doc in the mock Firestore. */
function seedClinic(clinicId: string, data: Record<string, unknown>) {
  firestoreStore[`clinics/${clinicId}`] = data;
}

/** Seeds the dedup doc to simulate an already-processed event. */
function seedDedupEvent(eventId: string) {
  firestoreStore[`_stripe_event_dedup/${eventId}`] = { processedAt: new Date().toISOString() };
}

/** Simulate constructEvent returning a Stripe event. */
function mockEvent(type: string, data: unknown, id = "evt_test_001") {
  mockConstructEvent.mockReturnValue({
    id,
    type,
    data: { object: data },
  });
}

// ─── Test lifecycle ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Reset in-memory stores
  Object.keys(firestoreStore).forEach((k) => delete firestoreStore[k]);
  updateCalls.length = 0;
  setCalls.length = 0;
  // Default: subscriptions.list returns the items from the subscription itself
  mockSubscriptionsList.mockResolvedValue({ data: [] });
});

// ─────────────────────────────────────────────────────────────────────────────
// WEBHOOK ROUTE: POST /api/billing/webhooks
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/billing/webhooks", () => {
  // Import once — module state persists across tests in this describe block,
  // which is fine because we reset all mocks in beforeEach.
  let POST: (request: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    const mod = await import("@/app/api/billing/webhooks/route");
    POST = mod.POST;
  });

  // ── Signature verification ──────────────────────────────────────────────

  describe("signature verification", () => {
    it("returns 400 when stripe-signature header is missing", async () => {
      const req = makeWebhookRequest("{}", undefined);
      // Remove the header entirely by creating request without it
      const reqNoSig = new NextRequest("https://portal.strydeos.com/api/billing/webhooks", {
        method: "POST",
        body: "{}",
        headers: { "content-type": "application/json" },
      });

      const res = await POST(reqNoSig);
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error).toBe("Missing stripe-signature header");
    });

    it("returns 400 when constructEvent throws (invalid signature)", async () => {
      mockConstructEvent.mockImplementation(() => {
        throw new Error("Webhook signature verification failed");
      });

      const req = makeWebhookRequest("{}", "invalid_sig");
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error).toBe("Invalid signature");
    });

    it("passes raw body and signature to constructEvent", async () => {
      const rawBody = '{"some":"payload"}';
      mockEvent("unknown.event", {});

      const req = makeWebhookRequest(rawBody, "sig_valid_123");
      await POST(req);

      expect(mockConstructEvent).toHaveBeenCalledWith(
        rawBody,
        "sig_valid_123",
        "whsec_test_secret"
      );
    });
  });

  // ── Idempotency dedup ─────────────────────────────────────────────────

  describe("idempotency dedup", () => {
    it("skips already-processed events and returns deduplicated: true", async () => {
      const eventId = "evt_already_processed";
      seedDedupEvent(eventId);
      mockEvent("customer.subscription.created", makeSubscription(), eventId);

      const req = makeWebhookRequest("{}", "sig_valid");
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.deduplicated).toBe(true);
      expect(body.received).toBe(true);
    });

    it("processes new events and stores dedup marker", async () => {
      const eventId = "evt_new_event";
      const sub = makeSubscription({ customer: "cus_no_clinic" });
      mockEvent("customer.subscription.created", sub, eventId);
      // No clinic found — still processes (no error) and marks as processed
      mockSubscriptionsList.mockResolvedValue({ data: [] });

      const req = makeWebhookRequest("{}", "sig_valid");
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.received).toBe(true);
      expect(body.deduplicated).toBeUndefined();
    });
  });

  // ── customer.subscription.created ─────────────────────────────────────

  describe("customer.subscription.created", () => {
    it("activates feature flags for the matched clinic", async () => {
      const clinicId = "clinic_001";
      seedClinic(clinicId, {
        billing: { stripeCustomerId: "cus_test_abc" },
      });

      const sub = makeSubscription({
        customer: "cus_test_abc",
        status: "active",
        items: [
          { price: { id: "price_int_studio_m" }, quantity: 1, current_period_end: Math.floor(Date.now() / 1000) + 2592000 },
        ],
        metadata: { tier: "studio" },
      });

      mockEvent("customer.subscription.created", sub);

      // subscriptions.list returns the active sub so getAllActiveSubscriptionItems works
      mockSubscriptionsList.mockResolvedValue({
        data: [{
          status: "active",
          items: {
            data: [{ price: { id: "price_int_studio_m" }, quantity: 1 }],
          },
        }],
      });

      const req = makeWebhookRequest("{}", "sig_valid");
      const res = await POST(req);

      expect(res.status).toBe(200);

      // Verify the clinic doc was updated with correct flags
      const clinicUpdate = updateCalls.find((c) => c.path.startsWith("clinics/"));
      expect(clinicUpdate).toBeDefined();
      expect(clinicUpdate!.data.featureFlags).toEqual({
        intelligence: true,
        continuity: false,
        receptionist: false,
      });
      expect(clinicUpdate!.data["billing.subscriptionStatus"]).toBe("active");
      expect(clinicUpdate!.data["billing.tier"]).toBe("studio");
    });

    it("activates all flags when fullstack price is present", async () => {
      const clinicId = "clinic_fullstack";
      seedClinic(clinicId, {
        billing: { stripeCustomerId: "cus_fs" },
      });

      const sub = makeSubscription({
        customer: "cus_fs",
        status: "active",
        items: [
          { price: { id: "price_fs_clinic_m" }, quantity: 1, current_period_end: Math.floor(Date.now() / 1000) + 2592000 },
        ],
        metadata: { tier: "clinic" },
      });

      mockEvent("customer.subscription.created", sub);
      mockSubscriptionsList.mockResolvedValue({
        data: [{
          status: "active",
          items: { data: [{ price: { id: "price_fs_clinic_m" }, quantity: 1 }] },
        }],
      });

      const req = makeWebhookRequest("{}", "sig_valid");
      await POST(req);

      const clinicUpdate = updateCalls.find((c) => c.path.startsWith("clinics/"));
      expect(clinicUpdate).toBeDefined();
      expect(clinicUpdate!.data.featureFlags).toEqual({
        intelligence: true,
        continuity: true,
        receptionist: true,
      });
    });

    it("counts extra seats from subscription items", async () => {
      const clinicId = "clinic_seats";
      seedClinic(clinicId, {
        billing: { stripeCustomerId: "cus_seats" },
      });

      const sub = makeSubscription({
        customer: "cus_seats",
        status: "active",
        items: [
          { price: { id: "price_int_studio_m" }, quantity: 1, current_period_end: Math.floor(Date.now() / 1000) + 2592000 },
          { price: { id: "price_seat_month" }, quantity: 3, current_period_end: Math.floor(Date.now() / 1000) + 2592000 },
        ],
        metadata: { tier: "studio" },
      });

      mockEvent("customer.subscription.created", sub);
      mockSubscriptionsList.mockResolvedValue({
        data: [{
          status: "active",
          items: {
            data: [
              { price: { id: "price_int_studio_m" }, quantity: 1 },
              { price: { id: "price_seat_month" }, quantity: 3 },
            ],
          },
        }],
      });

      const req = makeWebhookRequest("{}", "sig_valid");
      await POST(req);

      const clinicUpdate = updateCalls.find((c) => c.path.startsWith("clinics/"));
      expect(clinicUpdate).toBeDefined();
      expect(clinicUpdate!.data["billing.extraSeats"]).toBe(3);
    });

    it("does not error when no clinic matches the customer ID", async () => {
      const sub = makeSubscription({ customer: "cus_orphan" });
      mockEvent("customer.subscription.created", sub);
      mockSubscriptionsList.mockResolvedValue({ data: [] });

      const req = makeWebhookRequest("{}", "sig_valid");
      const res = await POST(req);

      expect(res.status).toBe(200);
      expect(updateCalls.filter((c) => c.path.startsWith("clinics/"))).toHaveLength(0);
    });

    it("clears paymentFailedAt when subscription status is active", async () => {
      const clinicId = "clinic_reactivated";
      seedClinic(clinicId, {
        billing: { stripeCustomerId: "cus_reactivated", paymentFailedAt: "2025-01-01T00:00:00Z" },
      });

      const sub = makeSubscription({
        customer: "cus_reactivated",
        status: "active",
        metadata: { tier: "studio" },
      });

      mockEvent("customer.subscription.created", sub);
      mockSubscriptionsList.mockResolvedValue({
        data: [{
          status: "active",
          items: { data: [{ price: { id: "price_int_studio_m" }, quantity: 1 }] },
        }],
      });

      const req = makeWebhookRequest("{}", "sig_valid");
      await POST(req);

      const clinicUpdate = updateCalls.find((c) => c.path.startsWith("clinics/"));
      expect(clinicUpdate).toBeDefined();
      expect(clinicUpdate!.data["billing.paymentFailedAt"]).toBe("__FIELD_DELETE__");
    });
  });

  // ── customer.subscription.updated ─────────────────────────────────────

  describe("customer.subscription.updated", () => {
    it("updates feature flags when modules change", async () => {
      const clinicId = "clinic_update";
      seedClinic(clinicId, {
        billing: { stripeCustomerId: "cus_update" },
        featureFlags: { intelligence: true, continuity: false, receptionist: false },
      });

      const sub = makeSubscription({
        customer: "cus_update",
        status: "active",
        items: [
          { price: { id: "price_int_studio_m" }, quantity: 1, current_period_end: Math.floor(Date.now() / 1000) + 2592000 },
          { price: { id: "price_ava_studio_m" }, quantity: 1, current_period_end: Math.floor(Date.now() / 1000) + 2592000 },
        ],
        metadata: { tier: "studio" },
      });

      mockEvent("customer.subscription.updated", sub);
      mockSubscriptionsList.mockResolvedValue({
        data: [{
          status: "active",
          items: {
            data: [
              { price: { id: "price_int_studio_m" }, quantity: 1 },
              { price: { id: "price_ava_studio_m" }, quantity: 1 },
            ],
          },
        }],
      });

      const req = makeWebhookRequest("{}", "sig_valid");
      await POST(req);

      const clinicUpdate = updateCalls.find((c) => c.path.startsWith("clinics/"));
      expect(clinicUpdate).toBeDefined();
      expect(clinicUpdate!.data.featureFlags).toEqual({
        intelligence: true,
        continuity: false,
        receptionist: true,
      });
    });

    it("handles subscription moving to trialing status", async () => {
      const clinicId = "clinic_trial";
      seedClinic(clinicId, {
        billing: { stripeCustomerId: "cus_trial" },
      });

      const sub = makeSubscription({
        customer: "cus_trial",
        status: "trialing",
        metadata: { tier: "solo" },
      });

      mockEvent("customer.subscription.updated", sub);
      mockSubscriptionsList.mockResolvedValue({
        data: [{
          status: "trialing",
          items: { data: [{ price: { id: "price_int_solo_m" }, quantity: 1 }] },
        }],
      });

      const req = makeWebhookRequest("{}", "sig_valid");
      await POST(req);

      const clinicUpdate = updateCalls.find((c) => c.path.startsWith("clinics/"));
      expect(clinicUpdate).toBeDefined();
      expect(clinicUpdate!.data["billing.subscriptionStatus"]).toBe("trialing");
    });
  });

  // ── customer.subscription.deleted ─────────────────────────────────────

  describe("customer.subscription.deleted", () => {
    it("clears all feature flags when no other active subscriptions remain", async () => {
      const clinicId = "clinic_cancel";
      seedClinic(clinicId, {
        billing: { stripeCustomerId: "cus_cancel" },
        featureFlags: { intelligence: true, continuity: true, receptionist: true },
      });

      const sub = makeSubscription({
        customer: "cus_cancel",
        status: "canceled",
        metadata: { tier: "studio" },
      });

      mockEvent("customer.subscription.deleted", sub);
      // No remaining active subs
      mockSubscriptionsList.mockResolvedValue({ data: [{ status: "canceled", items: { data: [] } }] });

      const req = makeWebhookRequest("{}", "sig_valid");
      await POST(req);

      const clinicUpdate = updateCalls.find((c) => c.path.startsWith("clinics/"));
      expect(clinicUpdate).toBeDefined();
      expect(clinicUpdate!.data.featureFlags).toEqual({
        intelligence: false,
        continuity: false,
        receptionist: false,
      });
      expect(clinicUpdate!.data["billing.subscriptionStatus"]).toBe("canceled");
      expect(clinicUpdate!.data["billing.extraSeats"]).toBe(0);
    });

    it("preserves flags from remaining active subscriptions when one is deleted", async () => {
      const clinicId = "clinic_multi_sub";
      seedClinic(clinicId, {
        billing: { stripeCustomerId: "cus_multi" },
      });

      const deletedSub = makeSubscription({
        id: "sub_deleted",
        customer: "cus_multi",
        status: "canceled",
      });

      mockEvent("customer.subscription.deleted", deletedSub);
      // Another subscription is still active
      mockSubscriptionsList.mockResolvedValue({
        data: [
          {
            id: "sub_remaining",
            status: "active",
            items: { data: [{ price: { id: "price_pulse_studio_m" }, quantity: 1 }] },
            billing_cycle_anchor: Math.floor(Date.now() / 1000),
          },
          {
            id: "sub_deleted",
            status: "canceled",
            items: { data: [] },
            billing_cycle_anchor: Math.floor(Date.now() / 1000),
          },
        ],
      });

      const req = makeWebhookRequest("{}", "sig_valid");
      await POST(req);

      const clinicUpdate = updateCalls.find((c) => c.path.startsWith("clinics/"));
      expect(clinicUpdate).toBeDefined();
      // Pulse maps to continuity flag
      expect(clinicUpdate!.data.featureFlags).toEqual({
        intelligence: false,
        continuity: true,
        receptionist: false,
      });
    });
  });

  // ── invoice.payment_failed ────────────────────────────────────────────

  describe("invoice.payment_failed", () => {
    it("sets billing status to past_due and records paymentFailedAt", async () => {
      const clinicId = "clinic_late";
      seedClinic(clinicId, {
        billing: { stripeCustomerId: "cus_late" },
      });

      const invoice = makeInvoice({ customer: "cus_late", subscriptionId: "sub_late" });
      mockEvent("invoice.payment_failed", invoice);

      const req = makeWebhookRequest("{}", "sig_valid");
      await POST(req);

      const clinicUpdate = updateCalls.find((c) => c.path.startsWith("clinics/"));
      expect(clinicUpdate).toBeDefined();
      expect(clinicUpdate!.data["billing.subscriptionStatus"]).toBe("past_due");
      expect(clinicUpdate!.data["billing.paymentFailedAt"]).toBeDefined();
      expect(clinicUpdate!.data["billing.subscriptionId"]).toBe("sub_late");
    });

    it("does nothing when invoice has no customer", async () => {
      const invoice = { customer: null, parent: null };
      mockEvent("invoice.payment_failed", invoice);

      const req = makeWebhookRequest("{}", "sig_valid");
      const res = await POST(req);

      expect(res.status).toBe(200);
      expect(updateCalls.filter((c) => c.path.startsWith("clinics/"))).toHaveLength(0);
    });

    it("does nothing when no clinic matches the customer", async () => {
      const invoice = makeInvoice({ customer: "cus_nobody" });
      mockEvent("invoice.payment_failed", invoice);

      const req = makeWebhookRequest("{}", "sig_valid");
      const res = await POST(req);

      expect(res.status).toBe(200);
      expect(updateCalls.filter((c) => c.path.startsWith("clinics/"))).toHaveLength(0);
    });
  });

  // ── Unknown event types ───────────────────────────────────────────────

  describe("unknown event types", () => {
    it("returns 200 and acknowledges unknown events without error", async () => {
      mockEvent("charge.succeeded", { id: "ch_123" });

      const req = makeWebhookRequest("{}", "sig_valid");
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.received).toBe(true);
    });

    it("still records dedup marker for unknown events", async () => {
      const eventId = "evt_unknown_type";
      mockEvent("product.created", { id: "prod_123" }, eventId);

      const req = makeWebhookRequest("{}", "sig_valid");
      await POST(req);

      // The dedup doc should have been set
      const dedupSet = setCalls.find((c) => c.path === `_stripe_event_dedup/${eventId}`);
      expect(dedupSet).toBeDefined();
      expect(dedupSet!.data.processedAt).toBeDefined();
    });
  });

  // ── Error handling ────────────────────────────────────────────────────

  describe("error handling", () => {
    it("returns 500 on transient Firestore errors (UNAVAILABLE) so Stripe retries", async () => {
      const clinicId = "clinic_transient";
      seedClinic(clinicId, {
        billing: { stripeCustomerId: "cus_transient" },
      });

      const sub = makeSubscription({ customer: "cus_transient" });
      mockEvent("customer.subscription.created", sub);

      // Make subscriptions.list throw a transient error
      mockSubscriptionsList.mockRejectedValue(new Error("UNAVAILABLE: service unavailable"));

      const req = makeWebhookRequest("{}", "sig_valid");
      const res = await POST(req);

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toContain("Transient error");
    });

    it("returns 200 on non-transient errors (logic bugs) so Stripe does not retry", async () => {
      const clinicId = "clinic_logic_err";
      seedClinic(clinicId, {
        billing: { stripeCustomerId: "cus_logic" },
      });

      const sub = makeSubscription({ customer: "cus_logic" });
      mockEvent("customer.subscription.created", sub);

      // Make subscriptions.list throw a non-transient error
      mockSubscriptionsList.mockRejectedValue(new Error("Cannot read property 'id' of undefined"));

      const req = makeWebhookRequest("{}", "sig_valid");
      const res = await POST(req);

      // Non-transient error: return 200 to Stripe so it stops retrying
      expect(res.status).toBe(200);
    });

    it("returns 500 when STRIPE_WEBHOOK_SECRET is empty", async () => {
      const origSecret = process.env.STRIPE_WEBHOOK_SECRET;
      process.env.STRIPE_WEBHOOK_SECRET = "";

      // Re-import to pick up empty secret
      vi.resetModules();
      const mod = await import("@/app/api/billing/webhooks/route");

      const req = makeWebhookRequest("{}", "sig_valid");
      const res = await mod.POST(req);

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toContain("not configured");

      // Restore
      process.env.STRIPE_WEBHOOK_SECRET = origSecret;
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CHECKOUT ROUTE: POST /api/billing/checkout
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/billing/checkout", () => {
  let POST: (request: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    const mod = await import("@/app/api/billing/checkout/route");
    POST = mod.POST;
  });

  function makeCheckoutRequest(body: Record<string, unknown>): NextRequest {
    return new NextRequest("https://portal.strydeos.com/api/billing/checkout", {
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        "content-type": "application/json",
        authorization: "Bearer test_token_123",
      },
    });
  }

  it("rejects unauthenticated requests", async () => {
    const { ApiAuthError } = await import("@/lib/auth-guard");
    mockVerifyApiRequest.mockRejectedValue(new ApiAuthError("Missing or invalid Authorization header", 401));

    const req = makeCheckoutRequest({ modules: ["intelligence"] });
    const res = await POST(req);

    expect(res.status).toBe(401);
  });

  it("rejects non-owner/admin roles", async () => {
    const { ApiAuthError } = await import("@/lib/auth-guard");
    mockVerifyApiRequest.mockResolvedValue({
      uid: "user_1",
      email: "test@example.com",
      clinicId: "clinic_1",
      role: "clinician",
    });
    mockRequireRole.mockImplementation(() => {
      throw new ApiAuthError("Insufficient permissions", 403);
    });

    const req = makeCheckoutRequest({ modules: ["intelligence"] });
    const res = await POST(req);

    expect(res.status).toBe(403);
  });

  it("returns 400 when no valid modules are provided", async () => {
    mockVerifyApiRequest.mockResolvedValue({
      uid: "user_1",
      email: "test@example.com",
      clinicId: "clinic_1",
      role: "owner",
    });
    mockRequireRole.mockImplementation(() => {});

    seedClinic("clinic_1", {
      name: "Test Clinic",
      billing: { stripeCustomerId: "cus_existing" },
    });

    const req = makeCheckoutRequest({ modules: [] });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain("module");
  });

  it("creates a checkout session with correct line items", async () => {
    mockVerifyApiRequest.mockResolvedValue({
      uid: "user_1",
      email: "test@example.com",
      clinicId: "clinic_checkout",
      role: "owner",
    });
    mockRequireRole.mockImplementation(() => {});

    seedClinic("clinic_checkout", {
      name: "Checkout Clinic",
      billing: { stripeCustomerId: "cus_checkout_existing" },
    });

    mockCheckoutSessionsCreate.mockResolvedValue({
      url: "https://checkout.stripe.com/session_123",
    });

    const req = makeCheckoutRequest({
      modules: ["intelligence", "ava"],
      tier: "studio",
      interval: "month",
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.url).toBe("https://checkout.stripe.com/session_123");

    // Verify checkout session was created with the right params
    expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_checkout_existing",
        mode: "subscription",
        line_items: expect.arrayContaining([
          expect.objectContaining({ price: "price_int_studio_m", quantity: 1 }),
          expect.objectContaining({ price: "price_ava_studio_m", quantity: 1 }),
        ]),
        metadata: expect.objectContaining({ clinicId: "clinic_checkout", tier: "studio" }),
      })
    );
  });

  it("creates a Stripe customer when clinic has none", async () => {
    mockVerifyApiRequest.mockResolvedValue({
      uid: "user_new",
      email: "new@example.com",
      clinicId: "clinic_new_customer",
      role: "owner",
    });
    mockRequireRole.mockImplementation(() => {});

    seedClinic("clinic_new_customer", {
      name: "New Clinic",
      ownerEmail: "new@example.com",
      billing: {},
    });

    mockCustomersCreate.mockResolvedValue({ id: "cus_newly_created" });
    mockCheckoutSessionsCreate.mockResolvedValue({
      url: "https://checkout.stripe.com/new_session",
    });

    const req = makeCheckoutRequest({ modules: ["pulse"], tier: "solo", interval: "month" });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(mockCustomersCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "new@example.com",
        metadata: { clinicId: "clinic_new_customer" },
      })
    );
  });

  it("is rate limited", async () => {
    const { checkRateLimit } = await import("@/lib/rate-limit");
    (checkRateLimit as ReturnType<typeof vi.fn>).mockReturnValue({ limited: true, remaining: 0 });

    const req = makeCheckoutRequest({ modules: ["intelligence"] });
    const res = await POST(req);

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toContain("Too many requests");

    // Restore default
    (checkRateLimit as ReturnType<typeof vi.fn>).mockReturnValue({ limited: false, remaining: 5 });
  });

  it("returns 400 when user has no clinicId", async () => {
    mockVerifyApiRequest.mockResolvedValue({
      uid: "user_no_clinic",
      email: "noclinic@example.com",
      clinicId: undefined,
      role: "owner",
    });
    mockRequireRole.mockImplementation(() => {});

    const req = makeCheckoutRequest({ modules: ["intelligence"] });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain("clinic");
  });

  it("defaults tier to studio and interval to month when not provided", async () => {
    mockVerifyApiRequest.mockResolvedValue({
      uid: "user_default",
      email: "default@example.com",
      clinicId: "clinic_default",
      role: "admin",
    });
    mockRequireRole.mockImplementation(() => {});

    seedClinic("clinic_default", {
      name: "Default Clinic",
      billing: { stripeCustomerId: "cus_default" },
    });

    mockCheckoutSessionsCreate.mockResolvedValue({
      url: "https://checkout.stripe.com/default_session",
    });

    const req = makeCheckoutRequest({ modules: ["intelligence"] });
    await POST(req);

    expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ tier: "studio", interval: "month" }),
      })
    );
  });

  it("includes Ava setup fee when includeAvaSetup is true and Ava is selected", async () => {
    mockVerifyApiRequest.mockResolvedValue({
      uid: "user_ava",
      email: "ava@example.com",
      clinicId: "clinic_ava",
      role: "owner",
    });
    mockRequireRole.mockImplementation(() => {});

    seedClinic("clinic_ava", {
      name: "Ava Clinic",
      billing: { stripeCustomerId: "cus_ava" },
    });

    mockCheckoutSessionsCreate.mockResolvedValue({
      url: "https://checkout.stripe.com/ava_session",
    });

    const req = makeCheckoutRequest({
      modules: ["ava"],
      tier: "studio",
      interval: "month",
      includeAvaSetup: true,
    });
    await POST(req);

    expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: expect.arrayContaining([
          expect.objectContaining({ price: "price_ava_studio_m" }),
          expect.objectContaining({ price: "price_ava_setup" }),
        ]),
      })
    );
  });

  it("does NOT include Ava setup fee when includeAvaSetup is false", async () => {
    mockVerifyApiRequest.mockResolvedValue({
      uid: "user_no_setup",
      email: "nosetup@example.com",
      clinicId: "clinic_no_setup",
      role: "owner",
    });
    mockRequireRole.mockImplementation(() => {});

    seedClinic("clinic_no_setup", {
      name: "No Setup Clinic",
      billing: { stripeCustomerId: "cus_no_setup" },
    });

    mockCheckoutSessionsCreate.mockResolvedValue({
      url: "https://checkout.stripe.com/no_setup_session",
    });

    const req = makeCheckoutRequest({
      modules: ["ava"],
      tier: "studio",
      interval: "month",
      includeAvaSetup: false,
    });
    await POST(req);

    const callArgs = mockCheckoutSessionsCreate.mock.calls[0][0];
    const priceIds = callArgs.line_items.map((li: { price: string }) => li.price);
    expect(priceIds).not.toContain("price_ava_setup");
  });
});
