import { describe, expect, it } from "vitest";
import { candidateFromRecord, parseLabeledPdfText } from "@/lib/bulk-listings";

describe("bulk listing import parsing", () => {
  it("normalizes an Excel-style record into a listing draft", () => {
    const candidate = candidateFromRecord({
      "Listing Title": "Autel EVO Lite Plus complete fly-more bundle",
      Description: "A carefully maintained camera drone package with controller, batteries, charger, case, and complete flight logs.",
      Category: "RC Drones",
      Condition: "Like new",
      "Listing Type": "Fixed price",
      Price: "$1,249.50",
      Location: "Austin, TX",
      Brand: "Autel",
      Model: "EVO Lite+",
      Images: "front.jpg; case.webp",
      "attribute.flight time": "40 minutes"
    }, "listings.xlsx", 2);

    expect(candidate.draft.categorySlug).toBe("drones");
    expect(candidate.draft.listingType).toBe("FIXED_PRICE");
    expect(candidate.draft.priceCents).toBe(124950);
    expect(candidate.draft.attributes).toMatchObject({
      brand: "Autel",
      model: "EVO Lite+",
      flightTime: "40 minutes",
      durationDays: 7
    });
    expect(candidate.imageFiles).toEqual(["front.jpg", "case.webp"]);
  });

  it("extracts multiple labeled records from PDF text", () => {
    const candidates = parseLabeledPdfText(`
Title: Traxxas TRX-4 Defender trail crawler package
Description: Complete trail crawler package with radio, battery, charger, upgrades, and clean running gear.
Category: cars
Condition: Excellent
Listing Type: Auction
Price: 560
Location: Denver, CO
Brand: Traxxas
Model: TRX-4
Images: trx4.jpg
---
Title: E-flite P-51 Mustang bind-and-fly aircraft
Description: Carefully stored warbird with receiver, retracts, spare propeller, manuals, and original packaging included.
Category: planes
Condition: Good
Listing Type: Offer
Price: 310
Location: Tampa, FL
Brand: E-flite
Model: P-51 Mustang
    `, "inventory.pdf");

    expect(candidates).toHaveLength(2);
    expect(candidates[0].draft.priceCents).toBe(56000);
    expect(candidates[1].draft.listingType).toBe("OFFER");
    expect(candidates[1].source).toBe("inventory.pdf");
  });

  it("starts a new PDF record when another Title field appears", () => {
    const candidates = parseLabeledPdfText("Title: First long listing title\nPrice: 10\nTitle: Second long listing title\nPrice: 20");
    expect(candidates).toHaveLength(2);
    expect(candidates[1].draft.priceCents).toBe(2000);
  });
});
