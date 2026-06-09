import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  // 64 hex chars — satisfies getMasterSecret()'s length check.
  process.env.CREDENTIAL_MASTER_SECRET = "a".repeat(64);
});

import { signIntakeToken, verifyIntakeToken } from "../intake-token";

const NOW = 1_750_000_000_000;
const payload = { clinicId: "clinic-1", linkId: "link-9", exp: NOW + 60_000 };

describe("intake token", () => {
  it("verifies a freshly signed token and returns the payload", () => {
    const token = signIntakeToken(payload);
    const out = verifyIntakeToken(token, NOW);
    expect(out).toEqual(payload);
  });

  it("rejects a token whose body was tampered with", () => {
    const token = signIntakeToken(payload);
    const [body, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...payload, clinicId: "clinic-evil" })).toString("base64url");
    expect(verifyIntakeToken(`${forged}.${sig}`, NOW)).toBeNull();
    // sanity: original body still verifies
    expect(verifyIntakeToken(`${body}.${sig}`, NOW)).toEqual(payload);
  });

  it("rejects a token with a tampered signature", () => {
    const token = signIntakeToken(payload);
    const [body] = token.split(".");
    expect(verifyIntakeToken(`${body}.deadbeef`, NOW)).toBeNull();
  });

  it("rejects an expired token", () => {
    const token = signIntakeToken({ ...payload, exp: NOW - 1 });
    expect(verifyIntakeToken(token, NOW)).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(verifyIntakeToken("", NOW)).toBeNull();
    expect(verifyIntakeToken("no-dot", NOW)).toBeNull();
    expect(verifyIntakeToken("a.b.c", NOW)).toBeNull();
  });
});
