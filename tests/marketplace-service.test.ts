import { describe, expect, it } from "vitest";
import {
  buildPricingGuidance,
  buildRcScopeWithCounts,
  buildWalletSummaryFromLedger,
  auctionEndDate,
  createListingFromDraft,
  createSellerReviewForActor,
  evaluateBuildCompatibility,
  filterComponentMarketplaceListings,
  formatSellerResponseTime,
  mapConversationSummaryRow,
  normalizeRepairChecklist,
  sendConversationMessage,
  selectRelevantComparables,
  slugifyListingTitle
} from "@/lib/server/marketplace";
import type { Actor } from "@/types/domain";

describe("marketplace persistence service", () => {
  it("creates stable listing slugs from RC titles", () => {
    expect(slugifyListingTitle("Autel EVO Lite+ - Fly More Kit")).toBe("autel-evo-lite-fly-more-kit");
  });

  it("calculates bounded auction deadlines from the selected duration", () => {
    const start = new Date("2026-07-14T12:00:00.000Z");
    expect(auctionEndDate(7, start)?.toISOString()).toBe("2026-07-21T12:00:00.000Z");
    expect(auctionEndDate(99, start)).toBeUndefined();
    expect(auctionEndDate(undefined, start, 7)?.toISOString()).toBe("2026-07-21T12:00:00.000Z");
  });

  it("formats seller response averages without inventing a response time", () => {
    expect(formatSellerResponseTime(null)).toBe("No reply data yet");
    expect(formatSellerResponseTime(31)).toBe("31 min");
    expect(formatSellerResponseTime(90)).toBe("1 hr 30 min");
  });

  it("flags an electrical mismatch instead of declaring a build compatible", () => {
    const result = evaluateBuildCompatibility("drones", "6.2:1", [
      { slot: "Frame", selected: "5 inch carbon frame" },
      { slot: "Motor", selected: "2207 1750KV 35A" },
      { slot: "ESC", selected: "45A 3-4S" },
      { slot: "Battery", selected: "6S 1300mAh" }
    ]);

    expect(result.riskLevel).toBe("High");
    expect(result.parts.find((part) => part.slot === "ESC")?.status).toContain("Incompatible");
    expect(result.parts.find((part) => part.slot === "Battery")?.status).toContain("Incompatible");
  });

  it("requires missing build specifications to be reviewed", () => {
    const result = evaluateBuildCompatibility("drones", "6.2:1", [
      { slot: "Battery", selected: "6S 1300mAh" }
    ]);

    expect(result.riskLevel).toBe("Review");
    expect(result.summary).toContain("Missing drones core parts: frame, motor, esc");
    expect(result.parts[0].status).toContain("Review");
  });

  it("builds RC marketplace counts from listing rows", () => {
    const scope = buildRcScopeWithCounts([
      { categorySlug: "drones", attributes: { scope: "vehicles", vehicleType: "drones" } },
      { categorySlug: "drones", attributes: { scope: "components", vehicleType: "drones", componentType: "motor" } },
      { categorySlug: "drones", attributes: { scope: "components", vehicleType: "drones", componentType: "esc" } },
      { categorySlug: "cars", attributes: { scope: "vehicles", vehicleType: "cars" } }
    ]);

    expect(scope.sections.find((item) => item.id === "vehicles")?.count).toBe(2);
    expect(scope.sections.find((item) => item.id === "components")?.count).toBe(2);
    expect(scope.vehicleTypes.find((item) => item.id === "all")?.count).toBe(2);
    expect(scope.vehicleTypes.find((item) => item.id === "drones")?.count).toBe(1);
    expect(scope.vehicleTypes.find((item) => item.id === "cars")?.count).toBe(1);
    expect(scope.componentTypes.drones.find((item) => item.id === "all")?.count).toBe(2);
    expect(scope.componentTypes.drones.find((item) => item.id === "motor")?.count).toBe(1);
    expect(scope.componentTypes.drones.find((item) => item.id === "esc")?.count).toBe(1);
  });

  it("filters component listings by condition and price", () => {
    const results = filterComponentMarketplaceListings(
      [
        { id: "esc", slug: "esc", title: "New ESC", vt: "drones", ct: "esc", condition: "New", priceCents: 6900, location: "San Jose", stock: 2, media: "/esc.svg" },
        { id: "tire", slug: "tire", title: "New tire set", vt: "cars", ct: "tire", condition: "New", priceCents: 5400, location: "Denver", stock: 6, media: "/tire.svg" },
        { id: "blade", slug: "blade", title: "Used blade set", vt: "helis", ct: "blade", condition: "Like new", priceCents: 17900, location: "Phoenix", stock: 1, media: "/blade.svg" }
      ],
      { condition: "new", maxPrice: 60 }
    );

    expect(results.map((item) => item.id)).toEqual(["tire"]);
  });

  it("rejects create-listing requests before database work when role is not allowed", async () => {
    const visitor: Actor = {
      id: "visitor",
      email: "",
      displayName: "Guest",
      handle: "guest",
      role: "VISITOR",
      avatarInitials: "GU",
      isAuthenticated: false,
      authProvider: "visitor"
    };

    const result = await createListingFromDraft(visitor, {
      title: "Autel EVO Lite+ - Fly More Kit",
      description: "Like-new camera drone with controller, batteries, charger, case, and verified flight logs.",
      categorySlug: "drones",
      condition: "Like new",
      listingType: "AUCTION",
      priceCents: 64200,
      location: "Austin, TX",
      attributes: {
        brand: "Autel",
        model: "EVO Lite+"
      },
      mediaUrls: []
    });

    expect(result.mode).toBe("forbidden");
  });

  it("rejects seller reviews before database work when the actor is not a signed-in buyer", async () => {
    const visitor: Actor = {
      id: "visitor",
      email: "",
      displayName: "Guest",
      handle: "guest",
      role: "VISITOR",
      avatarInitials: "GU",
      isAuthenticated: false,
      authProvider: "visitor"
    };

    const result = await createSellerReviewForActor(visitor, { listingId: "listing-1", rating: 5 });

    expect(result.mode).toBe("forbidden");
  });

  it("summarizes credit ledger balances from persisted-style rows", () => {
    const summary = buildWalletSummaryFromLedger(
      [
        {
          id: "hold",
          amount: -33,
          kind: "HOLD",
          status: "POSTED",
          reason: "Bid hold - EVO Lite+",
          createdAt: new Date("2026-06-09T11:12:00.000Z")
        },
        {
          id: "bonus",
          amount: 120,
          kind: "CREDIT",
          status: "POSTED",
          reason: "Listing verification bonus",
          createdAt: new Date("2026-06-08T14:10:00.000Z")
        },
        {
          id: "boost",
          amount: -25,
          kind: "DEBIT",
          status: "POSTED",
          reason: "Saved search boost",
          createdAt: new Date("2026-06-08T09:00:00.000Z")
        },
        {
          id: "starter",
          amount: 480,
          kind: "CREDIT",
          status: "POSTED",
          reason: "Buyer starter credits",
          createdAt: new Date("2026-06-01T09:00:00.000Z")
        }
      ],
      "BUYER",
      new Date("2026-06-09T12:00:00.000Z")
    );

    expect(summary.balanceCredits).toBe(542);
    expect(summary.bidHoldsCredits).toBe(33);
    expect(summary.boostBudgetCredits).toBe(25);
    expect(summary.rewardTier).toBe("Builder");
    expect(summary.transactions[0]).toMatchObject({ amountLabel: "-33 cr", tone: "warn", statusLabel: "posted" });
  });

  it("normalizes repair checklist JSON safely", () => {
    expect(normalizeRepairChecklist(["Inspect shaft.", "", 42, "Record disclosure."])).toEqual([
      "Inspect shaft.",
      "Record disclosure."
    ]);
    expect(normalizeRepairChecklist({ invalid: true })).toEqual([]);
  });

  it("calculates pricing guidance from comparable sales", () => {
    const guidance = buildPricingGuidance({
      listingPriceCents: 64200,
      buyNowCents: 82000,
      comparablePrices: [61000, 69000, 56000]
    });

    expect(guidance).toEqual({
      conservativeCents: 56000,
      recommendedCents: 62000,
      buyNowCents: 82000
    });
  });

  it("excludes category-level comparables for unrelated models", () => {
    const comparable = (id: string, title: string) => ({
      id,
      title,
      condition: "Like new",
      soldPriceCents: 6_000_000,
      soldAt: "2026-09-01T00:00:00.000Z"
    });
    const selected = selectRelevantComparables([
      comparable("evo", "Autel EVO Lite+ fly more bundle"),
      comparable("dji", "DJI Mini 4 Pro fly more combo"),
      comparable("fpv", "Custom five inch FPV racing quad")
    ], "Autel EVO Lite Plus camera drone", "Like new");

    expect(selected.map((item) => item.id)).toEqual(["evo"]);
  });

  it("maps persisted conversation messages into the inbox thread", () => {
    const summary = mapConversationSummaryRow(
      {
        id: "conv-1",
        listingId: "listing-1",
        subject: "Autel EVO Lite+ shipping",
        updatedAt: new Date("2026-06-09T11:20:00.000Z"),
        participants: [
          { userId: "buyer-1", user: { displayName: "Buyer" } },
          { userId: "seller-1", user: { displayName: "Seller" } }
        ],
        messages: [
          {
            id: "msg-1",
            senderId: "seller-1",
            sender: { displayName: "Seller", role: "SELLER" },
            body: "I can ship insured ground.",
            createdAt: new Date("2026-06-09T11:14:00.000Z")
          },
          {
            id: "msg-2",
            senderId: "buyer-1",
            sender: { displayName: "Buyer", role: "BUYER" },
            body: "Please confirm the charger is included.",
            createdAt: new Date("2026-06-09T11:16:00.000Z")
          }
        ]
      },
      "buyer-1",
      "BUYER",
      "Autel EVO Lite+ - Fly More Kit"
    );

    expect(summary.otherParty).toBe("Seller");
    expect(summary.lastMessage).toBe("Please confirm the charger is included.");
    expect(summary.messages).toHaveLength(2);
    expect(summary.messages[0]).toMatchObject({ body: "I can ship insured ground.", isMine: false });
    expect(summary.messages[1]).toMatchObject({ body: "Please confirm the charger is included.", isMine: true });
  });

  it("rejects empty conversation messages before database work", async () => {
    const buyer: Actor = {
      id: "demo-buyer",
      email: "buyer@ihobbyworld.local",
      displayName: "Eliot Manning",
      handle: "eliot",
      role: "BUYER",
      avatarInitials: "EM",
      isAuthenticated: true,
      authProvider: "demo"
    };

    const result = await sendConversationMessage(buyer, "conversation-1", "   ");

    expect(result.mode).toBe("invalid");
  });
});
