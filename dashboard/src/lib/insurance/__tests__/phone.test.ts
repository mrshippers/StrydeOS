import { describe, it, expect } from "vitest";
import { toE164UK } from "../phone";

describe("toE164UK", () => {
  it("passes through an already-E.164 UK mobile", () => {
    expect(toE164UK("+447911123456")).toBe("+447911123456");
  });

  it("converts a national 0-prefixed mobile to +44", () => {
    expect(toE164UK("07911123456")).toBe("+447911123456");
  });

  it("handles the 00 international prefix (the bug that produced +440...)", () => {
    expect(toE164UK("00447911123456")).toBe("+447911123456");
    expect(toE164UK("0044 7911 123456")).toBe("+447911123456");
  });

  it("handles a bare 44-prefixed number with no plus", () => {
    expect(toE164UK("447911123456")).toBe("+447911123456");
  });

  it("strips spaces, dashes and parentheses", () => {
    expect(toE164UK("07911 123 456")).toBe("+447911123456");
    expect(toE164UK("(07911) 123-456")).toBe("+447911123456");
  });

  it("returns null for empty or junk input", () => {
    expect(toE164UK("")).toBeNull();
    expect(toE164UK("   ")).toBeNull();
    expect(toE164UK("abc")).toBeNull();
  });

  it("never produces the malformed +440 form", () => {
    expect(toE164UK("00447911123456")).not.toMatch(/^\+440/);
    expect(toE164UK("07384742532")).toBe("+447384742532");
  });
});
