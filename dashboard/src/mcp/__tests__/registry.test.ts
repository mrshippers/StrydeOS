import { describe, it, expect } from "vitest";
import { TOOLS } from "../registry";

describe("stryde-ops MCP registry", () => {
  it("registers exactly the planned 12 tools", () => {
    expect(TOOLS).toHaveLength(12);
  });

  it("insurance_intakes_list is PHI-gated to owner/admin/superadmin", () => {
    const t = TOOLS.find((x) => x.name === "insurance_intakes_list");
    expect(t).toBeDefined();
    expect([...t!.requiredRoles].sort()).toEqual(["admin", "owner", "superadmin"]);
    expect(t!.requiredRoles).not.toContain("clinician");
    expect(t!.annotations.readOnlyHint).toBe(true);
  });

  it("has unique tool names", () => {
    const names = TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("every tool has a non-empty description", () => {
    for (const t of TOOLS) {
      expect(t.description.length).toBeGreaterThan(20);
    }
  });

  it("every tool's inputSchema parses an empty object or accepts its defaults", () => {
    for (const t of TOOLS) {
      // Skip tools that require explicit input (callId)
      if (t.name === "ava_get_call_transcript") continue;
      expect(() => t.module.inputSchema.parse({})).not.toThrow();
    }
  });

  it("ava_get_call_transcript requires callId", () => {
    const t = TOOLS.find((x) => x.name === "ava_get_call_transcript");
    expect(t).toBeDefined();
    expect(() => t!.module.inputSchema.parse({})).toThrow();
    expect(() => t!.module.inputSchema.parse({ callId: "abc" })).not.toThrow();
  });

  it("only ava_sync_clinic has readOnlyHint=false", () => {
    const writes = TOOLS.filter((t) => !t.annotations.readOnlyHint);
    expect(writes.map((t) => t.name)).toEqual(["ava_sync_clinic"]);
  });
});
