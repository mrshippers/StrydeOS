import { describe, it, expect, vi, beforeEach } from "vitest";
import { setPhoneNumberAgent } from "../elevenlabs-agent";

const FAKE_KEY = "test-api-key";
const PHONE_ID = "phnum_test123";
const AGENT_ID = "agent_test456";

describe("setPhoneNumberAgent", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("PATCHes the phone number with agent_id to activate", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce(new Response("{}", { status: 200 }));

    await setPhoneNumberAgent(FAKE_KEY, PHONE_ID, AGENT_ID);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain(`/convai/phone-numbers/${PHONE_ID}`);
    expect(opts?.method).toBe("PATCH");
    expect(JSON.parse(opts?.body as string)).toEqual({ agent_id: AGENT_ID });
    expect((opts?.headers as Record<string, string>)?.["xi-api-key"]).toBe(FAKE_KEY);
  });

  it("PATCHes the phone number with agent_id=null to pause", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce(new Response("{}", { status: 200 }));

    await setPhoneNumberAgent(FAKE_KEY, PHONE_ID, null);

    const [, opts] = mockFetch.mock.calls[0];
    expect(JSON.parse(opts?.body as string)).toEqual({ agent_id: null });
  });

  it("throws on non-2xx response", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce(
      new Response("Unauthorized", { status: 401 })
    );

    await expect(setPhoneNumberAgent(FAKE_KEY, PHONE_ID, AGENT_ID)).rejects.toThrow(
      "ElevenLabs phone number update failed (401)"
    );
  });

  it("throws with status and body in message on 500", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce(
      new Response("Internal Server Error", { status: 500 })
    );

    await expect(setPhoneNumberAgent(FAKE_KEY, PHONE_ID, AGENT_ID)).rejects.toThrow(
      "ElevenLabs phone number update failed (500): Internal Server Error"
    );
  });
});
