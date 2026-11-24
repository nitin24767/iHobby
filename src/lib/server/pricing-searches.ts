import { Prisma, type PricingSearch } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureUserForActor } from "@/lib/server/users";
import type { PricingResearchResult } from "@/lib/ai/pricing-research";
import type { Actor } from "@/types/domain";

const MEMBER_REQUEST_LIMIT = 3;
const REQUEST_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface PricingSearchInput {
  vehicleFamily: string;
  title: string;
  brand: string;
  itemModel: string;
  scale?: string;
  versionModelYear?: string;
  cellCount?: number;
  condition: string;
  targetPriceCents: number;
  currency: string;
}

export interface PricingSearchHistoryItem {
  id: string;
  userName: string;
  userEmail: string;
  vehicleFamily: string;
  title: string;
  brand: string;
  itemModel: string;
  scale: string | null;
  versionModelYear: string | null;
  cellCount: number | null;
  condition: string;
  targetPriceCents: number;
  currency: string;
  status: string;
  provider: string | null;
  recommendedCents: number | null;
  confidence: string | null;
  evidenceCount: number | null;
  createdAt: string;
}

export async function getPricingSearchDashboard(actor: Actor) {
  const user = await ensureUserForActor(actor);
  const isAdmin = actor.role === "ADMIN";
  const windowStart = new Date(Date.now() - REQUEST_WINDOW_MS);
  const [rows, used, earliest] = await Promise.all([
    prisma.pricingSearch.findMany({
      where: isAdmin ? undefined : { userId: user.id },
      include: { user: { select: { displayName: true, email: true } } },
      orderBy: { createdAt: "desc" },
      ...(isAdmin ? {} : { take: 3 })
    }),
    isAdmin ? Promise.resolve(0) : prisma.pricingSearch.count({ where: { userId: user.id, createdAt: { gte: windowStart } } }),
    isAdmin ? Promise.resolve(null) : prisma.pricingSearch.findFirst({
      where: { userId: user.id, createdAt: { gte: windowStart } },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true }
    })
  ]);

  return {
    history: rows.map(mapHistoryRow),
    remainingRequests: isAdmin ? null : Math.max(0, MEMBER_REQUEST_LIMIT - used),
    limit: isAdmin ? null : MEMBER_REQUEST_LIMIT,
    resetAt: earliest ? new Date(earliest.createdAt.getTime() + REQUEST_WINDOW_MS).toISOString() : null,
    adminView: isAdmin
  };
}

export async function reservePricingSearch(actor: Actor, input: PricingSearchInput) {
  const user = await ensureUserForActor(actor);
  const isAdmin = actor.role === "ADMIN";

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const windowStart = new Date(Date.now() - REQUEST_WINDOW_MS);
        if (!isAdmin) {
          const used = await tx.pricingSearch.count({ where: { userId: user.id, createdAt: { gte: windowStart } } });
          if (used >= MEMBER_REQUEST_LIMIT) {
            const earliest = await tx.pricingSearch.findFirst({
              where: { userId: user.id, createdAt: { gte: windowStart } },
              orderBy: { createdAt: "asc" },
              select: { createdAt: true }
            });
            return {
              mode: "limited" as const,
              remainingRequests: 0,
              resetAt: earliest ? new Date(earliest.createdAt.getTime() + REQUEST_WINDOW_MS).toISOString() : null
            };
          }
        }

        const row = await tx.pricingSearch.create({
          data: {
            userId: user.id,
            ...input,
            scale: input.scale || null,
            versionModelYear: input.versionModelYear || null,
            cellCount: input.cellCount ?? null
          }
        });
        const usedAfter = isAdmin ? 0 : await tx.pricingSearch.count({ where: { userId: user.id, createdAt: { gte: windowStart } } });
        const earliest = isAdmin ? null : await tx.pricingSearch.findFirst({
          where: { userId: user.id, createdAt: { gte: windowStart } },
          orderBy: { createdAt: "asc" },
          select: { createdAt: true }
        });
        return {
          mode: "reserved" as const,
          id: row.id,
          userId: user.id,
          remainingRequests: isAdmin ? null : Math.max(0, MEMBER_REQUEST_LIMIT - usedAfter),
          resetAt: earliest ? new Date(earliest.createdAt.getTime() + REQUEST_WINDOW_MS).toISOString() : null
        };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (attempt < 2 && isRetryableTransactionError(error)) continue;
      throw error;
    }
  }

  throw new Error("Unable to reserve pricing request.");
}

export async function completePricingSearch(input: {
  id: string;
  userId: string;
  research: PricingResearchResult;
  estimate: {
    guidance: { conservativeCents: number; recommendedCents: number; buyNowCents: number };
    confidence: string;
    evidenceCount: number;
  };
}) {
  const row = await prisma.pricingSearch.update({
    where: { id: input.id, userId: input.userId },
    data: {
      status: "COMPLETED",
      provider: input.research.provider,
      providerModel: input.research.model,
      summary: input.research.summary,
      conservativeCents: input.estimate.guidance.conservativeCents,
      recommendedCents: input.estimate.guidance.recommendedCents,
      buyNowCents: input.estimate.guidance.buyNowCents,
      confidence: input.estimate.confidence,
      evidenceCount: input.estimate.evidenceCount,
      webComparables: input.research.comparables as unknown as Prisma.InputJsonValue,
      completedAt: new Date()
    },
    include: { user: { select: { displayName: true, email: true } } }
  });
  return mapHistoryRow(row);
}

export async function failPricingSearch(id: string, userId: string) {
  await prisma.pricingSearch.updateMany({
    where: { id, userId },
    data: { status: "FAILED", completedAt: new Date() }
  });
}

function mapHistoryRow(row: PricingSearch & { user: { displayName: string; email: string } }): PricingSearchHistoryItem {
  return {
    id: row.id,
    userName: row.user.displayName,
    userEmail: row.user.email,
    vehicleFamily: row.vehicleFamily,
    title: row.title,
    brand: row.brand,
    itemModel: row.itemModel,
    scale: row.scale,
    versionModelYear: row.versionModelYear,
    cellCount: row.cellCount,
    condition: row.condition,
    targetPriceCents: row.targetPriceCents,
    currency: row.currency,
    status: row.status,
    provider: row.provider,
    recommendedCents: row.recommendedCents,
    confidence: row.confidence,
    evidenceCount: row.evidenceCount,
    createdAt: row.createdAt.toISOString()
  };
}

function isRetryableTransactionError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}
