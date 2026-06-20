import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  AVA_VOICE_SETTINGS,
  createAvaAgent,
  updateAvaAgent,
} from "../elevenlabs-agent";

const FAKE_KEY = "test-api-key";

const baseConfig = {
  clinicName: "Spires",
  systemPrompt: "You are Ava.",
  voiceId: "voice_123",
  appUrl: "https://portal.strydeos.com",
  apiKey: FAKE_KEY,
};

function lastBody() {
  const mockFetch = vi.mocked(fetch);
  const [, opts] = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
  return JSON.parse(opts?.body as string);
}

describe("canonical Ava voice profile (P0-9)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("applies AVA_VOICE_SETTINGS on agent create", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ agent_id: "agent_new" }), { status: 200 }),
    );

    await createAvaAgent(baseConfig, ["tool_1"]);

    const body = lastBody();
    expect(body.conversation_config.tts).toMatchObject({
      voice_id: "voice_123",
      ...AVA_VOICE_SETTINGS,
    });
  });

  it("re-applies AVA_VOICE_SETTINGS on agent update even without a voiceId", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("{}", { status: 200 }));

    await updateAvaAgent("agent_existing", {
      apiKey: FAKE_KEY,
      systemPrompt: "Updated prompt.",
    });

    const body = lastBody();
    expect(body.conversation_config.tts).toMatchObject(AVA_VOICE_SETTINGS);
  });

  it("keeps the canonical settings when a voiceId IS supplied on update", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("{}", { status: 200 }));

    await updateAvaAgent("agent_existing", {
      apiKey: FAKE_KEY,
      voiceId: "voice_rotated",
      systemPrompt: "Updated.",
    });

    const body = lastBody();
    expect(body.conversation_config.tts).toMatchObject({
      voice_id: "voice_rotated",
      ...AVA_VOICE_SETTINGS,
    });
  });

  it("uses clinically-warm defaults", () => {
    expect(AVA_VOICE_SETTINGS.stability).toBe(0.6);
    expect(AVA_VOICE_SETTINGS.similarity_boost).toBe(0.85);
    expect(AVA_VOICE_SETTINGS.style).toBe(0.0);
    expect(AVA_VOICE_SETTINGS.use_speaker_boost).toBe(true);
  });
});
