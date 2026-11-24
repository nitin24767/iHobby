import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth";
import { runMarketplaceAgent } from "@/lib/ai/agent";
import { rateLimit } from "@/lib/rate-limit";
import { can } from "@/lib/rbac";

const requestSchema = z.object({ goal: z.string().trim().min(8).max(1200) });

export async function POST(request: Request) {
  const actor = await getCurrentActor();
  if (!actor.isAuthenticated || !can(actor.role, "ai:use")) {
    return NextResponse.json({ error: "Agent access requires an authenticated member account." }, { status: 403 });
  }

  const limited = rateLimit(`ai-agent:${actor.id}`, 6, 60_000);
  if (!limited.allowed) {
    return NextResponse.json({ error: "Agent rate limit exceeded. Try again shortly." }, { status: 429 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Describe a goal using between 8 and 1200 characters." }, { status: 400 });
  }

  try {
    return NextResponse.json(await runMarketplaceAgent(actor, parsed.data.goal));
  } catch (error) {
    console.error("[ai:agent] Agent run failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "The agent could not complete this run." }, { status: 502 });
  }
}
