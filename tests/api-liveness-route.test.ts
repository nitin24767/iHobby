import { describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/health/route";
import { getDatabaseHealth } from "@/lib/server/database-health";
import { getReadinessReport } from "@/lib/server/readiness";
import { getCurrentActor } from "@/lib/auth";

vi.mock("@/lib/server/database-health", () => ({
  getDatabaseHealth: vi.fn(() => { throw new Error("Database is unavailable"); })
}));

vi.mock("@/lib/server/readiness", () => ({
  getReadinessReport: vi.fn(() => { throw new Error("Providers are not configured"); })
}));

vi.mock("@/lib/auth", () => ({
  getCurrentActor: vi.fn(() => { throw new Error("There is no authenticated session"); })
}));

describe("public liveness API route", () => {
  it("responds without accessing authentication, the database, or readiness providers", async () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ status: "ok" });
    expect(getCurrentActor).not.toHaveBeenCalled();
    expect(getDatabaseHealth).not.toHaveBeenCalled();
    expect(getReadinessReport).not.toHaveBeenCalled();
  });
});
