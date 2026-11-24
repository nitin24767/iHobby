import { afterEach, describe, expect, it, vi } from "vitest";
import { searchDirectMarketPricing } from "@/lib/ai/direct-market-search";

function resultHtml(url: string, title: string, snippet: string) {
  const redirect = `//duckduckgo.com/l/?uddg=${encodeURIComponent(url).replace(/&/g, "&amp;")}`;
  return `<div class="result results_links results_links_deep web-result"><a rel="nofollow" class="result__a" href="${redirect}">${title}</a><a class="result__snippet" href="${redirect}">${snippet}</a></div>`;
}

describe("direct market pricing search", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns exact retailer prices for an Arrma Kraton 6S without an AI provider", async () => {
    const firstPage = [
      resultHtml(
        "https://havochobby.in/products/arrma-kraton-6s-v5",
        "ARRMA Kraton 6S BLX RTR 1/8 Monster Truck V5",
        "ARRMA Kraton 6S BLX is available for ₹136,560."
      ),
      resultHtml(
        "https://www.indiamart.com/proddetail/arrma-kraton-6s.html",
        "ARRMA Kraton 6S RTR Truck",
        "Wholesale price ₹19,000."
      )
    ].join("");
    const secondPage = resultHtml(
      "https://www.ubuy.co.in/product/arrma-kraton-6s-v6",
      "ARRMA Kraton 6S BLX RTR 1/8 Monster Truck V6",
      "Current INR price ₹64,557."
    );
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, text: async () => firstPage })
      .mockResolvedValueOnce({ ok: true, text: async () => secondPage });
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchDirectMarketPricing({
      title: "Arrma Kraton 6s RC Car",
      category: "cars",
      condition: "Good",
      currency: "INR",
      attributes: { brand: "ARRMA", model: "Kraton 6S", scale: "1/8", cellCount: 6 }
    });

    expect(result?.comparables).toHaveLength(2);
    expect(result?.comparables.map((item) => item.priceCents)).toEqual([13_656_000, 6_455_700]);
    expect(result?.comparables.some((item) => item.source === "Indiamart")).toBe(false);
  });
});
