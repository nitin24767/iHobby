// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextResponse } from "next/server";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as signIn } from "@/app/api/auth/sign-in/route";
import { POST as logout } from "@/app/api/logout/route";
import { isClerkAuthConfigured } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import {
  deleteLocalSession,
  localSessionCookieName,
  registerBuyerWithPassword,
  signInWithPassword
} from "@/lib/server/local-auth";
import type { LocalAuthResult } from "@/lib/server/local-auth";
import type { Actor } from "@/types/domain";

vi.mock("@/lib/auth", () => ({ isClerkAuthConfigured: vi.fn() }));

vi.mock("@/lib/server/local-auth", () => ({
  localSessionCookieName: "ihw_session",
  registerBuyerWithPassword: vi.fn(),
  signInWithPassword: vi.fn(),
  deleteLocalSession: vi.fn()
}));

vi.mock("@/lib/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rate-limit")>("@/lib/rate-limit");
  return { ...actual, rateLimit: vi.fn() };
});

const credentials = { email: "regression@example.com", password: "TestOnly!Strong7Password" };
const registration = { ...credentials, displayName: "Regression Buyer" };
const sessionToken = "regression-session-token";
const sessionMaxAge = 3600;
const allowedLimit = { allowed: true, remaining: 5, resetAt: 10_000 };
const deniedLimit = { allowed: false, remaining: 0, retryAfterMs: 1501, resetAt: 10_000 };

function successfulAuth(role: Actor["role"] = "BUYER"): LocalAuthResult {
  return {
    mode: "ok",
    actor: {
      id: "regression-user",
      email: credentials.email,
      displayName: "Regression User",
      handle: "regression-user",
      role,
      avatarInitials: "RU",
      isAuthenticated: true,
      authProvider: "local"
    },
    token: sessionToken,
    maxAge: sessionMaxAge
  };
}

function formRequest(endpoint: string, fields: Record<string, string>, accept = "text/html", cookie?: string) {
  return new Request(`https://0.0.0.0:3000${endpoint}`, {
    method: "POST",
    headers: {
      accept,
      host: "attacker.example",
      "x-forwarded-host": "attacker.example",
      "x-forwarded-proto": "http",
      forwarded: "host=attacker.example;proto=http",
      ...(cookie ? { cookie } : {})
    },
    body: new URLSearchParams(fields)
  });
}

function expectRelativeRedirect(response: NextResponse, location: string) {
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(location);
}

function expectClearedCookie(response: NextResponse, name: string) {
  expect(response.cookies.get(name)).toMatchObject({ name, value: "", path: "/", expires: new Date(0) });
}

function expectProductionSession(response: NextResponse) {
  expect(response.cookies.get(localSessionCookieName)).toMatchObject({
    name: localSessionCookieName,
    value: sessionToken,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: sessionMaxAge
  });
  expectClearedCookie(response, "ihw_demo_account");
  expectClearedCookie(response, "ihw_demo_role");
}

const formRoutes = [
  {
    name: "registration",
    handler: register,
    endpoint: "/api/auth/register",
    formPath: "/sign-up",
    fields: registration,
    rateError: "Too many registration attempts. Try again later."
  },
  {
    name: "sign-in",
    handler: signIn,
    endpoint: "/api/auth/sign-in",
    formPath: "/sign-in",
    fields: credentials,
    rateError: "Too many sign-in attempts. Try again later."
  }
];

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NODE_ENV", "production");
  vi.mocked(isClerkAuthConfigured).mockReturnValue(false);
  vi.mocked(rateLimit).mockReturnValue(allowedLimit);
  vi.mocked(registerBuyerWithPassword).mockResolvedValue(successfulAuth());
  vi.mocked(signInWithPassword).mockResolvedValue(successfulAuth());
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("auth redirects behind a reverse proxy", () => {
  it("registers a buyer and redirects on the browser origin with a secure session", async () => {
    const response = await register(formRequest("/api/auth/register", registration));

    expect(registerBuyerWithPassword).toHaveBeenCalledWith(registration);
    expectRelativeRedirect(response, "/dashboard/buyer?status=registered");
    expectProductionSession(response);
  });

  it.each([
    ["BUYER", "/dashboard/buyer"],
    ["SELLER", "/dashboard/seller"],
    ["ADMIN", "/dashboard/admin"]
  ] as const)("signs in a %s on the browser origin with a secure session", async (role, destination) => {
    vi.mocked(signInWithPassword).mockResolvedValue(successfulAuth(role));

    const response = await signIn(formRequest("/api/auth/sign-in", credentials));

    expect(signInWithPassword).toHaveBeenCalledWith(credentials.email, credentials.password);
    expectRelativeRedirect(response, destination);
    expectProductionSession(response);
  });

  it("keeps HTML authentication failures on the browser origin", async () => {
    vi.mocked(signInWithPassword).mockResolvedValue({ mode: "inactive" });
    vi.mocked(registerBuyerWithPassword).mockResolvedValue({ mode: "conflict" });

    const signInResponse = await signIn(formRequest("/api/auth/sign-in", credentials));
    const registrationResponse = await register(formRequest("/api/auth/register", registration));

    expectRelativeRedirect(signInResponse, "/sign-in?status=inactive");
    expectRelativeRedirect(registrationResponse, "/sign-up?status=conflict");
    expect(signInResponse.cookies.get(localSessionCookieName)).toBeUndefined();
    expect(registrationResponse.cookies.get(localSessionCookieName)).toBeUndefined();
  });

  it("revokes the session and clears auth cookies before redirecting logout to the browser origin", async () => {
    const cookie = `other=value; ${localSessionCookieName}=${sessionToken}; ihw_demo_role=BUYER`;
    const response = await logout(formRequest("/api/logout", {}, "text/html", cookie));

    expect(deleteLocalSession).toHaveBeenCalledExactlyOnceWith(sessionToken);
    expectRelativeRedirect(response, "/");
    expectClearedCookie(response, localSessionCookieName);
    expectClearedCookie(response, "ihw_demo_account");
    expectClearedCookie(response, "ihw_demo_role");
  });
});

describe.each(formRoutes)("$name failure responses", ({ handler, endpoint, formPath, fields, rateError }) => {
  it("redirects invalid HTML input without trusting the internal URL or proxy headers", async () => {
    const response = await handler(formRequest(endpoint, {}));

    expectRelativeRedirect(response, `${formPath}?status=invalid`);
    expect(registerBuyerWithPassword).not.toHaveBeenCalled();
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it.each(["client", "account"])("preserves Retry-After on an HTML %s rate-limit redirect", async (scope) => {
    if (scope === "account") vi.mocked(rateLimit).mockReturnValueOnce(allowedLimit);
    vi.mocked(rateLimit).mockReturnValueOnce(deniedLimit);

    const response = await handler(formRequest(endpoint, fields));

    expectRelativeRedirect(response, `${formPath}?status=rate-limited`);
    expect(response.headers.get("retry-after")).toBe("2");
    expect(registerBuyerWithPassword).not.toHaveBeenCalled();
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("preserves the JSON invalid-input response", async () => {
    const response = await handler(formRequest(endpoint, {}, "application/json"));

    expect(response.status).toBe(400);
    expect(response.headers.has("location")).toBe(false);
    await expect(response.json()).resolves.toEqual({ error: "invalid" });
  });

  it("preserves the JSON rate-limit response and Retry-After", async () => {
    vi.mocked(rateLimit).mockReturnValueOnce(deniedLimit);

    const response = await handler(formRequest(endpoint, fields, "application/json"));

    expect(response.status).toBe(429);
    expect(response.headers.has("location")).toBe(false);
    expect(response.headers.get("retry-after")).toBe("2");
    await expect(response.json()).resolves.toEqual({ error: rateError });
  });
});

describe("JSON auth service failures", () => {
  it.each([
    ["invalid", 401],
    ["inactive", 403]
  ] as const)("preserves the %s sign-in response", async (mode, status) => {
    vi.mocked(signInWithPassword).mockResolvedValue({ mode });

    const response = await signIn(formRequest("/api/auth/sign-in", credentials, "application/json"));

    expect(response.status).toBe(status);
    expect(response.headers.has("location")).toBe(false);
    await expect(response.json()).resolves.toEqual({ error: mode });
  });

  it("preserves the registration conflict response", async () => {
    vi.mocked(registerBuyerWithPassword).mockResolvedValue({ mode: "conflict" });

    const response = await register(formRequest("/api/auth/register", registration, "application/json"));

    expect(response.status).toBe(409);
    expect(response.headers.has("location")).toBe(false);
    await expect(response.json()).resolves.toEqual({ error: "conflict" });
  });
});
