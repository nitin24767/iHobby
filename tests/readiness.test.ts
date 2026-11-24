import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getReadinessReport } from "@/lib/server/readiness";
import { getDatabaseHealth } from "@/lib/server/database-health";

vi.mock("@/lib/server/database-health", () => ({
  getDatabaseHealth: vi.fn()
}));

const envKeys = [
  "DEPLOYMENT_MODE",
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
  "SMTP_PASSWORD",
  "SMTP_FROM",
  "AI_PROVIDER",
  "GEMINI_API_KEY",
  "GROQ_API_KEY",
  "DEEPSEEK_API_KEY",
  "HUGGINGFACE_API_KEY"
] as const;

function configureStorage() {
  vi.stubEnv("STORAGE_ENDPOINT", "https://r2.example.com");
  vi.stubEnv("STORAGE_ACCESS_KEY_ID", "access");
  vi.stubEnv("STORAGE_SECRET_ACCESS_KEY", "secret");
  vi.stubEnv("STORAGE_BUCKET", "ihobbyworld");
  vi.stubEnv("STORAGE_PUBLIC_URL", "https://cdn.example.com/ihobbyworld");
}

function configureSmtp() {
  vi.stubEnv("SMTP_HOST", "smtp.example.com");
  vi.stubEnv("SMTP_PORT", "587");
  vi.stubEnv("SMTP_USER", "mailer");
  vi.stubEnv("SMTP_PASS", "password");
  vi.stubEnv("SMTP_FROM", "noreply@example.com");
}

describe("readiness report", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "test");
    for (const key of envKeys) vi.stubEnv(key, undefined);
    vi.mocked(getDatabaseHealth).mockResolvedValue({
      connected: true,
      label: "DB live",
      listingCount: 9
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("passes non-payment production readiness with database plus configured providers", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test");
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test");
    vi.stubEnv("CLERK_WEBHOOK_SECRET", "whsec_test");
    configureStorage();
    configureSmtp();
    vi.stubEnv("AI_PROVIDER", "deepseek");
    vi.stubEnv("DEEPSEEK_API_KEY", "deepseek-key");

    const report = await getReadinessReport(new Date("2026-07-03T12:00:00.000Z"));

    expect(report.deploymentMode).toBe("production");
    expect(report.readyForDemo).toBe(false);
    expect(report.readyForNonPaymentLaunch).toBe(true);
    expect(report.blockers).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(report.checks.map((check) => check.status)).toEqual(["pass", "pass", "pass", "pass", "pass"]);
  });

  it("allows local development fallbacks without claiming production readiness", async () => {
    const report = await getReadinessReport();

    expect(report.readyForDemo).toBe(false);
    expect(report.readyForNonPaymentLaunch).toBe(false);
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
    vi.stubEnv("AI_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "gemini-key");

    const report = await getReadinessReport(new Date("2026-09-23T00:00:00.000Z"));

    expect(report.checks.find((check) => check.id === "ai")).toMatchObject({
      status: "pass",
      detail: expect.stringContaining("pricing uses Gemini with Groq fallback")
    });
  });

  it("fails production readiness when PostgreSQL is unavailable", async () => {
    vi.stubEnv("NODE_ENV", "production");
    configureStorage();
    configureSmtp();
    vi.mocked(getDatabaseHealth).mockResolvedValue({
      connected: false,
      label: "DB offline",
      listingCount: 0
    });

    const report = await getReadinessReport();

    expect(report.readyForNonPaymentLaunch).toBe(false);
    expect(report.blockers).toEqual([
      "Database: PostgreSQL is not reachable; production workflows require the database."
    ]);
  });

  it("keeps missing SMTP a blocker for production by default", async () => {
    vi.stubEnv("NODE_ENV", "production");
    configureStorage();

    const report = await getReadinessReport();

    expect(report.deploymentMode).toBe("production");
    expect(report.readyForNonPaymentLaunch).toBe(false);
    expect(report.checks.find((check) => check.id === "email")?.status).toBe("fail");
    expect(report.blockers).toContain("Email delivery: Email delivery is disabled. Configure SMTP before production.");
  });

  it("allows an explicit demo without SMTP while keeping production readiness false", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEPLOYMENT_MODE", "demo");
    configureStorage();

    const report = await getReadinessReport();

    expect(report.deploymentMode).toBe("demo");
    expect(report.readyForDemo).toBe(true);
    expect(report.readyForNonPaymentLaunch).toBe(false);
    expect(report.blockers).toEqual([]);
    expect(report.checks.find((check) => check.id === "email")).toMatchObject({
      status: "warn",
      detail: "Email delivery is disabled for this demo. Production launch still requires SMTP."
    });
  });

  it("does not relax object storage requirements for a demo", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "demo");

    const report = await getReadinessReport();

    expect(report.readyForDemo).toBe(false);
    expect(report.readyForNonPaymentLaunch).toBe(false);
    expect(report.checks.find((check) => check.id === "storage")?.status).toBe("fail");
  });

  it("does not declare a demo ready without a database", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "demo");
    configureStorage();
    vi.mocked(getDatabaseHealth).mockResolvedValue({
      connected: false,
      label: "DB offline",
      listingCount: 0
    });

    const report = await getReadinessReport();

    expect(report.readyForDemo).toBe(false);
    expect(report.readyForNonPaymentLaunch).toBe(false);
    expect(report.checks.find((check) => check.id === "database")?.status).toBe("fail");
  });

  it.each([false, true])("rejects incomplete Clerk configuration in a demo (secret configured: %s)", async (hasSecret) => {
    vi.stubEnv("DEPLOYMENT_MODE", "demo");
    configureStorage();
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test");
    if (hasSecret) vi.stubEnv("CLERK_SECRET_KEY", "sk_test");

    const report = await getReadinessReport();

    expect(report.readyForDemo).toBe(false);
    expect(report.checks.find((check) => check.id === "auth")?.status).toBe("fail");
  });

  it("keeps a fully configured demo distinct from a production launch", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "demo");
    configureStorage();
    configureSmtp();

    const report = await getReadinessReport();

    expect(report.readyForDemo).toBe(true);
    expect(report.readyForNonPaymentLaunch).toBe(false);
  });

  it("does not relax production checks for an unrecognized deployment mode", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEPLOYMENT_MODE", "preview");
    configureStorage();

    const report = await getReadinessReport();

    expect(report.deploymentMode).toBe("production");
    expect(report.readyForDemo).toBe(false);
    expect(report.readyForNonPaymentLaunch).toBe(false);
    expect(report.checks.find((check) => check.id === "email")?.status).toBe("fail");
  });
});
