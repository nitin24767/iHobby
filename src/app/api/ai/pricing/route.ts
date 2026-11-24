import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth";
import { buildEvidenceBasedGuidance, researchCurrentMarketPricing } from "@/lib/ai/pricing-research";
import { rateLimit } from "@/lib/rate-limit";
import { can } from "@/lib/rbac";
import { getApplicationCurrency } from "@/lib/server/application-settings";
import { getPricingGuidanceForInput } from "@/lib/server/marketplace";
import { completePricingSearch, failPricingSearch, reservePricingSearch } from "@/lib/server/pricing-searches";

const pricingConditions = [
  "New",
  "Used - Excellent condition",
  "Used - Good condition",
  "Used - Average condition",
  "Used - Bad condition"
] as const;

const requestSchema = z.object({
  title: z.string().min(1).max(140),
  category: z.string().min(1).max(80),
  condition: z.enum(pricingConditions),
  targetPriceCents: z.number().int().positive(),
  attributes: z.object({
    brand: z.string().trim().min(1).max(80),
    model: z.string().trim().min(1).max(100),
    scale: z.string().trim().max(30).optional(),
    versionModelYear: z.string().trim().max(40).optional(),
    cellCount: z.number().int().min(1).max(16).optional()
  })
});

export async function POST(request: Request) {
  const actor = await getCurrentActor();
  if (!can(actor.role, "ai:use")) {
    return NextResponse.json({ error: "AI access requires a member role." }, { status: 403 });
  }

  if (actor.role !== "ADMIN") {
    const limited = rateLimit(`ai-pricing:${actor.id}`, 6, 60_000);
    if (!limited.allowed) {
      return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
    }
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request.", details: parsed.error.flatten() }, { status: 400 });
  }

  let reservation: Awaited<ReturnType<typeof reservePricingSearch>> | null = null;
  try {
    const currency = await getApplicationCurrency();
    reservation = await reservePricingSearch(actor, {
      vehicleFamily: parsed.data.category,
      title: parsed.data.title,
      brand: parsed.data.attributes.brand,
      itemModel: parsed.data.attributes.model,
      scale: parsed.data.attributes.scale,
      versionModelYear: parsed.data.attributes.versionModelYear,
      cellCount: parsed.data.attributes.cellCount,
      condition: parsed.data.condition,
      targetPriceCents: parsed.data.targetPriceCents,
      currency
    });
    if (reservation.mode === "limited") {
      return NextResponse.json({
        error: "You have used all 3 pricing requests for the current 24-hour period.",
        remainingRequests: 0,
        resetAt: reservation.resetAt
      }, { status: 429 });
    }
    const [market, research] = await Promise.all([
      getPricingGuidanceForInput(
        parsed.data.category,
        parsed.data.targetPriceCents,
        parsed.data.title,
        parsed.data.condition
      ),
      researchCurrentMarketPricing({
        title: parsed.data.title,
        category: parsed.data.category,
        condition: parsed.data.condition,
        currency,
        attributes: parsed.data.attributes
      })
    ]);
    const estimate = buildEvidenceBasedGuidance({
      internalPrices: market.comparableSales.map((sale) => sale.soldPriceCents),
      webComparables: research.comparables,
      targetPriceCents: parsed.data.targetPriceCents,
      currency,
      condition: parsed.data.condition
    });
    const search = await completePricingSearch({
      id: reservation.id,
      userId: reservation.userId,
      research,
      estimate
    });

    return NextResponse.json({
      provider: research.provider,
      model: research.model,
      text: `${research.summary}\n\n${estimate.note}`,
      comparableSales: market.comparableSales,
      webComparables: research.comparables,
      guidance: estimate.guidance,
      note: estimate.note,
      confidence: estimate.confidence,
      evidenceCount: estimate.evidenceCount,
      researchedAt: research.researchedAt,
      webSearchUsed: research.webSearchUsed,
      search,
      remainingRequests: reservation.remainingRequests,
      resetAt: reservation.resetAt
    });
  } catch (error) {
    if (reservation?.mode === "reserved") {
      await failPricingSearch(reservation.id, reservation.userId).catch(() => undefined);
    }
    console.error("[ai:pricing] Provider request failed:", error);
    return NextResponse.json({ error: "AI assistant is temporarily unavailable." }, { status: 502 });
  }
}
