import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { getPricingSearchDashboard, reservePricingSearch, type PricingSearchInput } from "@/lib/server/pricing-searches";
import type { Actor } from "@/types/domain";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
    pricingSearch: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn()
    }
  }
}));

vi.mock("@/lib/server/users", () => ({
  ensureUserForActor: vi.fn(async () => ({ id: "member-db" }))
}));

const member = {
  id: "member",
  role: "BUYER",
  email: "member@example.com",
  displayName: "Member",
  handle: "member",
  avatarInitials: "ME",
  isAuthenticated: true,
  authProvider: "demo"
} as Actor;

const request: PricingSearchInput = {
  vehicleFamily: "cars",
  title: "Arrma Kraton 6s RC Car",
  brand: "ARRMA",
  itemModel: "Kraton 6S BLX",
  scale: "1/8",
  versionModelYear: "V6 / 2025",
  cellCount: 6,
  condition: "Used - Excellent condition",
  targetPriceCents: 8_500_000,
  currency: "INR"
};

describe("pricing search limits and history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a member only their last three searches and current allowance", async () => {
    vi.mocked(prisma.pricingSearch.findMany).mockResolvedValue([]);
    vi.mocked(prisma.pricingSearch.count).mockResolvedValue(2);
    vi.mocked(prisma.pricingSearch.findFirst).mockResolvedValue({ createdAt: new Date("2026-09-23T00:00:00.000Z") } as never);

    await expect(getPricingSearchDashboard(member)).resolves.toMatchObject({
      history: [],
      remainingRequests: 1,
      limit: 3,
      resetAt: "2026-09-24T00:00:00.000Z",
      adminView: false
    });
    expect(prisma.pricingSearch.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "member-db" },
      take: 3
    }));
  });

  it("rejects a member's fourth request before creating a search", async () => {
    const tx = {
      pricingSearch: {
        count: vi.fn().mockResolvedValue(3),
        findFirst: vi.fn().mockResolvedValue({ createdAt: new Date("2026-09-23T00:00:00.000Z") }),
        create: vi.fn()
      }
    };
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx as never));

    await expect(reservePricingSearch(member, request)).resolves.toEqual({
      mode: "limited",
      remainingRequests: 0,
      resetAt: "2026-09-24T00:00:00.000Z"
    });
    expect(tx.pricingSearch.create).not.toHaveBeenCalled();
  });

  it("keeps administrator pricing requests unlimited", async () => {
    const createdAt = new Date("2026-09-23T00:00:00.000Z");
    const tx = {
      pricingSearch: {
        count: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn().mockResolvedValue({ id: "search-admin", createdAt })
      }
    };
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx as never));

    await expect(reservePricingSearch({ ...member, role: "ADMIN" }, request)).resolves.toEqual({
      mode: "reserved",
      id: "search-admin",
      userId: "member-db",
      remainingRequests: null,
      resetAt: null
    });
    expect(tx.pricingSearch.count).not.toHaveBeenCalled();
    expect(tx.pricingSearch.create).toHaveBeenCalledTimes(1);
  });
});
