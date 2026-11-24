import { NextResponse } from "next/server";
import { z } from "zod";
import { isClerkAuthConfigured } from "@/lib/auth";
import { clientRateLimitKey, rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { localSessionCookieName, registerBuyerWithPassword } from "@/lib/server/local-auth";
import { redirectToPath } from "@/lib/server/redirect";

const registerSchema = z.object({
  displayName: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(120),
  password: z
    .string()
    .min(12, "Password must be at least 12 characters")
    .max(128)
    .regex(/[a-z]/, "Password must include a lowercase letter")
    .regex(/[A-Z]/, "Password must include an uppercase letter")
    .regex(/\d/, "Password must include a number")
});

export async function POST(request: Request) {
  if (isClerkAuthConfigured()) {
    return NextResponse.json({ error: "Password registration is disabled when Clerk is configured." }, { status: 403 });
  }

  const clientLimit = rateLimit(clientRateLimitKey(request, "auth:register"), 10, 60 * 60_000);
  if (!clientLimit.allowed) return rateLimitedResponse(request, clientLimit);

  const formData = await request.formData().catch(() => null);
  const parsed = registerSchema.safeParse({
    displayName: formData?.get("displayName"),
    email: formData?.get("email"),
    password: formData?.get("password")
  });
  if (!parsed.success) return invalidResponse(request, "invalid", 400);

  const accountLimit = rateLimit(`auth:register:email:${parsed.data.email.toLowerCase()}`, 3, 60 * 60_000);
  if (!accountLimit.allowed) return rateLimitedResponse(request, accountLimit);

  const result = await registerBuyerWithPassword(parsed.data);
  if (result.mode !== "ok") {
    return invalidResponse(request, result.mode, result.mode === "conflict" ? 409 : 400);
  }

  const response = redirectToPath("/dashboard/buyer?status=registered");
  response.cookies.set(localSessionCookieName, result.token, sessionCookieOptions(result.maxAge));
  response.cookies.delete("ihw_demo_account");
  response.cookies.delete("ihw_demo_role");
  return response;
}

function rateLimitedResponse(request: Request, result: ReturnType<typeof rateLimit>) {
  const headers = { "Retry-After": String(retryAfterSeconds(result)) };
  if (request.headers.get("accept")?.includes("text/html")) {
    return redirectToPath("/sign-up?status=rate-limited", headers);
  }
  return NextResponse.json({ error: "Too many registration attempts. Try again later." }, { status: 429, headers });
}

function invalidResponse(request: Request, status: string, code: 400 | 409) {
  if (request.headers.get("accept")?.includes("text/html")) {
    return redirectToPath(`/sign-up?status=${status}`);
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
