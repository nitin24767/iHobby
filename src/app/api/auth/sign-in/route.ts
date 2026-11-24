import { NextResponse } from "next/server";
import { z } from "zod";
import { isClerkAuthConfigured } from "@/lib/auth";
import { defaultDashboardFor } from "@/lib/rbac";
import { clientRateLimitKey, rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { localSessionCookieName, signInWithPassword } from "@/lib/server/local-auth";
import { redirectToPath } from "@/lib/server/redirect";

const signInSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1)
});

export async function POST(request: Request) {
  if (isClerkAuthConfigured()) {
    return NextResponse.json({ error: "Password sign-in is disabled when Clerk is configured." }, { status: 403 });
  }

  const clientLimit = rateLimit(clientRateLimitKey(request, "auth:sign-in"), 50, 15 * 60_000);
  if (!clientLimit.allowed) return rateLimitedResponse(request, clientLimit);

  const formData = await request.formData().catch(() => null);
  const parsed = signInSchema.safeParse({
    email: formData?.get("email"),
    password: formData?.get("password")
  });
  if (!parsed.success) return invalidResponse(request, "invalid", 400);

  const accountLimit = rateLimit(`auth:sign-in:email:${parsed.data.email.toLowerCase()}`, 10, 15 * 60_000);
  if (!accountLimit.allowed) return rateLimitedResponse(request, accountLimit);

  const result = await signInWithPassword(parsed.data.email, parsed.data.password);
  if (result.mode !== "ok") {
    return invalidResponse(request, result.mode, result.mode === "inactive" ? 403 : 401);
  }

  const response = redirectToPath(defaultDashboardFor(result.actor.role));
  response.cookies.set(localSessionCookieName, result.token, sessionCookieOptions(result.maxAge));
  response.cookies.delete("ihw_demo_account");
  response.cookies.delete("ihw_demo_role");
  return response;
}

function rateLimitedResponse(request: Request, result: ReturnType<typeof rateLimit>) {
  const headers = { "Retry-After": String(retryAfterSeconds(result)) };
  if (request.headers.get("accept")?.includes("text/html")) {
    return redirectToPath("/sign-in?status=rate-limited", headers);
  }
  return NextResponse.json({ error: "Too many sign-in attempts. Try again later." }, { status: 429, headers });
}

function invalidResponse(request: Request, status: string, code: 400 | 401 | 403) {
  if (request.headers.get("accept")?.includes("text/html")) {
    return redirectToPath(`/sign-in?status=${status}`);
  }

  return NextResponse.json({ error: status }, { status: code });
}

function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge
  };
}
