import { getDatabaseHealth } from "@/lib/server/database-health";

type CheckStatus = "pass" | "warn" | "fail";
type DeploymentMode = "demo" | "production";

export interface ReadinessCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface ReadinessReport {
  deploymentMode: DeploymentMode;
  readyForDemo: boolean;
  readyForNonPaymentLaunch: boolean;
  generatedAt: string;
  checks: ReadinessCheck[];
  blockers: string[];
  warnings: string[];
}

function hasEnv(name: string) {
  return Boolean(process.env[name]?.trim());
}

function hasAllEnv(names: string[]) {
  return names.every(hasEnv);
}

function hasSmtpPassword() {
  return hasEnv("SMTP_PASS") || hasEnv("SMTP_PASSWORD");
}

function productionRequiredCheck(id: string, label: string, configured: boolean, passDetail: string, fallbackDetail: string, required = process.env.NODE_ENV === "production"): ReadinessCheck {
  if (configured) return { id, label, status: "pass", detail: passDetail };
  return {
    id,
    label,
    status: required ? "fail" : "warn",
    detail: fallbackDetail
  };
}

function aiProviderCheck(): ReadinessCheck {
  const provider = process.env.AI_PROVIDER ?? "mock";

  if (provider === "gemini") {
    return hasEnv("GEMINI_API_KEY")
      ? { id: "ai", label: "AI provider", status: "pass", detail: "Gemini is configured; pricing uses Gemini with Groq fallback when available." }
      : { id: "ai", label: "AI provider", status: "warn", detail: "Gemini selected but GEMINI_API_KEY is missing." };
  }

  if (provider === "deepseek") {
    return hasEnv("DEEPSEEK_API_KEY")
      ? { id: "ai", label: "AI provider", status: "pass", detail: "DeepSeek is configured." }
      : { id: "ai", label: "AI provider", status: "warn", detail: "DeepSeek selected but DEEPSEEK_API_KEY is missing." };
  }

  if (provider === "huggingface") {
    return hasEnv("HUGGINGFACE_API_KEY")
      ? { id: "ai", label: "AI provider", status: "pass", detail: "Hugging Face is configured." }
      : { id: "ai", label: "AI provider", status: "warn", detail: "Hugging Face selected but HUGGINGFACE_API_KEY is missing." };
  }

  if (provider === "groq") {
    return hasEnv("GROQ_API_KEY")
      ? { id: "ai", label: "AI provider", status: "pass", detail: "Groq is configured." }
      : { id: "ai", label: "AI provider", status: "warn", detail: "Groq selected but GROQ_API_KEY is missing." };
  }

  if (provider !== "mock") {
    return { id: "ai", label: "AI provider", status: "warn", detail: `Unknown AI_PROVIDER "${provider}" will fall back to mock mode.` };
  }

  return { id: "ai", label: "AI provider", status: "warn", detail: "Mock AI mode is active." };
}

function authCheck(required: boolean): ReadinessCheck {
  const clerkClientConfigured = hasAllEnv(["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY"]);
  if (clerkClientConfigured && hasEnv("CLERK_WEBHOOK_SECRET")) {
    return { id: "auth", label: "Authentication", status: "pass", detail: "Clerk auth is configured." };
  }

  if (clerkClientConfigured) {
    return {
      id: "auth",
      label: "Authentication",
      status: required ? "fail" : "warn",
      detail: "Clerk sign-in is configured but CLERK_WEBHOOK_SECRET is missing."
    };
  }

  if (hasEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY") || hasEnv("CLERK_SECRET_KEY") || hasEnv("CLERK_WEBHOOK_SECRET")) {
    return {
      id: "auth",
      label: "Authentication",
      status: required ? "fail" : "warn",
      detail: "Clerk configuration is incomplete; first-party credential auth remains active."
    };
  }

  return { id: "auth", label: "Authentication", status: "pass", detail: "First-party credential auth with database-backed sessions is active." };
}

export async function getReadinessReport(now = new Date()): Promise<ReadinessReport> {
  // Only an explicit demo opt-in relaxes email readiness. Database, media
  // storage, and complete authentication configuration are still required.
  const deploymentMode: DeploymentMode = process.env.DEPLOYMENT_MODE === "demo" ? "demo" : "production";
  const requireHostedProviders = process.env.NODE_ENV === "production" || deploymentMode === "demo";
  const database = await getDatabaseHealth();
  const auth = authCheck(requireHostedProviders);
  const storage = productionRequiredCheck(
    "storage",
    "Media storage",
    hasAllEnv(["STORAGE_ENDPOINT", "STORAGE_ACCESS_KEY_ID", "STORAGE_SECRET_ACCESS_KEY", "STORAGE_BUCKET", "STORAGE_PUBLIC_URL"]),
    "S3-compatible object storage and a public media URL are configured.",
    "Uploads will use local public/uploads storage. Configure S3-compatible storage and STORAGE_PUBLIC_URL before production.",
    requireHostedProviders
  );
  const smtpConfigured = hasAllEnv(["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_FROM"]) && hasSmtpPassword();
  const email: ReadinessCheck = deploymentMode === "demo" && !smtpConfigured
    ? {
        id: "email",
        label: "Email delivery",
        status: "warn",
        detail: "Email delivery is disabled for this demo. Production launch still requires SMTP."
      }
    : productionRequiredCheck(
        "email",
        "Email delivery",
        smtpConfigured,
        "SMTP delivery is configured.",
        "Email delivery is disabled. Configure SMTP before production."
      );
  const checks: ReadinessCheck[] = [
    database.connected
      ? { id: "database", label: "Database", status: "pass", detail: `PostgreSQL is reachable with ${database.listingCount} listings.` }
      : { id: "database", label: "Database", status: "fail", detail: "PostgreSQL is not reachable; production workflows require the database." },
    auth,
    storage,
    email,
    aiProviderCheck()
  ];

  const blockers = checks.filter((check) => check.status === "fail").map((check) => `${check.label}: ${check.detail}`);
  const warnings = checks.filter((check) => check.status === "warn").map((check) => `${check.label}: ${check.detail}`);
  const coreRequirementsMet = database.connected && auth.status === "pass" && storage.status === "pass";

  return {
    deploymentMode,
    readyForDemo: deploymentMode === "demo" && coreRequirementsMet,
    readyForNonPaymentLaunch: deploymentMode === "production" && coreRequirementsMet && email.status === "pass",
    generatedAt: now.toISOString(),
    checks,
    blockers,
    warnings
  };
}
