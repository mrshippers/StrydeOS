import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/firebase-admin", () => ({ getAdminDb: vi.fn() }));
vi.mock("@/lib/resend", () => ({ getResend: vi.fn() }));

import { getAdminDb } from "@/lib/firebase-admin";
import { getResend } from "@/lib/resend";
import { handleNoPmsToolCall } from "@/lib/ava/no-pms-handler";

// ─── Firestore mock ───────────────────────────────────────────────────────────

const mockSet = vi.fn().mockResolvedValue(undefined);
const mockDocFn = vi.fn().mockReturnValue({ set: mockSet });
const mockContactRequests = { doc: mockDocFn };
const mockClinicRef = { collection: vi.fn().mockReturnValue(mockContactRequests) };
const mockClinics = { doc: vi.fn().mockReturnValue(mockClinicRef) };
const mockDb = { collection: vi.fn().mockReturnValue(mockClinics) };

// ─── Resend mock ──────────────────────────────────────────────────────────────

const mockEmailSend = vi.fn().mockResolvedValue({ id: "email-001" });
const mockResend = { emails: { send: mockEmailSend } };

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.mocked(getAdminDb).mockReturnValue(mockDb as unknown as ReturnType<typeof getAdminDb>);
  vi.mocked(getResend).mockReturnValue(mockResend as unknown as ReturnType<typeof getResend>);
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("handleNoPmsToolCall", () => {
  it("writes contact_requests doc with caller details", async () => {
    await handleNoPmsToolCall(
      "clinic-001",
      "admin@clinic.com",
      "book_appointment",
      { patient_first_name: "Sarah", patient_last_name: "Jones", patient_phone: "+447700900001" },
      "conv-abc",
      "+447700900001",
    );

    expect(mockSet).toHaveBeenCalledOnce();
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        callerPhone: "+447700900001",
        callerName: "Sarah Jones",
      }),
      { merge: true },
    );
  });

  it("sends email when clinicEmail is provided", async () => {
    await handleNoPmsToolCall(
      "clinic-001",
      "admin@clinic.com",
      "book_appointment",
      { patient_first_name: "Tom", patient_last_name: "Brown" },
      "conv-def",
      "+447700900002",
    );

    expect(mockEmailSend).toHaveBeenCalledOnce();
    expect(mockEmailSend).toHaveBeenCalledWith(
      expect.objectContaining({ to: "admin@clinic.com" }),
    );
  });

  it("skips email when clinicEmail is undefined", async () => {
    await handleNoPmsToolCall(
      "clinic-001",
      undefined,
      "check_availability",
      { preferred_day: "Monday" },
      "conv-ghi",
      "+447700900003",
    );

    expect(mockEmailSend).not.toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledOnce();
  });

  it("returns a non-empty speakable string", async () => {
    const result = await handleNoPmsToolCall(
      "clinic-001",
      undefined,
      "check_availability",
      {},
      "conv-xyz",
      "+447700900004",
    );

    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(10);
  });

  it("includes caller first name in response when available", async () => {
    const result = await handleNoPmsToolCall(
      "clinic-001",
      undefined,
      "book_appointment",
      { patient_first_name: "Emma" },
      "conv-123",
      "+447700900005",
    );

    expect(result).toContain("Emma");
  });

  it("handles missing conversationId without throwing", async () => {
    await expect(
      handleNoPmsToolCall(
        "clinic-001",
        undefined,
        "book_appointment",
        {},
        "",
        "+447700900006",
      ),
    ).resolves.not.toThrow();
  });
});
