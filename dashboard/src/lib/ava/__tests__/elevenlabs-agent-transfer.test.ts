import { describe, it, expect } from "vitest";
import { buildAvaToolDefs } from "../elevenlabs-agent";

const APP_URL = "https://portal.strydeos.com";

type ToolDef = ReturnType<typeof buildAvaToolDefs>[number];

function transferTool(): ToolDef {
  const tool = buildAvaToolDefs(APP_URL).find((t) => t.name === "transfer_to_reception");
  if (!tool) throw new Error("transfer_to_reception tool not found");
  return tool;
}

describe("transfer_to_reception tool definition (concurrency-safe call routing)", () => {
  it("sends call_sid sourced from the system__call_sid dynamic variable", () => {
    const props = transferTool().api_schema.request_body_schema.properties as Record<
      string,
      Record<string, unknown>
    >;
    expect(props.call_sid).toBeDefined();
    // ElevenLabs populates this from the Twilio Call SID system dynamic variable,
    // which is the ONLY concurrency-safe way to pick the right live call.
    expect(props.call_sid.dynamic_variable).toBe("system__call_sid");
  });

  it("posts call_sid under the exact field name the transfer route reads (body.call_sid)", () => {
    const props = transferTool().api_schema.request_body_schema.properties as Record<
      string,
      unknown
    >;
    expect(Object.keys(props)).toContain("call_sid");
  });

  it("keeps the existing reason property", () => {
    const props = transferTool().api_schema.request_body_schema.properties as Record<
      string,
      Record<string, unknown>
    >;
    expect(props.reason).toBeDefined();
    expect(props.reason.type).toBe("string");
  });

  it("retains the Bearer webhook auth header", () => {
    const headers = transferTool().api_schema.request_headers as Record<string, string>;
    expect(headers.Authorization).toMatch(/^Bearer /);
  });
});
