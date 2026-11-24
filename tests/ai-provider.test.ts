import { afterEach, describe, expect, it, vi } from "vitest";
import { completeAiText } from "@/lib/ai/providers";

describe("ai providers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("enables Gemini Google Search for primary pricing research", async () => {
    vi.stubEnv("GEMINI_API_KEY", "gemini-test-key");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: "grounded result" }] } }] })
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await completeAiText({
      feature: "pricing-research",
      providerOverride: "gemini",
      modelOverride: "gemini-3.8-flash",
      system: "research",
      prompt: "item",
      webSearch: { country: "india" }
    });

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string);
    expect(url).toContain("models/gemini-3.8-flash:generateContent");
    expect((options.headers as Record<string, string>)["x-goog-api-key"]).toBe("gemini-test-key");
    expect(body.tools).toEqual([{ google_search: {} }]);
    expect(body.generationConfig.thinkingConfig.thinkingLevel).toBe("low");
    expect(result.provider).toBe("gemini");
    expect(result.text).toBe("grounded result");
  });

  it("enables Groq browser search for grounded pricing research", async () => {
    vi.stubEnv("AI_PROVIDER", "groq");
    vi.stubEnv("GROQ_API_KEY", "test-key");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "<pricing_json>{\"summary\":\"Market evidence found.\",\"comparables\":[]}</pricing_json>" } }] })
    });
    vi.stubGlobal("fetch", fetchMock);

    await completeAiText({
      feature: "pricing-research",
      system: "research",
      prompt: "item",
      modelOverride: "openai/gpt-oss-120b",
      webSearch: { country: "india" }
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.model).toBe("openai/gpt-oss-120b");
    expect(body.tools).toEqual([{ type: "browser_search" }]);
    expect(body.tool_choice).toBe("required");
    expect(body.compound_custom).toBeUndefined();
  });

  it("uses mock mode when no provider key is configured", async () => {
    vi.stubEnv("AI_PROVIDER", "mock");
    const result = await completeAiText({
      feature: "pricing",
      system: "test",
      prompt: "test"
    });

    expect(result.provider).toBe("mock");
    expect(result.text).toContain("Estimated market range");
  });

  it("falls back to mock mode when Groq is selected without a key", async () => {
    vi.stubEnv("AI_PROVIDER", "groq");
    vi.stubEnv("GROQ_API_KEY", "");

    const result = await completeAiText({
      feature: "listing",
      system: "test",
      prompt: "test"
    });

    expect(result.provider).toBe("mock");
    expect(result.text).toContain("Recommended title");
  });
});
