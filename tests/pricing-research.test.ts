import { afterEach, describe, expect, it, vi } from "vitest";
import { buildEvidenceBasedGuidance, researchCurrentMarketPricing, type WebPricingComparable } from "@/lib/ai/pricing-research";

function webComparable(priceCents: number, priceType: WebPricingComparable["priceType"] = "asking"): WebPricingComparable {
  return {
    id: `web-${priceCents}`,
    title: "Comparable RC model",
    condition: "Like new",
    priceCents,
    source: "Marketplace",
    url: `https://example.com/${priceCents}`,
    priceType
  };
}

describe("evidence-based pricing guidance", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("falls back to Groq browser search when Gemini pricing research fails", async () => {
    vi.stubEnv("GEMINI_API_KEY", "gemini-test-key");
    vi.stubEnv("AI_PROVIDER", "groq");
    vi.stubEnv("GROQ_API_KEY", "test-key");
    vi.stubEnv("GROQ_MODEL", "openai/gpt-oss-120b");
    vi.stubEnv("GROQ_PRICING_MODEL", "");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => "Gemini unavailable" })
      .mockResolvedValueOnce({ ok: true, text: async () => "" })
      .mockResolvedValueOnce({ ok: true, text: async () => "" })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '<pricing_json>{"summary":"Current Arrma Kraton 6S evidence was found.","comparables":[{"title":"ARRMA KRATON 6S BLX 4WD RTR","price":69999,"condition":"New","source":"RC retailer","url":"https://example.com/arrma-kraton-6s","priceType":"retail"}]}</pricing_json>' } }]
        })
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await researchCurrentMarketPricing({
      title: "Arrma Kraton 6s RC Car",
      category: "cars",
      condition: "Good",
      currency: "INR",
      attributes: {}
    });

    const body = JSON.parse(fetchMock.mock.calls[3][1].body as string);
    expect(body.model).toBe("openai/gpt-oss-20b");
    expect(body.tools).toEqual([{ type: "browser_search" }]);
    expect(body.messages[1].content).toContain("Arrma Kraton 6s RC Car");
    expect(result.webSearchUsed).toBe(true);
    expect(result.provider).toBe("groq");
    expect(result.comparables[0].priceCents).toBe(6_999_900);
  });

  it("uses Gemini before Groq when Google Search returns market evidence", async () => {
    vi.stubEnv("GEMINI_API_KEY", "gemini-test-key");
    vi.stubEnv("GROQ_API_KEY", "groq-test-key");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: '<pricing_json>{"summary":"Google Search found exact Kraton evidence.","comparables":[{"title":"ARRMA KRATON 6S V6","price":99000,"condition":"New","source":"Indian RC store","url":"https://example.com/kraton-v6","priceType":"retail"}]}</pricing_json>' }] } }]
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await researchCurrentMarketPricing({
      title: "Arrma Kraton 6s RC Car",
      category: "cars",
      condition: "Good",
      currency: "INR",
      attributes: { brand: "ARRMA", model: "Kraton 6S", scale: "1/8", versionModelYear: "V6", cellCount: 6 }
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.provider).toBe("gemini");
    expect(result.comparables[0].priceCents).toBe(9_900_000);
  });

  it("uses direct retailer evidence when both AI providers are unavailable", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("GROQ_API_KEY", "");
    const url = "https://havochobby.in/products/arrma-kraton-6s-v5";
    const redirect = `//duckduckgo.com/l/?uddg=${encodeURIComponent(url)}`;
    const html = `<div class="result results_links results_links_deep web-result"><a class="result__a" href="${redirect}">ARRMA Kraton 6S BLX RTR 1/8 Monster Truck</a><a class="result__snippet" href="${redirect}">Retail price ₹136,560.</a></div>`;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: async () => html }));

    const result = await researchCurrentMarketPricing({
      title: "Arrma Kraton 6s RC Car",
      category: "cars",
      condition: "Good",
      currency: "INR",
      attributes: { brand: "ARRMA", model: "Kraton 6S", scale: "1/8", cellCount: 6 }
    });

    expect(result.provider).toBe("market-search");
    expect(result.comparables[0].priceCents).toBe(13_656_000);
  });

  it("uses evidence rather than anchoring on the seller target", () => {
    const result = buildEvidenceBasedGuidance({
      internalPrices: [6_000_000, 6_200_000],
      webComparables: [webComparable(6_500_000), webComparable(6_800_000, "retail")],
      targetPriceCents: 50_000_000,
      currency: "INR",
      condition: "Like new"
    });

    expect(result.guidance.recommendedCents).toBeLessThan(7_000_000);
    expect(result.guidance.recommendedCents).toBeGreaterThan(5_500_000);
    expect(result.note).toContain("above the evidence median");
    expect(result.confidence).toBe("low");
  });

  it("withholds an estimate when no credible evidence exists", () => {
    const result = buildEvidenceBasedGuidance({
      internalPrices: [],
      webComparables: [],
      targetPriceCents: 9_999_900,
      currency: "INR",
      condition: "Good"
    });
    expect(result.guidance.recommendedCents).toBe(0);
    expect(result.confidence).toBe("insufficient");
    expect(result.note).not.toContain("9,999");
  });

  it("limits the impact of extreme outliers", () => {
    const result = buildEvidenceBasedGuidance({
      internalPrices: [5_900_000, 6_000_000, 6_100_000],
      webComparables: [
        webComparable(5_900_000),
        webComparable(6_000_000),
        webComparable(6_100_000),
        webComparable(6_200_000),
        webComparable(90_000_000)
      ],
      targetPriceCents: 6_000_000,
      currency: "INR",
      condition: "Like new"
    });
    expect(result.guidance.recommendedCents).toBeLessThan(7_000_000);
  });
});
