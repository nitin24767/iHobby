import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiPricingEstimator } from "@/components/ai-pricing-estimator";

const pricing = {
  vehicleTypes: [
    { id: "drones", name: "Drones", count: 4 },
    { id: "cars", name: "Cars", count: 9 }
  ],
  selectedVehicleFamily: "drones",
  listingTitle: "Previously selected listing",
  listingCondition: "New",
  brand: "Previous brand",
  model: "Previous model",
  scale: "1/8",
  versionModelYear: "2025",
  batteryCells: 6,
  currentPriceCents: 11800,
  comparableSales: [],
  guidance: { conservativeCents: 0, recommendedCents: 0, buyNowCents: 0 },
  note: "Enter model details."
};

const searchDashboard = {
  history: [],
  remainingRequests: 3,
  limit: 3,
  resetAt: null,
  adminView: false
};

describe("AiPricingEstimator", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens with cleared fields and submits editable RC model details", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        provider: "market-search",
        text: "Recommended range: ₹80,000-₹90,000.",
        comparableSales: [{ id: "sale-1", title: "Comparable Kraton", condition: "New", soldPriceCents: 8_500_000 }],
        guidance: { conservativeCents: 8_000_000, recommendedCents: 8_500_000, buyNowCents: 9_000_000 },
        note: "Updated from current market evidence.",
        webComparables: [{ id: "web-1", title: "ARRMA Kraton 6S", condition: "New", priceCents: 9_500_000, source: "RC Store", url: "https://example.com/item", priceType: "retail" }],
        confidence: "medium",
        evidenceCount: 2,
        researchedAt: "2026-09-20T10:00:00.000Z",
        webSearchUsed: true,
        remainingRequests: 2,
        resetAt: "2026-09-21T10:00:00.000Z"
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AiPricingEstimator pricing={pricing} searchDashboard={searchDashboard} currency="INR" />);

    expect((screen.getByLabelText("Listing title") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Brand") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Model") as HTMLInputElement).value).toBe("");

    fireEvent.change(screen.getByLabelText("Vehicle family"), { target: { value: "cars" } });
    fireEvent.change(screen.getByLabelText("Listing title"), { target: { value: "Arrma Kraton 6s RC Car" } });
    fireEvent.change(screen.getByLabelText("Brand"), { target: { value: "ARRMA" } });
    fireEvent.change(screen.getByLabelText("Model"), { target: { value: "Kraton 6S" } });
    fireEvent.change(screen.getByLabelText("Scale"), { target: { value: "1/8" } });
    fireEvent.change(screen.getByLabelText("Version / model year"), { target: { value: "V6 / 2025" } });
    fireEvent.change(screen.getByLabelText("Condition"), { target: { value: "Used - Excellent condition" } });
    fireEvent.change(screen.getByLabelText("Current price"), { target: { value: "85000" } });
    fireEvent.change(screen.getByLabelText(/^Battery cells \(S\)/), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: "Research current market" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ai/pricing",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          title: "Arrma Kraton 6s RC Car",
          category: "cars",
          condition: "Used - Excellent condition",
          targetPriceCents: 8_500_000,
          attributes: {
            brand: "ARRMA",
            model: "Kraton 6S",
            scale: "1/8",
            versionModelYear: "V6 / 2025",
            cellCount: 6
          }
        })
      })
    );
    expect(await screen.findByText("Recommended range: ₹80,000-₹90,000.")).toBeTruthy();
    expect(screen.getByText("2 of 3 pricing requests remaining")).toBeTruthy();
    expect(screen.getByText("ARRMA Kraton 6S")).toBeTruthy();
  });

  it("disables pricing after a member uses all three requests", () => {
    render(<AiPricingEstimator pricing={pricing} searchDashboard={{ ...searchDashboard, remainingRequests: 0 }} />);
    expect((screen.getByRole("button", { name: "Research current market" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("0 of 3 pricing requests remaining")).toBeTruthy();
  });
});
