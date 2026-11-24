import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/admin/bulk-upload/route";
import { getCurrentActor } from "@/lib/auth";
import { resetRateLimitsForTests } from "@/lib/rate-limit";

vi.mock("@/lib/auth", () => ({ getCurrentActor: vi.fn() }));

describe("admin bulk upload route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitsForTests();
  });

  it("rejects non-admin actors before reading an upload", async () => {
    vi.mocked(getCurrentActor).mockResolvedValue({ id: "buyer", role: "BUYER" } as never);
    const response = await POST(new Request("http://localhost/api/admin/bulk-upload", { method: "POST" }));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Bulk upload is restricted to administrators." });
  });

  it("requires multipart uploads from admins", async () => {
    vi.mocked(getCurrentActor).mockResolvedValue({ id: "admin", role: "ADMIN" } as never);
    const response = await POST(new Request("http://localhost/api/admin/bulk-upload", { method: "POST" }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Expected a multipart file upload." });
  });
});
