import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { bootstrapDemo } from "@/lib/server/demo-bootstrap";
import { hashPassword } from "@/lib/server/passwords";

vi.mock("@/lib/server/passwords", () => ({
  hashPassword: vi.fn()
}));

const transaction = {
  $queryRaw: vi.fn(),
  user: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn()
  },
  auditLog: { create: vi.fn() },
  hobbyCategory: { createMany: vi.fn() }
};
const runTransaction = vi.fn();
const client = { $transaction: runTransaction } as unknown as Pick<PrismaClient, "$transaction">;
const environment = {
  DEPLOYMENT_MODE: "demo",
  DEMO_ADMIN_EMAIL: "owner@example.com",
  DEMO_ADMIN_PASSWORD: "TestOnly!Long7Pass",
  DEMO_ADMIN_NAME: "Demo Owner"
};

describe("controlled demo bootstrap", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    runTransaction.mockImplementation(async (callback: (tx: typeof transaction) => unknown) => callback(transaction));
    transaction.$queryRaw.mockResolvedValue([{ locked: 1 }]);
    transaction.user.findFirst.mockResolvedValue(null);
    transaction.user.findUnique.mockResolvedValue(null);
    transaction.user.create.mockResolvedValue({ id: "new-admin-id" });
    transaction.auditLog.create.mockResolvedValue({ id: "audit-id" });
    transaction.hobbyCategory.createMany.mockResolvedValue({ count: 4 });
    vi.mocked(hashPassword).mockResolvedValue("scrypt$test-salt$test-derived-key");
  });

  it.each([undefined, "production", "development", "Demo"])("refuses mode %s before accessing the database", async (mode) => {
    await expect(bootstrapDemo(client, { ...environment, DEPLOYMENT_MODE: mode })).rejects.toThrow("DEPLOYMENT_MODE=demo");
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it("requires explicit first-admin credentials without creating any content", async () => {
    await expect(bootstrapDemo(client, { DEPLOYMENT_MODE: "demo" })).rejects.toThrow("DEMO_ADMIN_EMAIL and DEMO_ADMIN_PASSWORD");
    expect(transaction.user.create).not.toHaveBeenCalled();
    expect(transaction.hobbyCategory.createMany).not.toHaveBeenCalled();
  });

  it.each(["Admin@123", "Seller@123", " Buyer@123 "])("refuses known development credentials", async (password) => {
    await expect(bootstrapDemo(client, { ...environment, DEMO_ADMIN_PASSWORD: password })).rejects.toThrow("Development seed passwords");
    expect(transaction.user.create).not.toHaveBeenCalled();
    expect(hashPassword).not.toHaveBeenCalled();
  });

  it.each(["Short!7Ab", "longbutlowercase7!", "LONGUPPERCASE7!", "NoNumberInThis!", "MissingSymbol123A", "A1!".repeat(44)])(
    "rejects a password that fails the bootstrap strength policy",
    async (password) => {
      await expect(bootstrapDemo(client, { ...environment, DEMO_ADMIN_PASSWORD: password })).rejects.toThrow("12–128 characters");
      expect(transaction.user.create).not.toHaveBeenCalled();
    }
  );

  it("rejects an invalid email and invalid display name before writes", async () => {
    await expect(bootstrapDemo(client, { ...environment, DEMO_ADMIN_EMAIL: "not-an-email" })).rejects.toThrow("valid email address");
    await expect(bootstrapDemo(client, { ...environment, DEMO_ADMIN_NAME: " " })).rejects.toThrow("DEMO_ADMIN_NAME");
    expect(transaction.user.create).not.toHaveBeenCalled();
  });

  it("creates one admin with a hashed password and records a credential-free audit entry", async () => {
    const result = await bootstrapDemo(client, { ...environment, DEMO_ADMIN_EMAIL: " OWNER@EXAMPLE.COM " });

    expect(result).toEqual({ administrator: "created", categoriesCreated: 4 });
    expect(transaction.user.create).toHaveBeenCalledTimes(1);
    expect(transaction.user.create).toHaveBeenCalledWith({
      data: {
        email: "owner@example.com",
        displayName: "Demo Owner",
        handle: expect.stringMatching(/^demo-admin-[a-f0-9]{16}$/),
        passwordHash: "scrypt$test-salt$test-derived-key",
        role: "ADMIN",
        status: "ACTIVE"
      },
      select: { id: true }
    });
    expect(hashPassword).toHaveBeenCalledWith(environment.DEMO_ADMIN_PASSWORD);
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: "new-admin-id",
        action: "demo.bootstrap.admin-created",
        entity: "User",
        entityId: "new-admin-id",
        metadata: { source: "demo-bootstrap" }
      }
    });
    expect(JSON.stringify(transaction.auditLog.create.mock.calls)).not.toContain(environment.DEMO_ADMIN_PASSWORD);
    expect(JSON.stringify(transaction.auditLog.create.mock.calls)).not.toContain("scrypt$");
  });

  it("refuses to promote or reset an existing non-admin account with the requested email", async () => {
    transaction.user.findUnique.mockResolvedValue({ id: "existing-buyer-id" });

    await expect(bootstrapDemo(client, environment)).rejects.toThrow("will not promote or reset");
    expect(transaction.user.create).not.toHaveBeenCalled();
    expect(transaction.auditLog.create).not.toHaveBeenCalled();
    expect(transaction.hobbyCategory.createMany).not.toHaveBeenCalled();
    expect(hashPassword).not.toHaveBeenCalled();
  });

  it("preserves an existing administrator without requiring, checking or resetting credentials", async () => {
    transaction.user.findFirst.mockResolvedValue({ id: "existing-admin-id" });
    transaction.hobbyCategory.createMany.mockResolvedValue({ count: 0 });

    const result = await bootstrapDemo(client, { DEPLOYMENT_MODE: "demo" });

    expect(result).toEqual({ administrator: "preserved", categoriesCreated: 0 });
    expect(transaction.user.findFirst).toHaveBeenCalledWith({ where: { role: "ADMIN" }, select: { id: true } });
    expect(transaction.user.findUnique).not.toHaveBeenCalled();
    expect(transaction.user.create).not.toHaveBeenCalled();
    expect(transaction.auditLog.create).not.toHaveBeenCalled();
    expect(hashPassword).not.toHaveBeenCalled();
  });

  it("inserts missing categories without overwriting existing category data", async () => {
    transaction.user.findFirst.mockResolvedValue({ id: "existing-admin-id" });
    transaction.hobbyCategory.createMany.mockResolvedValue({ count: 2 });

    const result = await bootstrapDemo(client, { DEPLOYMENT_MODE: "demo" });

    const [categoryWrite] = transaction.hobbyCategory.createMany.mock.calls[0];
    expect(categoryWrite.skipDuplicates).toBe(true);
    expect(categoryWrite.data.map((category: { slug: string }) => category.slug)).toEqual(["drones", "helis", "planes", "cars"]);
    expect(result.categoriesCreated).toBe(2);
  });

  it("waits for the transaction advisory lock before checking whether an admin exists", async () => {
    let releaseLock!: () => void;
    transaction.$queryRaw.mockImplementation(() => new Promise<void>((resolve) => { releaseLock = resolve; }));

    const result = bootstrapDemo(client, environment);
    expect(transaction.user.findFirst).not.toHaveBeenCalled();
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
    const [query] = transaction.$queryRaw.mock.calls[0];
    expect(query.join("")).toContain("pg_advisory_xact_lock");

    releaseLock();
    await result;
    expect(transaction.user.findFirst).toHaveBeenCalledTimes(1);
  });
});
