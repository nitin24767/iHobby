import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { assertDemoDataEnabled, DemoDataError, seedDemoData } from "@/lib/server/demo-data";
import { hashPassword } from "@/lib/server/passwords";

vi.mock("@/lib/server/passwords", () => ({ hashPassword: vi.fn() }));

const fixtureTables = [
  "user", "listing", "listingMedia", "bid", "offer", "watchlistItem",
  "conversation", "conversationParticipant", "message", "notification",
  "creditLedgerEntry", "loyaltyEvent", "buildConfiguration", "buildPart",
  "repairSession", "pricingComparable", "pricingSearch", "report", "sellerApplication"
] as const;
type FixtureTable = typeof fixtureTables[number];

function delegate() {
  return {
    createMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn()
  };
}

const delegates = Object.fromEntries(fixtureTables.map((name) => [name, delegate()])) as Record<FixtureTable, ReturnType<typeof delegate>>;
const transaction = {
  ...delegates,
  $queryRaw: vi.fn(),
  user: { ...delegates.user, findFirst: vi.fn() },
  listing: { ...delegates.listing, findFirst: vi.fn() },
  hobbyCategory: { ...delegate(), findMany: vi.fn() },
  auditLog: { ...delegate(), findMany: vi.fn(), create: vi.fn() }
};
const runTransaction = vi.fn();
const client = { $transaction: runTransaction } as unknown as Pick<PrismaClient, "$transaction">;

// Unit-test inputs only. These are not credentials for a deployed account.
const environment = {
  DEPLOYMENT_MODE: "demo",
  DEMO_SEED_DATA: "true",
  DEMO_BUYER_PASSWORD: "UnitTest!Buyer8Only",
  DEMO_SELLER_PASSWORD: "UnitTest!Seller9Only",
  DEMO_TEST_ADMIN_PASSWORD: "UnitTest!Admin7Only"
};
const passwordKeys = ["DEMO_BUYER_PASSWORD", "DEMO_SELLER_PASSWORD", "DEMO_TEST_ADMIN_PASSWORD"] as const;
const categories = ["drones", "helis", "planes", "cars"].map((slug) => ({
  id: `existing-category-${slug}`, slug, active: true
}));
const marker = {
  id: "demo-v1-sample-data-marker",
  action: "demo.sample-data.v1",
  entity: "DemoFixtureSet",
  entityId: "demo-v1",
  metadata: { fixture: "demo-v1", version: 1 }
};

function insertedRows(table: FixtureTable): Array<Record<string, unknown>> {
  return delegates[table].createMany.mock.calls.flatMap(([request]) => request.data as Array<Record<string, unknown>>);
}

function expectNoFixtureWrites() {
  for (const table of fixtureTables) expect(delegates[table].createMany).not.toHaveBeenCalled();
  expect(transaction.auditLog.create).not.toHaveBeenCalled();
  expect(transaction.hobbyCategory.createMany).not.toHaveBeenCalled();
}

function expectNoDestructiveWrites() {
  for (const model of [...Object.values(delegates), transaction.hobbyCategory, transaction.auditLog]) {
    for (const operation of ["update", "updateMany", "upsert", "delete", "deleteMany"] as const) {
      expect(model[operation]).not.toHaveBeenCalled();
    }
  }
}

describe("safe demo sample data", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    runTransaction.mockImplementation(async (callback: (tx: typeof transaction) => unknown) => callback(transaction));
    transaction.$queryRaw.mockResolvedValue([{ locked: 1 }]);
    transaction.auditLog.findMany.mockResolvedValue([]);
    transaction.auditLog.create.mockResolvedValue(marker);
    transaction.user.findFirst.mockResolvedValue(null);
    transaction.listing.findFirst.mockResolvedValue(null);
    transaction.hobbyCategory.findMany.mockResolvedValue(categories);
    for (const table of fixtureTables) {
      delegates[table].createMany.mockImplementation(async ({ data }: { data: unknown[] }) => ({ count: data.length }));
    }
    vi.mocked(hashPassword).mockResolvedValue("scrypt$unit-test-salt$unit-test-derived-key");
  });

  it.each([undefined, "production", "development", "Demo"])("rejects mode %s before accessing the database", async (mode) => {
    await expect(seedDemoData(client, { ...environment, DEPLOYMENT_MODE: mode })).rejects.toThrow(DemoDataError);
    expect(runTransaction).not.toHaveBeenCalled();
    expect(hashPassword).not.toHaveBeenCalled();
  });

  it.each([undefined, "false", "TRUE", "1"])("requires explicit sample-data opt-in (value: %s)", async (enabled) => {
    const input = { ...environment, DEMO_SEED_DATA: enabled };
    expect(() => assertDemoDataEnabled(input)).toThrow(DemoDataError);
    await expect(seedDemoData(client, input)).rejects.toThrow(DemoDataError);
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it("waits for the advisory lock before reading the completion marker", async () => {
    let releaseLock!: () => void;
    transaction.$queryRaw.mockImplementation(() => new Promise((resolve) => {
      releaseLock = () => resolve([{ locked: 1 }]);
    }));

    const result = seedDemoData(client, environment);
    expect(transaction.$queryRaw).toHaveBeenCalledOnce();
    expect(transaction.auditLog.findMany).not.toHaveBeenCalled();
    expectNoFixtureWrites();
    const [query] = transaction.$queryRaw.mock.calls[0];
    expect(query.join("")).toContain("pg_advisory_xact_lock");

    releaseLock();
    await result;
    expect(transaction.auditLog.findMany).toHaveBeenCalledOnce();
    expect(runTransaction).toHaveBeenCalledWith(expect.any(Function), { maxWait: 10_000, timeout: 120_000 });
  });

  it.each([
    { DEPLOYMENT_MODE: "demo", DEMO_SEED_DATA: "true" },
    { ...environment, DEMO_BUYER_PASSWORD: "invalid", DEMO_SELLER_PASSWORD: "invalid", DEMO_TEST_ADMIN_PASSWORD: "invalid" }
  ])("preserves completed demo interactions without requiring or hashing passwords", async (input) => {
    transaction.auditLog.findMany.mockResolvedValue([marker]);

    await expect(seedDemoData(client, input)).resolves.toEqual({ status: "preserved", counts: {} });

    expect(hashPassword).not.toHaveBeenCalled();
    expect(transaction.user.findFirst).not.toHaveBeenCalled();
    expect(transaction.listing.findFirst).not.toHaveBeenCalled();
    expect(transaction.hobbyCategory.findMany).not.toHaveBeenCalled();
    expectNoFixtureWrites();
    expectNoDestructiveWrites();
  });

  it.each([
    { markers: [{ ...marker, action: "unrelated.audit" }] },
    { markers: [{ ...marker, entityId: "someone-else" }] },
    { markers: [{ ...marker, metadata: { fixture: "another-fixture", version: 1 } }] },
    { markers: [marker, { ...marker, id: "another-marker" }] }
  ])("refuses a conflicting or ambiguous completion marker", async ({ markers }) => {
    transaction.auditLog.findMany.mockResolvedValue(markers);

    await expect(seedDemoData(client, environment)).rejects.toThrow(DemoDataError);

    expect(hashPassword).not.toHaveBeenCalled();
    expectNoFixtureWrites();
  });

  it.each(passwordKeys)("requires %s for the first run without writing accounts", async (key) => {
    await expect(seedDemoData(client, { ...environment, [key]: undefined })).rejects.toThrow(DemoDataError);
    expect(hashPassword).not.toHaveBeenCalled();
    expectNoFixtureWrites();
  });

  it.each([
    "Short!7Ab", "alllowercase7!long", "ALLUPPERCASE7!LONG",
    "NoDigitsInThisPassword!", "MissingSymbol123A", "A1!".repeat(44)
  ])("rejects a password that fails the credential policy", async (password) => {
    const input = { ...environment, DEMO_BUYER_PASSWORD: password };

    await expect(seedDemoData(client, input)).rejects.toThrow(DemoDataError);

    expect(hashPassword).not.toHaveBeenCalled();
    expectNoFixtureWrites();
  });

  it("requires distinct credentials for the three test roles", async () => {
    const input = { ...environment, DEMO_SELLER_PASSWORD: environment.DEMO_BUYER_PASSWORD };

    await expect(seedDemoData(client, input)).rejects.toThrow(DemoDataError);

    expect(hashPassword).not.toHaveBeenCalled();
    expectNoFixtureWrites();
  });

  it("rejects a reserved account collision instead of resetting or promoting an existing user", async () => {
    transaction.user.findFirst.mockResolvedValue({ id: "real-registered-user" });

    await expect(seedDemoData(client, environment)).rejects.toThrow(DemoDataError);

    const [query] = transaction.user.findFirst.mock.calls[0];
    expect(query.where.OR).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: expect.anything() }),
      expect.objectContaining({ email: expect.objectContaining({ mode: "insensitive" }) }),
      expect.objectContaining({ handle: expect.objectContaining({ mode: "insensitive" }) })
    ]));
    expect(hashPassword).not.toHaveBeenCalled();
    expectNoFixtureWrites();
    expectNoDestructiveWrites();
  });

  it("refuses a reserved listing ID or slug collision before inserting any fixtures", async () => {
    transaction.listing.findFirst.mockResolvedValue({ id: "existing-listing" });

    await expect(seedDemoData(client, environment)).rejects.toThrow(DemoDataError);

    const [query] = transaction.listing.findFirst.mock.calls[0];
    expect(query.where.OR).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: expect.anything() }),
      expect.objectContaining({ slug: expect.anything() })
    ]));
    expect(hashPassword).not.toHaveBeenCalled();
    expectNoFixtureWrites();
  });

  it.each([
    { existingCategories: categories.slice(1) },
    { existingCategories: categories.map((category) => category.slug === "cars" ? { ...category, active: false } : category) }
  ])("preserves category choices and refuses missing or inactive required categories", async ({ existingCategories }) => {
    transaction.hobbyCategory.findMany.mockResolvedValue(existingCategories);

    await expect(seedDemoData(client, environment)).rejects.toThrow(DemoDataError);

    expect(hashPassword).not.toHaveBeenCalled();
    expectNoFixtureWrites();
    expectNoDestructiveWrites();
  });

  it("creates only namespaced demo fixtures and hashed test credentials in a single transaction", async () => {
    const result = await seedDemoData(client, environment, new Date("2026-11-24T12:00:00.000Z"));

    expect(result.status).toBe("created");
    expect(result.counts).toMatchObject({ users: 3, listings: 10 });
    expect(runTransaction).toHaveBeenCalledOnce();
    const users = insertedRows("user");
    expect(users).toHaveLength(3);
    expect(users.map(({ email, role }) => ({ email, role }))).toEqual(expect.arrayContaining([
      { email: "buyer.demo@ihobbyworld.local", role: "BUYER" },
      { email: "seller.demo@ihobbyworld.local", role: "SELLER" },
      { email: "admin.demo@ihobbyworld.local", role: "ADMIN" }
    ]));
    for (const user of users) expect(user.passwordHash).toBe("scrypt$unit-test-salt$unit-test-derived-key");
    expect(vi.mocked(hashPassword).mock.calls.map(([password]) => password).sort()).toEqual(
      passwordKeys.map((key) => environment[key]).sort()
    );

    const listings = insertedRows("listing");
    expect(listings.filter((listing) => listing.status === "ACTIVE")).toHaveLength(9);
    expect(listings.filter((listing) => listing.status === "PENDING_REVIEW")).toHaveLength(1);
    for (const listing of listings) {
      expect(listing.slug).toMatch(/^demo-v1-/);
      expect(listing.title).toMatch(/demo/i);
      expect(listing.currency).toBe("INR");
      expect(listing.categoryId).toMatch(/^existing-category-/);
    }
    for (const media of insertedRows("listingMedia")) expect(media.url).toMatch(/^\/media\/[^/]+\.svg$/);
    for (const entry of insertedRows("creditLedgerEntry")) expect(entry.reason).toMatch(/demo/i);

    for (const table of fixtureTables) {
      expect(delegates[table].createMany).toHaveBeenCalledOnce();
      expect(delegates[table].createMany.mock.calls[0][0].skipDuplicates).not.toBe(true);
      for (const row of insertedRows(table)) expect(row.id).toMatch(/^demo-v1-/);
    }
    expect(transaction.hobbyCategory.createMany).not.toHaveBeenCalled();
    expectNoDestructiveWrites();

    const publicResult = JSON.stringify({ result, audit: transaction.auditLog.create.mock.calls });
    const databaseWrites = JSON.stringify(fixtureTables.map((table) => delegates[table].createMany.mock.calls));
    for (const key of passwordKeys) {
      expect(publicResult).not.toContain(environment[key]);
      expect(databaseWrites).not.toContain(environment[key]);
    }
    expect(publicResult).not.toContain("scrypt$");
    const writeCalls = fixtureTables.flatMap((table) => delegates[table].createMany.mock.invocationCallOrder);
    expect(transaction.auditLog.create.mock.invocationCallOrder[0]).toBeGreaterThan(Math.max(...writeCalls));
    expect(transaction.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        id: marker.id, action: marker.action, entity: marker.entity, entityId: marker.entityId,
        metadata: expect.objectContaining(marker.metadata)
      })
    }));
  });

  it("aborts on a late fixture uniqueness collision and does not write the completion marker", async () => {
    transaction.message.createMany.mockRejectedValue({ code: "P2002", meta: { target: ["id"] } });

    await expect(seedDemoData(client, environment)).rejects.toThrow(DemoDataError);

    expect(runTransaction).toHaveBeenCalledOnce();
    expect(transaction.auditLog.create).not.toHaveBeenCalled();
    expectNoDestructiveWrites();
  });

  it("keeps seeded auction bids and pending offers consistent with their listings", async () => {
    const now = new Date("2026-11-24T12:00:00.000Z");
    await seedDemoData(client, environment, now);

    const listings = insertedRows("listing");
    const auction = listings.find((listing) => listing.listingType === "AUCTION");
    expect(auction).toBeDefined();
    const auctionBids = insertedRows("bid").filter((bid) => bid.listingId === auction?.id);
    const winning = auctionBids.filter((bid) => bid.status === "WINNING");
    const outbid = auctionBids.filter((bid) => bid.status === "OUTBID");
    expect(winning).toHaveLength(1);
    expect(auction?.priceCents).toBe(winning[0].amountCents);
    expect(outbid.length).toBeGreaterThan(0);
    for (const bid of outbid) expect(bid.amountCents).toBeLessThan(Number(winning[0].amountCents));
    expect(auction?.reserveCents).toBeLessThanOrEqual(Number(auction?.buyNowCents));
    expect(auction?.endsAt).toBeInstanceOf(Date);
    expect((auction?.endsAt as Date).getTime()).toBeGreaterThan(now.getTime());

    const pendingOffers = insertedRows("offer").filter((offer) => offer.status === "PENDING");
    expect(pendingOffers).toHaveLength(1);
    for (const offer of pendingOffers) {
      const listing = listings.find((row) => row.id === offer.listingId);
      expect(listing).toMatchObject({ listingType: "OFFER", status: "ACTIVE" });
      expect(offer.buyerId).not.toBe(listing?.sellerId);
      expect(offer.amountCents).toBeGreaterThan(0);
    }
  });

  it("propagates a transaction failure without recording successful initialization", async () => {
    transaction.listingMedia.createMany.mockRejectedValue(new Error("simulated database interruption"));

    await expect(seedDemoData(client, environment)).rejects.toThrow();

    expect(transaction.auditLog.create).not.toHaveBeenCalled();
    expectNoDestructiveWrites();
  });
});
