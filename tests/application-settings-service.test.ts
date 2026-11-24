import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { getApplicationCurrency, setApplicationCurrency } from "@/lib/server/application-settings";
import type { Actor } from "@/types/domain";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
    applicationSetting: { findUnique: vi.fn() }
  }
}));

vi.mock("@/lib/server/users", () => ({
  ensureUserForActor: vi.fn(async () => ({ id: "admin-db" }))
}));

const admin = {
  id: "admin",
  role: "ADMIN",
  email: "admin@example.com",
  displayName: "Admin",
  handle: "admin",
  avatarInitials: "AD",
  isAuthenticated: true,
  authProvider: "demo"
} as Actor;

describe("application currency settings service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.APP_CURRENCY;
  });

  it("loads the persisted currency", async () => {
    vi.mocked(prisma.applicationSetting.findUnique).mockResolvedValue({
      key: "application.currency",
      value: "INR",
      updatedAt: new Date()
    });
    await expect(getApplicationCurrency()).resolves.toBe("INR");
  });

  it("falls back safely when the settings table is unavailable", async () => {
    process.env.APP_CURRENCY = "GBP";
    vi.mocked(prisma.applicationSetting.findUnique).mockRejectedValue(new Error("database unavailable"));
    await expect(getApplicationCurrency()).resolves.toBe("GBP");
  });

  it("restricts updates to admins and supported values", async () => {
    await expect(setApplicationCurrency({ ...admin, role: "SELLER" }, "INR")).resolves.toEqual({ mode: "forbidden" });
    await expect(setApplicationCurrency(admin, "JPY")).resolves.toEqual({ mode: "invalid" });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("updates the setting, listings, and audit log atomically", async () => {
    vi.mocked(prisma.applicationSetting.findUnique).mockResolvedValue({
      key: "application.currency",
      value: "USD",
      updatedAt: new Date()
    });
    const tx = {
      applicationSetting: { upsert: vi.fn().mockResolvedValue({}) },
      listing: { updateMany: vi.fn().mockResolvedValue({ count: 4 }) },
      auditLog: { create: vi.fn().mockResolvedValue({}) }
    };
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx as never));

    await expect(setApplicationCurrency(admin, "INR")).resolves.toEqual({
      mode: "updated",
      currency: "INR",
      previous: "USD"
    });
    expect(tx.applicationSetting.upsert).toHaveBeenCalledWith({
      where: { key: "application.currency" },
      create: { key: "application.currency", value: "INR" },
      update: { value: "INR" }
    });
    expect(tx.listing.updateMany).toHaveBeenCalledWith({ data: { currency: "INR" } });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "application.currency_changed",
        metadata: { previous: "USD", currency: "INR", valuesConverted: false }
      })
    });
  });
});
