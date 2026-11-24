import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/health/readiness/route";
import { getCurrentActor } from "@/lib/auth";
import { getReadinessReport } from "@/lib/server/readiness";
import type { Actor } from "@/types/domain";

vi.mock("@/lib/auth", () => ({
  getCurrentActor: vi.fn()
}));

vi.mock("@/lib/server/readiness", () => ({
  getReadinessReport: vi.fn()
}));

const adminActor: Actor = {
  id: "demo-admin",
  email: "admin@ihobbyworld.local",
  displayName: "Admin Team",
  handle: "admin",
  role: "ADMIN",
  avatarInitials: "AD",
  isAuthenticated: true,
  authProvider: "demo"
};

const buyerActor: Actor = {
  id: "demo-buyer",
  email: "buyer@ihobbyworld.local",
  displayName: "Buyer",
  handle: "buyer",
  role: "BUYER",
  avatarInitials: "BU",
  isAuthenticated: true,
  authProvider: "demo"
};

describe("readiness health API route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires admin access", async () => {
    vi.mocked(getCurrentActor).mockResolvedValue(buyerActor);

    const response = await GET();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Admin access required." });
    expect(getReadinessReport).not.toHaveBeenCalled();
  });

  it("returns the readiness report for admins", async () => {
    vi.mocked(getCurrentActor).mockResolvedValue(adminActor);
    vi.mocked(getReadinessReport).mockResolvedValue({
      deploymentMode: "production",
      readyForDemo: false,
      readyForNonPaymentLaunch: true,
      generatedAt: "2026-07-03T12:00:00.000Z",
      checks: [],
      blockers: [],
      warnings: []
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      deploymentMode: "production",
      readyForDemo: false,
      readyForNonPaymentLaunch: true,
      generatedAt: "2026-07-03T12:00:00.000Z",
      checks: [],
      blockers: [],
      warnings: []
    });
  });

  it("returns service unavailable when readiness has blockers", async () => {
    vi.mocked(getCurrentActor).mockResolvedValue(adminActor);
    vi.mocked(getReadinessReport).mockResolvedValue({
      deploymentMode: "production",
      readyForDemo: false,
      readyForNonPaymentLaunch: false,
      generatedAt: "2026-07-03T12:00:00.000Z",
      checks: [],
      blockers: ["Database unavailable"],
      warnings: []
    });

    const response = await GET();

    expect(response.status).toBe(503);
  });

  it("returns demo readiness without claiming production launch readiness", async () => {
    vi.mocked(getCurrentActor).mockResolvedValue(adminActor);
    vi.mocked(getReadinessReport).mockResolvedValue({
      deploymentMode: "demo",
      readyForDemo: true,
      readyForNonPaymentLaunch: false,
      generatedAt: "2026-07-03T12:00:00.000Z",
      checks: [],
      blockers: [],
      warnings: ["Email delivery is disabled for this demo."]
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      deploymentMode: "demo",
      readyForDemo: true,
      readyForNonPaymentLaunch: false
    });
  });

  it("returns service unavailable for a demo with unmet core requirements", async () => {
    vi.mocked(getCurrentActor).mockResolvedValue(adminActor);
    vi.mocked(getReadinessReport).mockResolvedValue({
      deploymentMode: "demo",
      readyForDemo: false,
      readyForNonPaymentLaunch: false,
      generatedAt: "2026-07-03T12:00:00.000Z",
      checks: [],
      blockers: ["Media storage is not configured"],
      warnings: []
    });

    const response = await GET();

    expect(response.status).toBe(503);
  });
});
