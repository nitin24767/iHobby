import { beforeEach, describe, expect, it, vi } from "vitest";
import { getReadinessReport } from "@/lib/server/readiness";
import { getDatabaseHealth } from "@/lib/server/database-health";

vi.mock("@/lib/server/database-health", () => ({
  getDatabaseHealth: vi.fn()
}));

const envKeys = [
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "CLERK_WEBHOOK_SECRET",
  "STORAGE_ENDPOINT",
  "STORAGE_ACCESS_KEY_ID",
  "STORAGE_SECRET_ACCESS_KEY",
  "STORAGE_BUCKET",
  "STORAGE_PUBLIC_URL",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
  "AI_PROVIDER",
  "GEMINI_API_KEY",
  "GROQ_API_KEY",
  "DEEPSEEK_API_KEY",
  "HUGGINGFACE_API_KEY"
] as const;

const originalEnv = Object.fromEntries(
  envKeys.map((key) => [key, process.env[key]])
) as Record<(typeof envKeys)[number], string | undefined>;

describe("readiness report", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of envKeys) {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    }
  });

  it("passes non-payment readiness with database plus configured providers", async () => {
    vi.mocked(getDatabaseHealth).mockResolvedValue({
      connected: true,
      label: "DB live",
      listingCount: 9
    });
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test";
    process.env.CLERK_SECRET_KEY = "sk_test";
    process.env.CLERK_WEBHOOK_SECRET = "whsec_test";
    process.env.STORAGE_ENDPOINT = "https://r2.example.com";
    process.env.STORAGE_ACCESS_KEY_ID = "access";
    process.env.STORAGE_SECRET_ACCESS_KEY = "secret";
    process.env.STORAGE_BUCKET = "ihobbyworld";
    process.env.STORAGE_PUBLIC_URL = "https://cdn.example.com/ihobbyworld";
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_USER = "mailer";
    process.env.SMTP_PASS = "password";
    process.env.SMTP_FROM = "noreply@example.com";
    process.env.AI_PROVIDER = "deepseek";
    process.env.DEEPSEEK_API_KEY = "deepseek-key";

    const report = await getReadinessReport(new Date("2026-07-03T12:00:00.000Z"));

    expect(report.readyForNonPaymentLaunch).toBe(true);
    expect(report.blockers).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(report.checks.map((check) => check.status)).toEqual(["pass", "pass", "pass", "pass", "pass"]);
  });

  it("passes first-party credential auth and keeps optional providers as warnings when database is live", async () => {
    vi.mocked(getDatabaseHealth).mockResolvedValue({
      connected: true,
      label: "DB live",
      listingCount: 9
    });

    const report = await getReadinessReport(new Date("2026-07-03T12:00:00.000Z"));

    expect(report.readyForNonPaymentLaunch).toBe(true);
    expect(report.blockers).toEqual([]);
    expect(report.checks.find((check) => check.id === "auth")).toMatchObject({
      status: "pass",
      detail: "First-party credential auth with database-backed sessions is active."
    });
    expect(report.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining("Media storage"),
      expect.stringContaining("Email delivery"),
      expect.stringContaining("AI provider")
    ]));
  });

  it("recognizes Gemini as a configured AI provider", async () => {
    vi.mocked(getDatabaseHealth).mockResolvedValue({ connected: true, label: "DB live", listingCount: 9 });
    process.env.AI_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "gemini-key";

    const report = await getReadinessReport(new Date("2026-09-23T00:00:00.000Z"));

    expect(report.checks.find((check) => check.id === "ai")).toMatchObject({
      status: "pass",
      detail: expect.stringContaining("pricing uses Gemini with Groq fallback")
    });
  });

  it("fails readiness when PostgreSQL is unavailable", async () => {
    vi.mocked(getDatabaseHealth).mockResolvedValue({
      connected: false,
      label: "DB offline",
      listingCount: 0
    });

    const report = await getReadinessReport(new Date("2026-07-03T12:00:00.000Z"));

    expect(report.readyForNonPaymentLaunch).toBe(false);
    expect(report.blockers).toEqual([
      "Database: PostgreSQL is not reachable; production workflows require the database."
    ]);
  });
});
