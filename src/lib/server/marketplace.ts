import {
  BidStatus,
  ListingStatus,
  ListingType,
  OfferStatus,
  Prisma
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import {
  bids as fallbackBids,
  categories as fallbackCategories,
  componentListings as fallbackComponents,
  conversations as fallbackConversations,
  getDashboardMetrics as fallbackDashboardMetrics,
  listings as fallbackListings,
  offers as fallbackOffers,
  rcScope,
  reports as fallbackReports
} from "@/lib/data";
import { formatMoney } from "@/lib/money";
import { DEFAULT_APPLICATION_CURRENCY } from "@/lib/currency";
import { completeAiText } from "@/lib/ai/providers";
import { normalizeStoredMediaUrl } from "@/lib/storage";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { canMakeOffer, canPlaceBid } from "@/lib/transactions";
import { validateListingDraft, type ListingDraftInput } from "@/lib/validations/listing";
import { ensureUserForActor, syncClerkRole, syncClerkStatus } from "@/lib/server/users";
import { createNotification } from "@/lib/server/notifications";
import { getApplicationCurrency } from "@/lib/server/application-settings";
import { awardReward } from "@/lib/server/rewards";
import { escapeHtml, sendEmail } from "@/lib/email";
import type {
  Actor,
  Bid,
  Category,
  ConversationMessage,
  ConversationSummary,
  DashboardMetric,
  Listing,
  Offer,
  Report,
  Role
} from "@/types/domain";

const listingInclude = {
  seller: true,
  category: true,
  media: { orderBy: { sortOrder: "asc" } },
  _count: { select: { bids: true, offers: true, watchlists: true } }
} satisfies Prisma.ListingInclude;

type ListingRow = Prisma.ListingGetPayload<{ include: typeof listingInclude }>;

const offerListInclude = {
  buyer: { select: { displayName: true } },
  listing: {
    select: {
      id: true,
      slug: true,
      title: true,
      sellerId: true,
      seller: { select: { displayName: true } }
    }
  }
} satisfies Prisma.OfferInclude;

const offerActionInclude = {
  buyer: { select: { id: true, email: true, displayName: true } },
  listing: {
    select: {
      id: true,
      slug: true,
      title: true,
      sellerId: true,
      status: true,
      seller: { select: { email: true, displayName: true } }
    }
  }
} satisfies Prisma.OfferInclude;

type OfferActionRow = Prisma.OfferGetPayload<{ include: typeof offerActionInclude }>;

const buildConfigurationInclude = {
  parts: { orderBy: { sortOrder: "asc" } }
} satisfies Prisma.BuildConfigurationInclude;

type BuildConfigurationRow = Prisma.BuildConfigurationGetPayload<{ include: typeof buildConfigurationInclude }>;

async function serializableTransaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
      });
    } catch (error) {
      if (!isSerializationFailure(error) || attempt === 2) throw error;
    }
  }

  throw new Error("Serializable transaction could not be completed.");
}

function isSerializationFailure(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2034";
}

export interface MarketplaceSearchParams {
  query?: string;
  category?: string;
  sort?: "ending-soon" | "price-asc" | "price-desc" | "newest";
  condition?: string;
  minPrice?: number;
  maxPrice?: number;
}

export interface ComponentListing {
  id: string;
  slug: string;
  title: string;
  vt: string;
  ct: string;
  condition: string;
  priceCents: number;
  location: string;
  stock: number;
  media: string;
}

export type RcScopeWithCounts = typeof rcScope;

export interface RcScopeCountRow {
  categorySlug: string;
  attributes: Record<string, string | number | boolean>;
}

export interface NavigationCounts {
  watchlist: number;
  activeBids: number;
  pendingOffers: number;
  messages: number;
  sellerListings: number;
  pendingListings: number;
  openReports: number;
  sellerApplications: number;
}

const emptyNavigationCounts: NavigationCounts = {
  watchlist: 0,
  activeBids: 0,
  pendingOffers: 0,
  messages: 0,
  sellerListings: 0,
  pendingListings: 0,
  openReports: 0,
  sellerApplications: 0
};

type LedgerKind = "CREDIT" | "DEBIT" | "HOLD" | "RELEASE" | "PAYOUT";
type LedgerStatus = "PENDING" | "POSTED" | "VOIDED";

export interface CreditLedgerSummaryRow {
  id: string;
  amount: number;
  kind: LedgerKind;
  status: LedgerStatus;
  reason: string;
  createdAt: Date;
}

export interface WalletLedgerItem {
  id: string;
  label: string;
  amountCredits: number;
  amountLabel: string;
  at: string;
  tone: "good" | "warn" | "bad" | "neutral";
  statusLabel: string;
}

export interface WalletSummary {
  title: string;
  balanceCredits: number;
  bidHoldsCredits: number;
  boostBudgetCredits: number;
  rewardTier: string;
  transactions: WalletLedgerItem[];
}

export interface WalletLedgerExportRow {
  id: string;
  amount: number;
  kind: LedgerKind;
  status: LedgerStatus;
  reason: string;
  createdAt: Date;
}

export interface LoyaltyActivityItem {
  id: string;
  reason: string;
  points: number;
  pointsLabel: string;
  at: string;
}

export interface LoyaltySummary {
  points: number;
  tier: string;
  nextTier: { name: string; points: number } | null;
  progress: number;
  activities: LoyaltyActivityItem[];
}

export interface BuildPartView {
  slot: string;
  selected: string;
  status: string;
  active: boolean;
}

export interface BuildWorkshopData {
  title: string;
  vehicleType: string;
  dryWeightGrams: number;
  estimatedCostCents: number;
  thrustRatio: string;
  riskLevel: string;
  note: string;
  parts: BuildPartView[];
}

export interface BuildWorkshopInput {
  title: string;
  vehicleType: string;
  dryWeightGrams: number;
  estimatedCostCents: number;
  thrustRatio: string;
  note?: string;
  parts: string;
}

export interface RepairSessionInput {
  title: string;
  vehicleType: string;
  issueNotes: string;
}

export interface SellerListingUpdateInput {
  title: string;
  description: string;
  condition: string;
  priceCents: number;
  location: string;
}

export interface RepairSessionView {
  id: string;
  title: string;
  vehicleType: string;
  lastSummary: string;
  issueNotes: string;
  advisorNote: string;
  checklist: string[];
  status: string;
  when: string;
  active: boolean;
}

export interface RepairAdvisorData {
  sessions: RepairSessionView[];
  activeSession: RepairSessionView | null;
}

export interface PricingComparableView {
  id: string;
  title: string;
  condition: string;
  soldPriceCents: number;
  soldAt: string;
}

export interface PricingGuidance {
  conservativeCents: number;
  recommendedCents: number;
  buyNowCents: number;
}

export interface PricingEngineData {
  vehicleTypes: Array<{ id: string; name: string; count: number }>;
  selectedVehicleFamily: string;
  listingTitle: string;
  listingCondition: string;
  brand: string;
  model: string;
  scale: string;
  versionModelYear: string;
  batteryCells: number;
  currentPriceCents: number;
  comparableSales: PricingComparableView[];
  guidance: PricingGuidance;
  note: string;
}

export interface SellerReviewEligibility {
  canReview: boolean;
  alreadyReviewed: boolean;
  sellerName: string;
}

export interface ConversationSummaryRow {
  id: string;
  listingId: string | null;
  subject: string;
  updatedAt: Date;
  participants: Array<{
    userId: string;
    user: {
      displayName: string;
    };
  }>;
  messages: Array<{
    id: string;
    senderId: string;
    sender: {
      displayName: string;
      role: Role;
    };
    body: string;
    createdAt: Date;
  }>;
}

export async function getMarketplaceScopeWithCounts(
  params: Pick<MarketplaceSearchParams, "query" | "condition" | "minPrice" | "maxPrice"> = {}
): Promise<RcScopeWithCounts> {
  try {
    const rows = await prisma.listing.findMany({
      where: buildListingWhere(params),
      select: {
        category: { select: { slug: true } },
        attributes: true
      }
    });

    return buildRcScopeWithCounts(
      rows.map((row) => ({
        categorySlug: normalizeCategorySlug(row.category.slug),
        attributes: jsonRecord(row.attributes)
      }))
    );
  } catch {
    return rcScope;
  }
}

export async function getNavigationCountsForActor(actor: Actor): Promise<NavigationCounts> {
  if (!actor.isAuthenticated || actor.role === "VISITOR") return emptyNavigationCounts;

  try {
    const user = await ensureUserForActor(actor);

    if (actor.role === "BUYER") {
      const [watchlist, activeBids, pendingOffers, messages] = await Promise.all([
        prisma.watchlistItem.count({ where: { userId: user.id } }),
        prisma.bid.count({ where: { bidderId: user.id, status: { in: [BidStatus.ACTIVE, BidStatus.WINNING] } } }),
        prisma.offer.count({ where: { buyerId: user.id, status: OfferStatus.PENDING } }),
        prisma.conversationParticipant.count({ where: { userId: user.id } })
      ]);
      return { ...emptyNavigationCounts, watchlist, activeBids, pendingOffers, messages };
    }

    if (actor.role === "SELLER") {
      const [watchlist, sellerListings, pendingOffers, messages] = await Promise.all([
        prisma.watchlistItem.count({ where: { userId: user.id } }),
        prisma.listing.count({ where: { sellerId: user.id, deletedAt: null } }),
        prisma.offer.count({ where: { listing: { sellerId: user.id }, status: OfferStatus.PENDING } }),
        prisma.conversationParticipant.count({ where: { userId: user.id } })
      ]);
      return { ...emptyNavigationCounts, watchlist, sellerListings, pendingOffers, messages };
    }

    const [openReports, sellerApplications, pendingOffers, pendingListings, messages] = await Promise.all([
      prisma.report.count({ where: { status: { in: ["OPEN", "REVIEWING"] } } }),
      prisma.sellerApplication.count({ where: { status: "PENDING" } }),
      prisma.offer.count({ where: { status: OfferStatus.PENDING } }),
      prisma.listing.count({ where: { status: ListingStatus.PENDING_REVIEW, deletedAt: null } }),
      prisma.conversation.count()
    ]);
    return { ...emptyNavigationCounts, openReports, sellerApplications, pendingOffers, pendingListings, messages };
  } catch {
    return emptyNavigationCounts;
  }
}

export async function getWalletSummaryForActor(actor: Actor): Promise<WalletSummary> {
  if (!actor.isAuthenticated || actor.role === "VISITOR") return buildWalletSummaryFromLedger([], actor.role);

  try {
    const user = await ensureUserForActor(actor);
    const rows = await prisma.creditLedgerEntry.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" }
    });

    return buildWalletSummaryFromLedger(
      rows.map((row) => ({
        id: row.id,
        amount: row.amount,
        kind: row.kind as LedgerKind,
        status: row.status as LedgerStatus,
        reason: row.reason,
        createdAt: row.createdAt
      })),
      actor.role
    );
  } catch {
    return fallbackWalletSummary(actor.role);
  }
}

export async function getWalletLedgerExportForActor(actor: Actor): Promise<WalletLedgerExportRow[] | null> {
  if (!actor.isAuthenticated || actor.role === "VISITOR") return null;

  try {
    const user = await ensureUserForActor(actor);
    const rows = await prisma.creditLedgerEntry.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" }
    });

    return rows.map((row) => ({
      id: row.id,
      amount: row.amount,
      kind: row.kind as LedgerKind,
      status: row.status as LedgerStatus,
      reason: row.reason,
      createdAt: row.createdAt
    }));
  } catch {
    return null;
  }
}

export async function getLoyaltySummaryForActor(actor: Actor): Promise<LoyaltySummary> {
  if (!actor.isAuthenticated || actor.role === "VISITOR") return buildLoyaltySummaryFromEvents(0, []);

  try {
    const user = await ensureUserForActor(actor);
    const [total, rows] = await Promise.all([
      prisma.loyaltyEvent.aggregate({
        where: { userId: user.id },
        _sum: { points: true }
      }),
      prisma.loyaltyEvent.findMany({
        where: { userId: user.id },
        select: { id: true, points: true, reason: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 20
      })
    ]);

    return buildLoyaltySummaryFromEvents(total._sum.points ?? 0, rows);
  } catch {
    return buildLoyaltySummaryFromEvents(0, []);
  }
}

export function buildLoyaltySummaryFromEvents(
  points: number,
  rows: Array<{ id: string; points: number; reason: string; createdAt: Date }>,
  now = new Date()
): LoyaltySummary {
  const tiers = [
    { name: "Member", points: 0 },
    { name: "Builder", points: 500 },
    { name: "Verified", points: 1500 },
    { name: "Expert", points: 5000 }
  ];
  const tierPoints = Math.max(points, 0);
  const tier = [...tiers].reverse().find((candidate) => tierPoints >= candidate.points) ?? tiers[0];
  const nextTier = tiers.find((candidate) => candidate.points > tierPoints) ?? null;
  const progress = nextTier
    ? Math.min(100, Math.round(((tierPoints - tier.points) / (nextTier.points - tier.points)) * 100))
    : 100;

  return {
    points,
    tier: tier.name,
    nextTier,
    progress,
    activities: rows.map((row) => ({
      id: row.id,
      reason: row.reason,
      points: row.points,
      pointsLabel: `${row.points > 0 ? "+" : ""}${row.points} pts`,
      at: formatLedgerDate(row.createdAt, now)
    }))
  };
}

export function buildWalletSummaryFromLedger(rows: CreditLedgerSummaryRow[], role: Role, now = new Date()): WalletSummary {
  const postedRows = rows.filter((row) => row.status === "POSTED");
  const balanceCredits = postedRows.reduce((sum, row) => sum + row.amount, 0);
  const bidHoldsCredits = postedRows
    .filter((row) => row.kind === "HOLD")
    .reduce((sum, row) => sum + Math.abs(row.amount), 0);
  const boostBudgetCredits = postedRows
    .filter((row) => row.kind === "DEBIT" && row.reason.toLowerCase().includes("boost"))
    .reduce((sum, row) => sum + Math.abs(row.amount), 0);

  return {
    title: walletTitleForRole(role),
    balanceCredits,
    bidHoldsCredits,
    boostBudgetCredits,
    rewardTier: rewardTierForBalance(role, balanceCredits),
    transactions: rows.map((row) => mapWalletLedgerRow(row, now))
  };
}

export async function getBuildWorkshopForActor(actor: Actor): Promise<BuildWorkshopData> {
  if (!actor.isAuthenticated || actor.role === "VISITOR") return emptyBuildWorkshop("Sign in to save a build.");

  try {
    const user = await ensureUserForActor(actor);
    const row = await prisma.buildConfiguration.findFirst({
      where: actor.role === "ADMIN"
        ? { id: { not: { startsWith: "seed-" } } }
        : { ownerId: user.id, id: { not: { startsWith: "seed-" } } },
      include: buildConfigurationInclude,
      orderBy: { updatedAt: "desc" }
    });

    return row ? mapBuildWorkshopRow(row) : emptyBuildWorkshop("No saved build has been created for this account.");
  } catch {
    return emptyBuildWorkshop("Build data is unavailable. Please try again.");
  }
}

export async function saveBuildWorkshopForActor(actor: Actor, input: BuildWorkshopInput) {
  if (!can(actor.role, "ai:use")) return { mode: "forbidden" as const };

  const build = normalizeBuildWorkshopInput(input);
  if (!build) return { mode: "invalid" as const };

  try {
    const user = await ensureUserForActor(actor);
    const existing = await prisma.buildConfiguration.findFirst({
      where: { ownerId: user.id },
      orderBy: { updatedAt: "desc" },
      select: { id: true }
    });
    const data = {
      title: build.title,
      vehicleType: build.vehicleType,
      dryWeightGrams: build.dryWeightGrams,
      estimatedCostCents: build.estimatedCostCents,
      thrustRatio: build.thrustRatio,
      riskLevel: build.riskLevel,
      note: build.note,
      parts: {
        ...(existing ? { deleteMany: {} } : {}),
        create: build.parts.map((part, index) => ({ ...part, sortOrder: index }))
      }
    };

    const saved = existing
      ? await prisma.buildConfiguration.update({ where: { id: existing.id }, data })
      : await prisma.buildConfiguration.create({ data: { ...data, ownerId: user.id } });

    await prisma.auditLog.create({
      data: { actorId: user.id, action: "build.saved", entity: "BuildConfiguration", entityId: saved.id }
    });

    return { mode: "saved" as const, buildId: saved.id };
  } catch {
    return { mode: "error" as const };
  }
}

export function mapBuildWorkshopRow(row: BuildConfigurationRow): BuildWorkshopData {
  const evaluation = evaluateBuildCompatibility(
    row.vehicleType,
    row.thrustRatio,
    row.parts.map((part) => ({ slot: part.slot, selected: part.selected }))
  );
  const note = row.note?.includes("Checks use only the specifications entered above.")
    ? row.note
    : [row.note, evaluation.summary].filter(Boolean).join(" ");

  return {
    title: row.title,
    vehicleType: row.vehicleType,
    dryWeightGrams: row.dryWeightGrams,
    estimatedCostCents: row.estimatedCostCents,
    thrustRatio: row.thrustRatio,
    riskLevel: evaluation.riskLevel,
    note,
    parts: evaluation.parts.map((part, index) => ({
      slot: part.slot,
      selected: part.selected,
      status: part.status,
      active: index === 0
    }))
  };
}

export async function getRepairAdvisorDataForActor(actor: Actor): Promise<RepairAdvisorData> {
  if (!actor.isAuthenticated || actor.role === "VISITOR") return { sessions: [], activeSession: null };

  try {
    const user = await ensureUserForActor(actor);
    const rows = await prisma.repairSession.findMany({
      where: actor.role === "ADMIN"
        ? { id: { not: { startsWith: "seed-" } } }
        : { ownerId: user.id, id: { not: { startsWith: "seed-" } } },
      orderBy: { updatedAt: "desc" }
    });
    const sessions = rows.map((row, index) => ({
      id: row.id,
      title: row.title,
      vehicleType: row.vehicleType,
      lastSummary: row.lastSummary,
      issueNotes: row.issueNotes,
      advisorNote: row.advisorNote,
      checklist: normalizeRepairChecklist(row.checklist),
      status: row.status,
      when: formatCompactDate(row.updatedAt),
      active: index === 0
    }));

    return { sessions, activeSession: sessions[0] ?? null };
  } catch {
    return { sessions: [], activeSession: null };
  }
}

export async function createRepairSessionForActor(actor: Actor, input: RepairSessionInput) {
  if (!can(actor.role, "ai:use")) return { mode: "forbidden" as const };

  const title = input.title.trim().slice(0, 100);
  const vehicleType = normalizeVehicleType(input.vehicleType);
  const issueNotes = input.issueNotes.trim().slice(0, 2_000);
  if (!title || !issueNotes) return { mode: "invalid" as const };

  try {
    const user = await ensureUserForActor(actor);
    const checklist = buildRepairChecklist(issueNotes);
    const advisorNote = await repairAdviceFor({ title, vehicleType, issueNotes, checklist });
    const session = await prisma.repairSession.create({
      data: {
        ownerId: user.id,
        title,
        vehicleType,
        lastSummary: checklist[0] ?? "Review the reported issue before operating the model.",
        issueNotes,
        advisorNote,
        checklist
      }
    });

    await prisma.auditLog.create({
      data: { actorId: user.id, action: "repair.diagnosis_created", entity: "RepairSession", entityId: session.id }
    });

    return { mode: "created" as const, sessionId: session.id };
  } catch {
    return { mode: "error" as const };
  }
}

export function normalizeRepairChecklist(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function normalizeBuildWorkshopInput(input: BuildWorkshopInput) {
  const title = input.title.trim().slice(0, 120);
  const vehicleType = normalizeVehicleType(input.vehicleType);
  const thrustRatio = input.thrustRatio.trim().slice(0, 40);
  const userNote = input.note?.trim().slice(0, 1_000);
  const evaluation = evaluateBuildCompatibility(vehicleType, thrustRatio, parseBuildParts(input.parts));

  if (
    !title ||
    !thrustRatio ||
    !Number.isInteger(input.dryWeightGrams) ||
    input.dryWeightGrams < 0 ||
    !Number.isInteger(input.estimatedCostCents) ||
    input.estimatedCostCents < 0
  ) {
    return null;
  }

  return {
    title,
    vehicleType,
    dryWeightGrams: input.dryWeightGrams,
    estimatedCostCents: input.estimatedCostCents,
    thrustRatio,
    riskLevel: evaluation.riskLevel,
    note: [userNote, evaluation.summary].filter(Boolean).join(" "),
    parts: evaluation.parts
  };
}

function parseBuildParts(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 12)
    .map((line, index) => {
      const [rawSlot, ...rawSelected] = line.split(":");
      const selected = rawSelected.join(":").trim() || rawSlot.trim();
      const slot = rawSelected.length ? rawSlot.trim() : `Part ${index + 1}`;
      return {
        slot: slot.slice(0, 60) || `Part ${index + 1}`,
        selected: selected.slice(0, 160)
      };
    })
    .filter((part) => part.selected.length > 0);
}

export function evaluateBuildCompatibility(
  vehicleType: string,
  thrustRatio: string,
  parts: Array<{ slot: string; selected: string }>
) {
  const family = normalizeVehicleType(vehicleType);
  const coreParts = corePartsForVehicle(family);
  const missing = coreParts.filter((corePart) => !parts.some((part) => partMatches(part, corePart)));
  const battery = parts.find((part) => partMatches(part, "battery"));
  const esc = parts.find((part) => partMatches(part, "esc"));
  const batteryCells = battery ? readBatteryCells(battery.selected) : null;
  const escRange = esc ? readEscCellRange(esc.selected) : null;

  const checkedParts = parts.map((part) => {
    if (partMatches(part, "battery")) {
      if (batteryCells && escRange && batteryCells >= escRange.min && batteryCells <= escRange.max) {
        return { ...part, status: `Compatible: ${batteryCells}S is within the ESC ${escRange.min}-${escRange.max}S range` };
      }
      if (batteryCells && escRange) {
        return { ...part, status: `Incompatible: ${batteryCells}S exceeds the ESC ${escRange.min}-${escRange.max}S range` };
      }
      return { ...part, status: "Review: add battery cell count (for example, 6S)" };
    }

    if (partMatches(part, "esc")) {
      if (batteryCells && escRange && batteryCells >= escRange.min && batteryCells <= escRange.max) {
        return { ...part, status: `Compatible: supports the supplied ${batteryCells}S battery` };
      }
      if (batteryCells && escRange) {
        return { ...part, status: `Incompatible: supports ${escRange.min}-${escRange.max}S, not ${batteryCells}S` };
      }
      return { ...part, status: "Review: add ESC battery range (for example, 3-6S)" };
    }

    if (partMatches(part, "motor")) {
      const hasKv = /\b\d{3,5}\s*kv\b/i.test(part.selected);
      const hasCurrent = /\b\d{1,3}\s*a\b/i.test(part.selected);
      return {
        ...part,
        status: hasKv && hasCurrent
          ? "Compatible: KV and current rating are recorded"
          : "Review: add motor KV and current rating"
      };
    }

    if (partMatches(part, "frame")) {
      return {
        ...part,
        status: /\b\d+(?:\.\d+)?\s*(?:inch|in)\b/i.test(part.selected)
          ? "Compatible: frame size is recorded"
          : "Review: add frame or mounting size"
      };
    }

    return { ...part, status: "Review: add a compatibility-relevant specification" };
  });

  const thrust = readThrustRatio(thrustRatio);
  const hasIncompatiblePart = checkedParts.some((part) => part.status.startsWith("Incompatible"));
  const needsReview = checkedParts.some((part) => part.status.startsWith("Review"));
  const riskLevel = hasIncompatiblePart || (thrust !== null && thrust < 2)
    ? "High"
    : missing.length > 0 || needsReview || thrust === null || thrust < 4 || thrust > 20
      ? "Review"
      : "Low";
  const summary = [
    "Checks use only the specifications entered above.",
    missing.length ? `Missing ${family} core parts: ${missing.join(", ")}.` : null,
    thrust === null ? "Thrust ratio could not be read; use a value such as 6.2:1." : null,
    hasIncompatiblePart ? "At least one electrical mismatch needs correction." : null
  ].filter(Boolean).join(" ");

  return { parts: checkedParts, riskLevel, summary };
}

function corePartsForVehicle(vehicleType: string) {
  if (vehicleType === "helis") return ["motor", "esc", "battery", "gyro"];
  if (vehicleType === "planes") return ["motor", "esc", "battery", "prop"];
  if (vehicleType === "cars") return ["motor", "esc", "battery"];
  return ["frame", "motor", "esc", "battery"];
}

function partMatches(part: { slot: string; selected: string }, keyword: string) {
  return `${part.slot} ${part.selected}`.toLowerCase().includes(keyword);
}

function readBatteryCells(value: string) {
  const match = value.match(/\b(\d{1,2})\s*s\b/i);
  return match ? Number(match[1]) : null;
}

function readEscCellRange(value: string) {
  const range = value.match(/\b(\d{1,2})\s*s?\s*(?:-|to)\s*(\d{1,2})\s*s\b/i);
  if (range) return { min: Number(range[1]), max: Number(range[2]) };
  const single = readBatteryCells(value);
  return single ? { min: single, max: single } : null;
}

function readThrustRatio(value: string) {
  const match = value.match(/(\d+(?:\.\d+)?)\s*:\s*1/);
  return match ? Number(match[1]) : null;
}

function buildRepairChecklist(issueNotes: string) {
  const issue = issueNotes.toLowerCase();
  const checks = [
    "Remove propellers or disconnect drive power before inspection.",
    "Photograph the fault and record the tested configuration.",
    "Confirm fasteners, connectors, and power leads before another test."
  ];

  if (/(vibrat|motor|prop)/.test(issue)) checks.push("Inspect prop balance, motor bell runout, shafts, and arm or mount damage.");
  if (/(esc|desync|power|battery|smoke)/.test(issue)) checks.push("Inspect solder joints, battery voltage, ESC settings, and heat damage before powered testing.");
  if (/(radio|signal|receiver|gps|video)/.test(issue)) checks.push("Verify antenna placement, wiring continuity, failsafe settings, and firmware compatibility.");

  return checks.slice(0, 6);
}

async function repairAdviceFor(input: {
  title: string;
  vehicleType: string;
  issueNotes: string;
  checklist: string[];
}) {
  const fallback = `Automated safety fallback (AI unavailable): start with the saved safety checklist, then isolate one change at a time. Do not fly or sell the model as fully tested until the fault is reproduced, corrected, and documented.`;

  try {
    const completion = await completeAiText({
      feature: "repair",
      system: "You are an RC repair advisor. Give concise, safety-first diagnostic guidance. Do not recommend bypassing safety checks.",
      prompt: JSON.stringify(input),
      maxTokens: 350
    });
    return completion.provider === "mock" ? fallback : completion.text || fallback;
  } catch {
    return fallback;
  }
}

export async function getPricingEngineData(vehicleFamily = "drones"): Promise<PricingEngineData> {
  const selectedVehicleFamily = normalizeVehicleType(vehicleFamily);
  const defaultVehicleTypes = rcScope.vehicleTypes.filter((item) => item.id !== "all");
  try {
    const scope = await getMarketplaceScopeWithCounts();
    const vehicleTypes = scope.vehicleTypes.filter((item) => item.id !== "all");
    return emptyPricingEngineData(vehicleTypes, selectedVehicleFamily);
  } catch {
    return emptyPricingEngineData(defaultVehicleTypes, selectedVehicleFamily);
  }
}

export async function getPricingGuidanceForInput(
  vehicleFamily: string,
  targetPriceCents: number,
  title = "",
  condition = ""
) {
  const selectedVehicleFamily = normalizeVehicleType(vehicleFamily);
  const [category, currency] = await Promise.all([
    prisma.hobbyCategory.findFirst({ where: { slug: { in: [selectedVehicleFamily, `rc-${selectedVehicleFamily}`] } } }).catch(() => null),
    getApplicationCurrency()
  ]);
  const stored = category ? await getStoredPricingComparables(category.id).catch(() => []) : [];
  const comparableSales = selectRelevantComparables(stored, title, condition);
  const guidance = buildPricingGuidance({
    listingPriceCents: targetPriceCents,
    comparablePrices: comparableSales.map((sale) => sale.soldPriceCents)
  });

  return {
    comparableSales,
    guidance,
    note: buildPricingNote(targetPriceCents, guidance, comparableSales.length, currency)
  };
}

async function getStoredPricingComparables(categoryId: string): Promise<PricingComparableView[]> {
  const [persisted, acceptedOffers] = await Promise.all([
    prisma.pricingComparable.findMany({
      where: { categoryId },
      orderBy: { soldAt: "desc" },
      take: 30
    }),
    prisma.offer.findMany({
      where: {
        status: OfferStatus.ACCEPTED,
        listing: { categoryId, status: ListingStatus.SOLD, deletedAt: null }
      },
      select: {
        id: true,
        amountCents: true,
        updatedAt: true,
        listing: { select: { title: true, condition: true } }
      },
      orderBy: { updatedAt: "desc" },
      take: 30
    })
  ]);

  return [
    ...acceptedOffers.map((row) => ({
      id: row.id,
      title: row.listing.title,
      condition: row.listing.condition,
      soldPriceCents: row.amountCents,
      soldAt: row.updatedAt.toISOString()
    })),
    ...persisted.map((row) => ({
      id: row.id,
      title: row.title,
      condition: row.condition,
      soldPriceCents: row.soldPriceCents,
      soldAt: row.soldAt.toISOString()
    }))
  ];
}

export function selectRelevantComparables(
  comparables: PricingComparableView[],
  title: string,
  condition = ""
) {
  if (!title.trim()) return comparables.slice(0, 8);
  const titleTokens = pricingTitleTokens(title);
  const normalizedCondition = condition.trim().toLowerCase();
  return comparables
    .map((item) => {
      const itemTokens = pricingTitleTokens(item.title);
      const shared = [...titleTokens].filter((token) => itemTokens.has(token)).length;
      const similarity = titleTokens.size ? shared / titleTokens.size : 0;
      const conditionBonus = normalizedCondition && item.condition.toLowerCase() === normalizedCondition ? 0.15 : 0;
      return { item, score: similarity + conditionBonus };
    })
    .filter(({ score }) => score >= 0.34)
    .sort((left, right) => right.score - left.score || Date.parse(right.item.soldAt) - Date.parse(left.item.soldAt))
    .slice(0, 8)
    .map(({ item }) => item);
}

function pricingTitleTokens(title: string) {
  const ignored = new Set(["the", "and", "with", "kit", "bundle", "set", "new", "used", "rc", "for", "plus"]);
  return new Set(
    title.toLowerCase().replace(/[^a-z0-9+.-]+/g, " ").split(/\s+/).filter((token) => token.length >= 2 && !ignored.has(token))
  );
}

export function buildPricingGuidance(input: {
  listingPriceCents: number;
  buyNowCents?: number;
  comparablePrices: number[];
}): PricingGuidance {
  const prices = input.comparablePrices.filter((price) => price > 0).sort((a, b) => a - b);
  if (prices.length === 0) {
    const base = input.listingPriceCents > 0 ? input.listingPriceCents : 0;
    return {
      conservativeCents: base,
      recommendedCents: base,
      buyNowCents: input.buyNowCents ?? base
    };
  }

  const conservativeCents = prices[0];
  const recommendedCents = roundToNearestHundred(prices.reduce((sum, price) => sum + price, 0) / prices.length);
  const buyNowCents = input.buyNowCents ?? roundToNearestHundred(prices[prices.length - 1] * 1.12);

  return { conservativeCents, recommendedCents, buyNowCents };
}

export function buildRcScopeWithCounts(rows: RcScopeCountRow[]): RcScopeWithCounts {
  const vehicleIds = rcScope.vehicleTypes.map((item) => item.id);
  const componentFamilies = Object.keys(rcScope.componentTypes);
  const vehicleCounts = new Map(vehicleIds.map((id) => [id, 0]));
  const componentCounts = new Map<string, Map<string, number>>();
  let vehicleTotal = 0;
  let componentTotal = 0;

  for (const [family, options] of Object.entries(rcScope.componentTypes)) {
    componentCounts.set(family, new Map(options.map((option) => [option.id, 0])));
  }

  for (const row of rows) {
    const scope = stringAttribute(row.attributes.scope) === "components" ? "components" : "vehicles";
    const vehicleType = normalizeVehicleType(stringAttribute(row.attributes.vehicleType) ?? row.categorySlug);

    if (scope === "components") {
      componentTotal += 1;
      const componentType = stringAttribute(row.attributes.componentType) ?? "all";
      incrementComponentCount(componentCounts, "all", "all");
      incrementComponentCount(componentCounts, vehicleType, "all");
      incrementComponentCount(componentCounts, vehicleType, componentType);
    } else {
      vehicleTotal += 1;
      vehicleCounts.set(vehicleType, (vehicleCounts.get(vehicleType) ?? 0) + 1);
    }
  }

  vehicleCounts.set("all", vehicleTotal);

  return {
    sections: rcScope.sections.map((section) => ({
      ...section,
      count: section.id === "vehicles" ? vehicleTotal : componentTotal
    })),
    vehicleTypes: rcScope.vehicleTypes.map((vehicleType) => ({
      ...vehicleType,
      count: vehicleCounts.get(vehicleType.id) ?? 0
    })),
    componentTypes: Object.fromEntries(
      componentFamilies.map((family) => [
        family,
        rcScope.componentTypes[family].map((componentType) => ({
          ...componentType,
          count: componentCounts.get(family)?.get(componentType.id) ?? 0
        }))
      ])
    ) as RcScopeWithCounts["componentTypes"]
  };
}

export async function getDashboardMetricsForActor(actor: Actor): Promise<DashboardMetric[]> {
  if (!actor.isAuthenticated || actor.role === "VISITOR") {
    return fallbackDashboardMetrics(actor.role);
  }

  try {
    const user = await ensureUserForActor(actor);

    if (actor.role === "BUYER") {
      const [watched, activeBids, pendingOffers, conversations] = await Promise.all([
        prisma.watchlistItem.count({ where: { userId: user.id } }),
        prisma.bid.count({ where: { bidderId: user.id, status: { in: [BidStatus.ACTIVE, BidStatus.WINNING] } } }),
        prisma.offer.count({ where: { buyerId: user.id, status: OfferStatus.PENDING } }),
        prisma.conversationParticipant.count({ where: { userId: user.id } })
      ]);

      return [
        { label: "Watched listings", value: String(watched), delta: "from database", tone: watched ? "good" : "neutral" },
        { label: "Active bids", value: String(activeBids), delta: activeBids ? "live bid holds" : "none active", tone: activeBids ? "good" : "neutral" },
        { label: "Open offers", value: String(pendingOffers), delta: pendingOffers ? "awaiting seller" : "none pending", tone: pendingOffers ? "warn" : "neutral" },
        { label: "Messages", value: String(conversations), delta: "conversation threads", tone: conversations ? "good" : "neutral" }
      ];
    }

    if (actor.role === "SELLER") {
      const [activeListings, pendingOffers, watchers, conversations] = await Promise.all([
        prisma.listing.count({ where: { sellerId: user.id, status: ListingStatus.ACTIVE, deletedAt: null } }),
        prisma.offer.count({ where: { listing: { sellerId: user.id }, status: OfferStatus.PENDING } }),
        prisma.watchlistItem.count({ where: { listing: { sellerId: user.id } } }),
        prisma.conversationParticipant.count({ where: { userId: user.id } })
      ]);

      return [
        { label: "Active listings", value: String(activeListings), delta: "published inventory", tone: activeListings ? "good" : "neutral" },
        { label: "Pending offers", value: String(pendingOffers), delta: pendingOffers ? "need reply" : "clear", tone: pendingOffers ? "warn" : "good" },
        { label: "Watchers", value: String(watchers), delta: "across listings", tone: watchers ? "good" : "neutral" },
        { label: "Messages", value: String(conversations), delta: "buyer threads", tone: conversations ? "good" : "neutral" }
      ];
    }

    const [openReports, activeListings, pendingApplications, users] = await Promise.all([
      prisma.report.count({ where: { status: { in: ["OPEN", "REVIEWING"] } } }),
      prisma.listing.count({ where: { status: ListingStatus.ACTIVE, deletedAt: null } }),
      prisma.sellerApplication.count({ where: { status: "PENDING" } }),
      prisma.user.count({ where: { status: "ACTIVE" } })
    ]);

    return [
      { label: "Open reports", value: String(openReports), delta: openReports ? "review queue" : "clear", tone: openReports ? "warn" : "good" },
      { label: "Active listings", value: String(activeListings), delta: "live marketplace", tone: activeListings ? "good" : "neutral" },
      { label: "Seller approvals", value: String(pendingApplications), delta: pendingApplications ? "pending" : "clear", tone: pendingApplications ? "warn" : "good" },
      { label: "Active users", value: String(users), delta: "database users", tone: users ? "good" : "neutral" }
    ];
  } catch {
    return fallbackDashboardMetrics(actor.role);
  }
}

export async function listMarketplaceCategories(): Promise<Category[]> {
  try {
    const rows = await prisma.hobbyCategory.findMany({
      where: {
        active: true,
        slug: { in: [...fallbackCategories.map((category) => category.slug), ...fallbackCategories.map((category) => `rc-${category.slug}`)] }
      },
      orderBy: { name: "asc" }
    });

    if (rows.length === 0) return fallbackCategories;

    const mapped = rows.map(mapCategoryRow);
    return fallbackCategories
      .map((fallback) => mapped.find((category) => category.slug === fallback.slug) ?? fallback)
      .filter(Boolean);
  } catch {
    return fallbackCategories;
  }
}

export async function listMarketplaceListings(params: MarketplaceSearchParams = {}): Promise<Listing[]> {
  try {
    const rows = await prisma.listing.findMany({
      where: buildListingWhere(params),
      include: listingInclude
    });
    const mapped = rows.map(mapListingRow).filter((listing) => listing.hobbyName === "Vehicles");
    return sortListings(filterListings(mapped, params), params.sort);
  } catch {
    return sortListings(filterListings(fallbackListings, params), params.sort);
  }
}

export async function listComponentMarketplace(params: MarketplaceSearchParams & { vehicleType?: string; componentType?: string } = {}) {
  try {
    const rows = await prisma.listing.findMany({
      where: buildListingWhere({
        query: params.query,
        category: params.vehicleType,
        condition: params.condition,
        minPrice: params.minPrice,
        maxPrice: params.maxPrice
      }),
      include: listingInclude
    });
    const mapped = rows.map(mapComponentRow).filter((component): component is ComponentListing => Boolean(component));
    const filtered = filterComponentMarketplaceListings(mapped, params);
    return sortComponents(filtered, params.sort);
  } catch {
    return sortComponents(filterComponentMarketplaceListings(fallbackComponents, params), params.sort);
  }
}

export async function getListingDetailBySlug(slug: string): Promise<Listing | null> {
  try {
    const row = await prisma.listing.findUnique({
      where: { slug },
      include: listingInclude
    });

    return row ? mapListingRow(row) : fallbackListings.find((listing) => listing.slug === slug) ?? null;
  } catch {
    return fallbackListings.find((listing) => listing.slug === slug) ?? null;
  }
}

export async function listBidsForListing(listingId: string): Promise<Bid[]> {
  try {
    const rows = await prisma.bid.findMany({
      where: { listingId },
      orderBy: { amountCents: "desc" }
    });

    return rows.map(mapBidRow);
  } catch {
    return fallbackBids.filter((bid) => bid.listingId === listingId);
  }
}

export async function listBidsForActor(actor: Actor): Promise<Bid[]> {
  if (!actor.isAuthenticated) return [];

  try {
    const user = await ensureUserForActor(actor);
    const rows = await prisma.bid.findMany({
      where: actor.role === "ADMIN" ? undefined : { bidderId: user.id },
      orderBy: { createdAt: "desc" }
    });
    return rows.map(mapBidRow);
  } catch {
    return fallbackBids;
  }
}

export async function listOffersForActor(actor: Actor): Promise<Offer[]> {
  if (!actor.isAuthenticated) return [];

  try {
    const user = await ensureUserForActor(actor);
    const rows = await prisma.offer.findMany({
      where:
        actor.role === "ADMIN"
          ? undefined
          : actor.role === "SELLER"
            ? { listing: { sellerId: user.id } }
            : { buyerId: user.id },
      include: offerListInclude,
      orderBy: { createdAt: "desc" }
    });
    return rows.map(mapOfferRow);
  } catch {
    return fallbackOffers;
  }
}

export async function listWatchlistListings(actor: Actor): Promise<Listing[]> {
  if (!actor.isAuthenticated) return [];

  try {
    const user = await ensureUserForActor(actor);
    const rows = await prisma.watchlistItem.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: {
        listing: {
          include: listingInclude
        }
      }
    });

    return rows.map((row) => mapListingRow(row.listing));
  } catch {
    return fallbackListings.slice(0, 4);
  }
}

export async function listSellerInventory(actor: Actor): Promise<Listing[]> {
  if (!actor.isAuthenticated) return [];

  try {
    const user = await ensureUserForActor(actor);
    const rows = await prisma.listing.findMany({
      where: actor.role === "ADMIN" ? { deletedAt: null } : { sellerId: user.id, deletedAt: null },
      include: listingInclude,
      orderBy: { updatedAt: "desc" }
    });

    return rows.map(mapListingRow);
  } catch {
    return fallbackListings;
  }
}

export async function updateSellerListingForActor(actor: Actor, listingId: string, input: SellerListingUpdateInput) {
  if (!can(actor.role, "listing:update:own")) return { mode: "forbidden" as const };

  const title = input.title.trim().slice(0, 140);
  const description = input.description.trim().slice(0, 10_000);
  const condition = input.condition.trim().slice(0, 80);
  const location = input.location.trim().slice(0, 120);
  if (!title || !description || !condition || !location || !Number.isInteger(input.priceCents) || input.priceCents <= 0) {
    return { mode: "invalid" as const };
  }

  try {
    const user = await ensureUserForActor(actor);
    const listing = await prisma.listing.findFirst({
      where: {
        id: listingId,
        deletedAt: null,
        ...(actor.role === "ADMIN" ? {} : { sellerId: user.id })
      },
      select: { id: true, status: true }
    });
    if (!listing) return { mode: "not_found" as const };
    const unavailableStatuses: ListingStatus[] = [ListingStatus.SOLD, ListingStatus.ARCHIVED];
    if (unavailableStatuses.includes(listing.status)) return { mode: "unavailable" as const };

    const updated = await prisma.listing.update({
      where: { id: listing.id },
      data: {
        title,
        description,
        condition,
        priceCents: input.priceCents,
        location,
        // A public listing returns to moderation when its sale terms change.
        ...(listing.status === ListingStatus.ACTIVE ? { status: ListingStatus.PENDING_REVIEW } : {})
      }
    });
    await prisma.auditLog.create({
      data: { actorId: user.id, action: "listing.updated_by_seller", entity: "Listing", entityId: updated.id }
    });

    return { mode: "updated" as const, listingId: updated.id };
  } catch {
    return { mode: "error" as const };
  }
}

export async function setSellerListingStatusForActor(
  actor: Actor,
  listingId: string,
  nextStatus: "PAUSED" | "ACTIVE" | "ARCHIVED"
) {
  if (!can(actor.role, "listing:update:own")) return { mode: "forbidden" as const };

  try {
    const user = await ensureUserForActor(actor);
    const listing = await prisma.listing.findFirst({
      where: {
        id: listingId,
        deletedAt: null,
        ...(actor.role === "ADMIN" ? {} : { sellerId: user.id })
      },
      select: { id: true, status: true }
    });
    if (!listing) return { mode: "not_found" as const };

    const allowed =
      (nextStatus === "PAUSED" && listing.status === ListingStatus.ACTIVE) ||
      (nextStatus === "ACTIVE" && listing.status === ListingStatus.PAUSED) ||
      (nextStatus === "ARCHIVED" && ([ListingStatus.PENDING_REVIEW, ListingStatus.ACTIVE, ListingStatus.PAUSED, ListingStatus.REJECTED] as ListingStatus[]).includes(listing.status));
    if (!allowed) return { mode: "unavailable" as const };

    await prisma.$transaction(async (tx) => {
      await tx.listing.update({ where: { id: listing.id }, data: { status: nextStatus as ListingStatus } });
      await tx.auditLog.create({
        data: { actorId: user.id, action: `listing.${nextStatus.toLowerCase()}`, entity: "Listing", entityId: listing.id }
      });
    });

    return { mode: "updated" as const, listingId: listing.id };
  } catch {
    return { mode: "error" as const };
  }
}

export async function listConversationsForActor(actor: Actor): Promise<ConversationSummary[]> {
  if (!actor.isAuthenticated) return [];

  try {
    const user = await ensureUserForActor(actor);
    const rows = await prisma.conversation.findMany({
      where: actor.role === "ADMIN" ? undefined : { participants: { some: { userId: user.id } } },
      include: {
        participants: { include: { user: { select: { displayName: true } } } },
        messages: {
          orderBy: { createdAt: "asc" },
          include: { sender: { select: { displayName: true, role: true } } }
        }
      },
      orderBy: { updatedAt: "desc" }
    });

    const listingIds = rows.map((row) => row.listingId).filter((id): id is string => Boolean(id));
    const listingRows = listingIds.length
      ? await prisma.listing.findMany({ where: { id: { in: listingIds } }, select: { id: true, title: true } })
      : [];
    const listingTitles = new Map(listingRows.map((listing) => [listing.id, listing.title]));

    return rows.map((row) => mapConversationSummaryRow(row, user.id, actor.role, row.listingId ? listingTitles.get(row.listingId) : undefined));
  } catch {
    return fallbackConversations;
  }
}

export function mapConversationSummaryRow(
  row: ConversationSummaryRow,
  currentUserId: string,
  actorRole: Role,
  listingTitle?: string
): ConversationSummary {
  const messages = row.messages.map((message) => mapConversationMessageRow(message, currentUserId));
  const lastMessage = messages.at(-1);
  const otherParty =
    actorRole === "ADMIN"
      ? row.participants
          .filter((participant) => participant.userId !== currentUserId)
          .map((participant) => participant.user.displayName)
          .join(", ")
      : row.participants.find((participant) => participant.userId !== currentUserId)?.user.displayName;

  return {
    id: row.id,
    subject: row.subject,
    listingTitle,
    otherParty: otherParty || "Marketplace",
    lastMessage: lastMessage?.body ?? "No messages yet.",
    updatedAt: formatShortTime(row.updatedAt),
    unread: 0,
    messages
  };
}

function mapConversationMessageRow(
  row: ConversationSummaryRow["messages"][number],
  currentUserId: string
): ConversationMessage {
  return {
    id: row.id,
    senderId: row.senderId,
    senderName: row.sender.displayName,
    senderRole: row.sender.role,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    sentAt: formatShortTime(row.createdAt),
    isMine: row.senderId === currentUserId
  };
}

export async function listReportsForAdmin(): Promise<Report[]> {
  try {
    const rows = await prisma.report.findMany({
      include: { listing: true },
      orderBy: { createdAt: "desc" }
    });

    return rows.map((row) => ({
      id: row.id,
      listingId: row.listingId,
      listingTitle: row.listing.title,
      reason: row.reason,
      status: row.status,
      submittedBy: row.reporterId,
      createdAt: row.createdAt.toISOString()
    }));
  } catch {
    return fallbackReports;
  }
}

export async function createListingFromDraft(actor: Actor, input: ListingDraftInput) {
  if (!can(actor.role, "listing:create")) return { mode: "forbidden" as const };
  const validation = validateListingDraft(input);
  if (!validation.success) {
    return { mode: "invalid" as const, error: validation.error.flatten() };
  }

  try {
    const categoryRow = await prisma.hobbyCategory.findFirst({
      where: {
        slug: { in: [normalizeCategorySlug(input.categorySlug), `rc-${normalizeCategorySlug(input.categorySlug)}`] },
        active: true
      }
    });
    if (!categoryRow) return { mode: "invalid" as const };

    const categoryValidation = validateListingDraft(input, mapCategoryRow(categoryRow));
    if (!categoryValidation.success) {
      return { mode: "invalid" as const, error: categoryValidation.error.flatten() };
    }

    const [user, currency] = await Promise.all([
      ensureUserForActor(actor),
      getApplicationCurrency()
    ]);
    const slug = await uniqueListingSlug(input.title);
    const defaultMedia = defaultMediaForCategory(input.categorySlug);
    const endsAt = input.listingType === "AUCTION"
      ? auctionEndDate(input.attributes.durationDays, new Date(), 7)
      : undefined;
    const mediaCreate = input.mediaUrls && input.mediaUrls.length > 0
      ? input.mediaUrls.map((url, index) => ({ url, alt: input.title, sortOrder: index }))
      : [{ url: defaultMedia, alt: input.title, sortOrder: 0 }];

    const listing = await prisma.listing.create({
      data: {
        sellerId: user.id,
        categoryId: categoryRow.id,
        slug,
        title: input.title,
        description: input.description,
        condition: input.condition,
        listingType: input.listingType as ListingType,
        status: ListingStatus.PENDING_REVIEW,
        priceCents: input.priceCents,
        reserveCents: input.reserveCents,
        buyNowCents: input.buyNowCents,
        currency,
        location: input.location,
        endsAt,
        attributes: input.attributes,
        media: { create: mediaCreate }
      }
    });

    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: "listing.submitted_for_review",
        entity: "Listing",
        entityId: listing.id
      }
    });

    return { mode: "created" as const, listingId: listing.id, slug: listing.slug };
  } catch {
    return { mode: "error" as const };
  }
}

export async function placeBidForListing(actor: Actor, listingId: string, amountCents: number, now = new Date()) {
  if (!can(actor.role, "bid:create")) return { mode: "forbidden" as const };

  try {
    const user = await ensureUserForActor(actor);
    const result = await serializableTransaction(async (tx) => {
      const row = await tx.listing.findUnique({
        where: { id: listingId },
        include: listingInclude
      });
      if (!row) return { mode: "missing" as const };

      const listing = mapListingRow(row);
      const decision = canPlaceBid(listing, user.id, amountCents, now);
      if (!decision.ok) {
        return { mode: "rejected" as const, reason: decision.reason, minimumCents: decision.minimumCents };
      }

      const previousWinner = await tx.bid.findFirst({
        where: { listingId, status: BidStatus.WINNING },
        include: { bidder: true }
      });

      await tx.bid.updateMany({
        where: { listingId, status: BidStatus.WINNING },
        data: { status: BidStatus.OUTBID }
      });
      const bid = await tx.bid.create({
        data: {
          listingId,
          bidderId: user.id,
          amountCents,
          status: BidStatus.WINNING
        }
      });
      await tx.listing.update({
        where: { id: listingId },
        data: { priceCents: amountCents }
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "bid.placed",
          entity: "Bid",
          entityId: bid.id,
          metadata: { listingId, amountCents }
        }
      });

      if (previousWinner && previousWinner.bidderId !== user.id) {
        return {
          mode: "created" as const,
          bidId: bid.id,
          outbid: { userId: previousWinner.bidderId, email: previousWinner.bidder.email, title: listing.title, slug: listing.slug }
        };
      }

      return { mode: "created" as const, bidId: bid.id };
    });

    const outbid = result.mode === "created" ? result.outbid : undefined;
    if (outbid) {
      void createNotification({
        userId: outbid.userId,
        kind: "bid_outbid",
        title: "You've been outbid",
        body: `Someone placed a higher bid on "${outbid.title}". Bid again to stay in the lead.`,
        linkUrl: `/listings/${outbid.slug}`
      });
      void sendEmail({
        to: outbid.email,
        subject: `Outbid on ${outbid.title}`,
        text: `You've been outbid on "${outbid.title}". Visit the listing to place a higher bid.`,
        html: `<p>You've been outbid on <strong>${escapeHtml(outbid.title)}</strong>. <a href="/listings/${outbid.slug}">Bid again</a> to stay in the lead.</p>`
      });
    }

    return result;
  } catch {
    return { mode: "error" as const };
  }
}

export async function createOfferForListing(actor: Actor, listingId: string, amountCents: number, message?: string) {
  if (!can(actor.role, "offer:create")) return { mode: "forbidden" as const };
  const trimmedMessage = message?.trim();
  if (trimmedMessage && trimmedMessage.length > 600) return { mode: "invalid" as const };

  try {
    const user = await ensureUserForActor(actor);
    const result = await serializableTransaction(async (tx) => {
      const row = await tx.listing.findUnique({
        where: { id: listingId },
        include: listingInclude
      });
      if (!row) return { mode: "missing" as const };

      const listing = mapListingRow(row);
      const decision = canMakeOffer(listing, user.id, amountCents);
      if (!decision.ok) return { mode: "rejected" as const, reason: decision.reason };

      const offer = await tx.offer.create({
        data: {
          listingId,
          buyerId: user.id,
          amountCents,
          message: trimmedMessage,
          status: OfferStatus.PENDING
        }
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "offer.created",
          entity: "Offer",
          entityId: offer.id,
          metadata: { listingId, amountCents }
        }
      });

      return {
        mode: "created" as const,
        offerId: offer.id,
        sellerId: row.sellerId,
        sellerEmail: row.seller.email,
        listingTitle: listing.title,
        listingSlug: listing.slug
      };
    });

    if (result.mode === "created") {
      void createNotification({
        userId: result.sellerId,
        kind: "offer_received",
        title: "New offer received",
        body: `${user.displayName} made an offer on "${result.listingTitle}".`,
        linkUrl: `/listings/${result.listingSlug}`
      });
      void sendEmail({
        to: result.sellerEmail,
        subject: `New offer on ${result.listingTitle}`,
        text: `${user.displayName} made an offer on "${result.listingTitle}". Log in to review it.`,
        html: `<p><strong>${escapeHtml(user.displayName)}</strong> made an offer on <strong>${escapeHtml(result.listingTitle)}</strong>. <a href="/listings/${result.listingSlug}">Review the offer</a>.</p>`
      });
    }

    return result;
  } catch {
    return { mode: "error" as const };
  }
}

export async function acceptOfferForActor(actor: Actor, offerId: string) {
  if (!actor.isAuthenticated || (actor.role !== "SELLER" && actor.role !== "ADMIN")) {
    return { mode: "forbidden" as const };
  }

  try {
    const user = await ensureUserForActor(actor);
    const result = await serializableTransaction(async (tx) => {
      const offer = await tx.offer.findUnique({
        where: { id: offerId },
        include: offerActionInclude
      });
      if (!offer) return { mode: "missing" as const };
      if (!canManageSellerOffer(actor, user.id, offer)) return { mode: "forbidden" as const };
      if (offer.status !== OfferStatus.PENDING || offer.listing.status !== ListingStatus.ACTIVE) {
        return { mode: "rejected" as const };
      }

      await tx.offer.update({
        where: { id: offer.id },
        data: { status: OfferStatus.ACCEPTED }
      });
      await tx.offer.updateMany({
        where: {
          listingId: offer.listingId,
          id: { not: offer.id },
          status: OfferStatus.PENDING
        },
        data: { status: OfferStatus.DECLINED }
      });
      await tx.listing.update({
        where: { id: offer.listingId },
        data: { status: ListingStatus.SOLD }
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "offer.accepted",
          entity: "Offer",
          entityId: offer.id,
          metadata: { listingId: offer.listingId, amountCents: offer.amountCents }
        }
      });

      return {
        mode: "accepted" as const,
        buyerId: offer.buyerId,
        buyerEmail: offer.buyer.email,
        buyerName: offer.buyer.displayName,
        listingTitle: offer.listing.title,
        listingSlug: offer.listing.slug
      };
    });

    if (result.mode === "accepted") {
      void createNotification({
        userId: result.buyerId,
        kind: "offer_accepted",
        title: "Offer accepted",
        body: `Your offer on "${result.listingTitle}" was accepted.`,
        linkUrl: `/listings/${result.listingSlug}`
      });
      void sendEmail({
        to: result.buyerEmail,
        subject: `Offer accepted: ${result.listingTitle}`,
        text: `Your offer on "${result.listingTitle}" was accepted. Log in to continue with the seller.`,
        html: `<p>Your offer on <strong>${escapeHtml(result.listingTitle)}</strong> was accepted. <a href="/listings/${result.listingSlug}">Open the listing</a>.</p>`
      });
    }

    return result;
  } catch {
    return { mode: "error" as const };
  }
}

export async function declineOfferForActor(actor: Actor, offerId: string) {
  if (!actor.isAuthenticated || (actor.role !== "SELLER" && actor.role !== "ADMIN")) {
    return { mode: "forbidden" as const };
  }

  try {
    const user = await ensureUserForActor(actor);
    const result = await serializableTransaction(async (tx) => {
      const offer = await tx.offer.findUnique({
        where: { id: offerId },
        include: offerActionInclude
      });
      if (!offer) return { mode: "missing" as const };
      if (!canManageSellerOffer(actor, user.id, offer)) return { mode: "forbidden" as const };
      if (offer.status !== OfferStatus.PENDING) return { mode: "rejected" as const };

      await tx.offer.update({
        where: { id: offer.id },
        data: { status: OfferStatus.DECLINED }
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "offer.declined",
          entity: "Offer",
          entityId: offer.id,
          metadata: { listingId: offer.listingId, amountCents: offer.amountCents }
        }
      });

      return {
        mode: "declined" as const,
        offerId: offer.id,
        buyerId: offer.buyerId,
        buyerEmail: offer.buyer.email,
        listingTitle: offer.listing.title,
        listingSlug: offer.listing.slug
      };
    });

    if (result.mode === "declined") {
      void createNotification({
        userId: result.buyerId,
        kind: "offer_declined",
        title: "Offer declined",
        body: `Your offer on "${result.listingTitle}" was declined.`,
        linkUrl: `/listings/${result.listingSlug}`
      });
      void sendEmail({
        to: result.buyerEmail,
        subject: `Offer declined: ${result.listingTitle}`,
        text: `Your offer on "${result.listingTitle}" was declined.`,
        html: `<p>Your offer on <strong>${escapeHtml(result.listingTitle)}</strong> was declined.</p>`
      });
    }

    return result;
  } catch {
    return { mode: "error" as const };
  }
}

export async function withdrawOfferForActor(actor: Actor, offerId: string) {
  if (!actor.isAuthenticated) return { mode: "forbidden" as const };

  try {
    const user = await ensureUserForActor(actor);
    const result = await serializableTransaction(async (tx) => {
      const offer = await tx.offer.findUnique({
        where: { id: offerId },
        include: offerActionInclude
      });
      if (!offer) return { mode: "missing" as const };
      if (offer.buyerId !== user.id) return { mode: "forbidden" as const };
      if (offer.status !== OfferStatus.PENDING) return { mode: "rejected" as const };

      await tx.offer.update({
        where: { id: offer.id },
        data: { status: OfferStatus.WITHDRAWN }
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "offer.withdrawn",
          entity: "Offer",
          entityId: offer.id,
          metadata: { listingId: offer.listingId, amountCents: offer.amountCents }
        }
      });

      return {
        mode: "withdrawn" as const,
        offerId: offer.id,
        sellerId: offer.listing.sellerId,
        sellerEmail: offer.listing.seller.email,
        listingTitle: offer.listing.title,
        listingSlug: offer.listing.slug
      };
    });

    if (result.mode === "withdrawn") {
      void createNotification({
        userId: result.sellerId,
        kind: "offer_withdrawn",
        title: "Offer withdrawn",
        body: `${user.displayName} withdrew an offer on "${result.listingTitle}".`,
        linkUrl: `/listings/${result.listingSlug}`
      });
      void sendEmail({
        to: result.sellerEmail,
        subject: `Offer withdrawn: ${result.listingTitle}`,
        text: `${user.displayName} withdrew an offer on "${result.listingTitle}".`,
        html: `<p><strong>${escapeHtml(user.displayName)}</strong> withdrew an offer on <strong>${escapeHtml(result.listingTitle)}</strong>.</p>`
      });
    }

    return result;
  } catch {
    return { mode: "error" as const };
  }
}

export async function watchListingForActor(actor: Actor, listingId: string) {
  if (!can(actor.role, "watchlist:update")) return { mode: "forbidden" as const };

  try {
    const user = await ensureUserForActor(actor);
    const item = await prisma.watchlistItem.upsert({
      where: { userId_listingId: { userId: user.id, listingId } },
      update: {},
      create: { userId: user.id, listingId }
    });

    return { mode: "created" as const, watchlistItemId: item.id };
  } catch {
    return { mode: "error" as const };
  }
}

export async function sendListingMessage(actor: Actor, listingId: string, body: string) {
  if (!can(actor.role, "message:create")) return { mode: "forbidden" as const };
  const trimmed = body.trim();
  if (!listingId || trimmed.length < 2 || trimmed.length > 1000) {
    return { mode: "invalid" as const };
  }

  try {
    const user = await ensureUserForActor(actor);
    const listing = await prisma.listing.findUnique({ where: { id: listingId }, include: { seller: true } });
    if (!listing) return { mode: "missing" as const };
    if (listing.sellerId === user.id) return { mode: "rejected" as const, reason: "Seller cannot message their own listing." };

    const conversation = await prisma.conversation.create({
      data: {
        listingId,
        subject: listing.title,
        participants: {
          create: [{ userId: user.id }, { userId: listing.sellerId }]
        },
        messages: {
          create: {
            senderId: user.id,
            body: trimmed
          }
        }
      }
    });

    if (listing.sellerId !== user.id) {
      void createNotification({
        userId: listing.sellerId,
        kind: "message_received",
        title: "New message",
        body: `${user.displayName} sent you a message about "${listing.title}".`,
        linkUrl: `/messages`
      });
      void sendEmail({
        to: listing.seller.email,
        subject: `Message about ${listing.title}`,
        text: `${user.displayName} sent you a message about "${listing.title}". Log in to reply.`,
        html: `<p><strong>${escapeHtml(user.displayName)}</strong> sent you a message about <strong>${escapeHtml(listing.title)}</strong>. <a href="/messages">Reply now</a>.</p>`
      });
    }

    return { mode: "created" as const, conversationId: conversation.id };
  } catch {
    return { mode: "error" as const };
  }
}

export async function sendConversationMessage(actor: Actor, conversationId: string, body: string) {
  if (!can(actor.role, "message:create")) return { mode: "forbidden" as const };

  const trimmed = body.trim();
  if (!conversationId || trimmed.length === 0 || trimmed.length > 2000) {
    return { mode: "invalid" as const };
  }

  try {
    const user = await ensureUserForActor(actor);
    return await prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.findUnique({
        where: { id: conversationId },
        include: {
          participants: { select: { userId: true } },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            include: { sender: { select: { role: true } } }
          }
        }
      });
      if (!conversation) return { mode: "missing" as const };

      const isParticipant = conversation.participants.some((participant) => participant.userId === user.id);
      if (!isParticipant && actor.role !== "ADMIN") {
        return { mode: "forbidden" as const };
      }

      if (actor.role === "ADMIN" && !isParticipant) {
        await tx.conversationParticipant.create({
          data: {
            conversationId,
            userId: user.id
          }
        });
      }

      const sentAt = new Date();
      const message = await tx.message.create({
        data: {
          conversationId,
          senderId: user.id,
          body: trimmed,
          createdAt: sentAt
        }
      });

      await tx.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() }
      });

      const previousMessage = conversation.messages[0];
      const sellerListing = conversation.listingId
        ? await tx.listing.findUnique({ where: { id: conversation.listingId }, select: { sellerId: true } })
        : null;
      if (
        sellerListing?.sellerId === user.id &&
        previousMessage?.sender.role === "BUYER"
      ) {
        await recordSellerResponseMetric(tx, user.id, previousMessage.createdAt, sentAt);
      }

      return { mode: "created" as const, messageId: message.id };
    });
  } catch {
    return { mode: "error" as const };
  }
}

export async function getSellerReviewEligibilityForActor(
  actor: Actor,
  listingId: string
): Promise<SellerReviewEligibility | null> {
  if (!actor.isAuthenticated || actor.role !== "BUYER") return null;

  try {
    const buyer = await ensureUserForActor(actor);
    const offer = await prisma.offer.findFirst({
      where: { listingId, buyerId: buyer.id, status: OfferStatus.ACCEPTED },
      include: { listing: { select: { seller: { select: { displayName: true } } } } },
      orderBy: { updatedAt: "desc" }
    });
    if (!offer) return null;

    const existing = await prisma.sellerReview.findUnique({
      where: { buyerId_listingId: { buyerId: buyer.id, listingId } },
      select: { id: true }
    });
    return {
      canReview: !existing,
      alreadyReviewed: Boolean(existing),
      sellerName: offer.listing.seller.displayName
    };
  } catch {
    return null;
  }
}

export async function createSellerReviewForActor(
  actor: Actor,
  input: { listingId: string; rating: number; comment?: string }
) {
  if (!actor.isAuthenticated || actor.role !== "BUYER" || !Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    return { mode: "forbidden" as const };
  }

  const comment = input.comment?.trim().slice(0, 500) || null;
  try {
    const buyer = await ensureUserForActor(actor);
    const result = await prisma.$transaction(async (tx) => {
      const offer = await tx.offer.findFirst({
        where: { listingId: input.listingId, buyerId: buyer.id, status: OfferStatus.ACCEPTED },
        include: { listing: { select: { sellerId: true, seller: { select: { displayName: true } } } } },
        orderBy: { updatedAt: "desc" }
      });
      if (!offer) return { mode: "ineligible" as const };

      const existing = await tx.sellerReview.findUnique({
        where: { buyerId_listingId: { buyerId: buyer.id, listingId: input.listingId } },
        select: { id: true }
      });
      if (existing) return { mode: "existing" as const };

      const review = await tx.sellerReview.create({
        data: {
          listingId: input.listingId,
          buyerId: buyer.id,
          sellerId: offer.listing.sellerId,
          rating: input.rating,
          comment
        }
      });
      const summary = await tx.sellerReview.aggregate({
        where: { sellerId: offer.listing.sellerId },
        _avg: { rating: true },
        _count: { _all: true }
      });
      await tx.user.update({
        where: { id: offer.listing.sellerId },
        data: {
          sellerRatingAverage: summary._avg.rating ?? null,
          sellerReviewCount: summary._count._all
        }
      });
      await tx.auditLog.create({
        data: { actorId: buyer.id, action: "seller_review.created", entity: "SellerReview", entityId: review.id, metadata: { listingId: input.listingId, rating: input.rating } }
      });

      return { mode: "created" as const, sellerId: offer.listing.sellerId, sellerName: offer.listing.seller.displayName };
    });

    if (result.mode === "created") {
      void createNotification({
        userId: result.sellerId,
        kind: "seller_review_received",
        title: "New seller review",
        body: `${buyer.displayName} left a ${input.rating}-star review after you accepted their offer.`,
        linkUrl: "/dashboard/seller"
      });
    }
    return result;
  } catch {
    return { mode: "error" as const };
  }
}

export function mapListingRow(row: ListingRow): Listing {
  const attributes = jsonRecord(row.attributes);
  const categorySlug = normalizeCategorySlug(row.category.slug);
  const endsAt = row.endsAt ?? (row.listingType === ListingType.AUCTION
    ? auctionEndDate(attributes.durationDays, row.publishedAt ?? row.createdAt)
    : undefined);
  const media = row.media.length
    ? row.media.map((item) => ({ url: normalizeStoredMediaUrl(item.url), alt: item.alt }))
    : [{ url: defaultMediaForCategory(categorySlug), alt: row.title }];

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    categorySlug,
    categoryName: row.category.name,
    hobbyName: stringAttribute(attributes.scope) === "components" ? "Components" : "Vehicles",
    condition: row.condition,
    listingType: row.listingType,
    status: row.status,
    priceCents: row.priceCents,
    reserveCents: row.reserveCents ?? undefined,
    buyNowCents: row.buyNowCents ?? undefined,
    currency: row.currency,
    location: row.location,
    publishedAt: (row.publishedAt ?? row.createdAt).toISOString(),
    endsAt: endsAt?.toISOString(),
    seller: {
      id: row.seller.id,
      displayName: row.seller.displayName,
      handle: row.seller.handle,
      rating: row.seller.sellerRatingAverage ?? null,
      reviewCount: row.seller.sellerReviewCount,
      responseTime: formatSellerResponseTime(row.seller.sellerResponseMinutes),
      location: row.location
    },
    media,
    attributes,
    stats: {
      bids: row._count.bids,
      watchers: row._count.watchlists,
      offers: row._count.offers
    }
  };
}

async function recordSellerResponseMetric(
  tx: Prisma.TransactionClient,
  sellerId: string,
  buyerMessageAt: Date,
  sellerReplyAt: Date
) {
  const delayMinutes = Math.max(1, Math.round((sellerReplyAt.getTime() - buyerMessageAt.getTime()) / 60_000));
  if (delayMinutes > 10_080) return;

  const seller = await tx.user.findUnique({
    where: { id: sellerId },
    select: { sellerResponseMinutes: true, sellerResponseSampleCount: true }
  });
  if (!seller) return;

  const sampleCount = seller.sellerResponseSampleCount;
  const nextSampleCount = sampleCount + 1;
  const nextAverage = Math.round(((seller.sellerResponseMinutes ?? 0) * sampleCount + delayMinutes) / nextSampleCount);
  await tx.user.update({
    where: { id: sellerId },
    data: {
      sellerResponseMinutes: nextAverage,
      sellerResponseSampleCount: nextSampleCount
    }
  });
}

export function formatSellerResponseTime(minutes: number | null) {
  if (minutes === null || minutes <= 0) return "No reply data yet";
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`;
}

export function auctionEndDate(value: unknown, startAt = new Date(), fallbackDays?: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  const durationDays = Number.isInteger(parsed) && parsed >= 1 && parsed <= 30
    ? parsed
    : fallbackDays;
  if (!durationDays) return undefined;

  return new Date(startAt.getTime() + durationDays * 86_400_000);
}

function mapComponentRow(row: ListingRow): ComponentListing | null {
  const attributes = jsonRecord(row.attributes);
  if (stringAttribute(attributes.scope) !== "components") return null;

  const categorySlug = normalizeCategorySlug(row.category.slug);
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    vt: stringAttribute(attributes.vehicleType) ?? categorySlug,
    ct: stringAttribute(attributes.componentType) ?? "all",
    condition: row.condition,
    priceCents: row.priceCents,
    location: row.location,
    stock: numberAttribute(attributes.stock) ?? 1,
    media: row.media[0] ? normalizeStoredMediaUrl(row.media[0].url) : defaultMediaForCategory(categorySlug)
  };
}

function mapCategoryRow(row: { id: string; slug: string; name: string; description: string | null; attributes: Prisma.JsonValue }): Category {
  const definition = categoryAttributes(row.attributes);
  return {
    id: row.id,
    slug: normalizeCategorySlug(row.slug),
    name: row.name,
    description: row.description ?? "",
    attributes: definition
  };
}

function mapBidRow(row: { id: string; listingId: string; bidderId: string; amountCents: number; status: BidStatus; createdAt: Date }): Bid {
  return {
    id: row.id,
    listingId: row.listingId,
    bidderId: row.bidderId,
    amountCents: row.amountCents,
    status: row.status,
    createdAt: row.createdAt.toISOString()
  };
}

function mapOfferRow(row: {
  id: string;
  listingId: string;
  buyerId: string;
  amountCents: number;
  status: OfferStatus;
  message: string | null;
  createdAt: Date;
  buyer?: { displayName: string } | null;
  listing?: {
    slug: string;
    title: string;
    sellerId: string;
    seller: { displayName: string };
  } | null;
}): Offer {
  return {
    id: row.id,
    listingId: row.listingId,
    buyerId: row.buyerId,
    amountCents: row.amountCents,
    status: row.status,
    message: row.message ?? undefined,
    createdAt: row.createdAt.toISOString(),
    listingTitle: row.listing?.title,
    listingSlug: row.listing?.slug,
    sellerId: row.listing?.sellerId,
    sellerName: row.listing?.seller.displayName,
    buyerName: row.buyer?.displayName
  };
}

function canManageSellerOffer(actor: Actor, userId: string, offer: OfferActionRow) {
  if (actor.role === "ADMIN") return true;
  return offer.listing.sellerId === userId;
}

function buildListingWhere(params: MarketplaceSearchParams): Prisma.ListingWhereInput {
  const category = params.category && params.category !== "all" ? params.category : undefined;
  const query = params.query?.trim();
  const condition = params.condition && params.condition !== "all" ? params.condition : undefined;
  const minPrice = validPrice(params.minPrice);
  const maxPrice = validPrice(params.maxPrice);

  return {
    status: ListingStatus.ACTIVE,
    deletedAt: null,
    ...(category
      ? {
          category: {
            slug: { in: [category, `rc-${category}`] }
          }
        }
      : {}),
    ...(condition ? { condition: { equals: condition, mode: "insensitive" } } : {}),
    ...(minPrice !== undefined || maxPrice !== undefined
      ? {
          priceCents: {
            ...(minPrice !== undefined ? { gte: minPrice * 100 } : {}),
            ...(maxPrice !== undefined ? { lte: maxPrice * 100 } : {})
          }
        }
      : {}),
    ...(query
      ? {
          OR: [
            { title: { contains: query, mode: "insensitive" } },
            { description: { contains: query, mode: "insensitive" } },
            { condition: { contains: query, mode: "insensitive" } },
            { seller: { displayName: { contains: query, mode: "insensitive" } } }
          ]
        }
      : {})
  };
}

function filterListings(items: Listing[], params: MarketplaceSearchParams) {
  const category = params.category && params.category !== "all" ? params.category : undefined;
  const query = params.query?.trim().toLowerCase();
  const condition = params.condition && params.condition !== "all" ? params.condition.toLowerCase() : undefined;
  const minPrice = validPrice(params.minPrice);
  const maxPrice = validPrice(params.maxPrice);

  return items.filter((listing) => {
    const inCategory = !category || listing.categorySlug === category;
    const inQuery =
      !query ||
      [listing.title, listing.description, listing.hobbyName, listing.categoryName, listing.seller.displayName]
        .join(" ")
        .toLowerCase()
        .includes(query);
    const inCondition = !condition || listing.condition.toLowerCase() === condition;
    const inMinPrice = minPrice === undefined || listing.priceCents >= minPrice * 100;
    const inMaxPrice = maxPrice === undefined || listing.priceCents <= maxPrice * 100;
    return inCategory && inQuery && inCondition && inMinPrice && inMaxPrice;
  });
}

export function filterComponentMarketplaceListings(
  items: ComponentListing[],
  params: MarketplaceSearchParams & { vehicleType?: string; componentType?: string }
) {
  const query = params.query?.trim().toLowerCase();
  const condition = params.condition && params.condition !== "all" ? params.condition.toLowerCase() : undefined;
  const minPrice = validPrice(params.minPrice);
  const maxPrice = validPrice(params.maxPrice);

  return items.filter((component) => {
    const inVehicle = !params.vehicleType || params.vehicleType === "all" || component.vt === params.vehicleType;
    const inType = !params.componentType || params.componentType === "all" || component.ct === params.componentType;
    const inQuery =
      !query || [component.title, component.condition, component.location].join(" ").toLowerCase().includes(query);
    const inCondition = !condition || component.condition.toLowerCase() === condition;
    const inMinPrice = minPrice === undefined || component.priceCents >= minPrice * 100;
    const inMaxPrice = maxPrice === undefined || component.priceCents <= maxPrice * 100;
    return inVehicle && inType && inQuery && inCondition && inMinPrice && inMaxPrice;
  });
}

function validPrice(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function sortListings(items: Listing[], sort: MarketplaceSearchParams["sort"] = "newest") {
  return [...items].sort((a, b) => {
    if (sort === "price-asc") return a.priceCents - b.priceCents;
    if (sort === "price-desc") return b.priceCents - a.priceCents;
    if (sort === "ending-soon") {
      return new Date(a.endsAt ?? "2999-01-01").getTime() - new Date(b.endsAt ?? "2999-01-01").getTime();
    }
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });
}

function sortComponents(items: ComponentListing[], sort: MarketplaceSearchParams["sort"] = "newest") {
  return [...items].sort((a, b) => {
    if (sort === "price-asc") return a.priceCents - b.priceCents;
    if (sort === "price-desc") return b.priceCents - a.priceCents;
    return a.title.localeCompare(b.title);
  });
}

async function uniqueListingSlug(title: string) {
  const base = slugifyListingTitle(title);
  const existing = await prisma.listing.findUnique({ where: { slug: base }, select: { id: true } });
  if (!existing) return base;
  return `${base}-${randomUUID().slice(0, 8)}`;
}

export function slugifyListingTitle(title: string) {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || `listing-${randomUUID().slice(0, 8)}`
  );
}

function jsonRecord(value: Prisma.JsonValue): Record<string, string | number | boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.entries(value).reduce<Record<string, string | number | boolean>>((acc, [key, raw]) => {
    if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") {
      acc[key] = raw;
    }
    return acc;
  }, {});
}

function categoryAttributes(value: Prisma.JsonValue): Category["attributes"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { required: [], optional: [] };
  const record = value as Record<string, unknown>;
  return {
    required: Array.isArray(record.required) ? record.required.filter((item): item is string => typeof item === "string") : [],
    optional: Array.isArray(record.optional) ? record.optional.filter((item): item is string => typeof item === "string") : []
  };
}

function auditMetadataSummary(value: Prisma.JsonValue) {
  if (!value || (typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0)) {
    return "No metadata";
  }

  if (typeof value !== "object") return String(value);

  return JSON.stringify(value);
}

function normalizeCategorySlug(slug: string) {
  return slug.replace(/^rc-/, "");
}

function stringAttribute(value: string | number | boolean | undefined) {
  return typeof value === "string" ? value : undefined;
}

function numberAttribute(value: string | number | boolean | undefined) {
  return typeof value === "number" ? value : undefined;
}

function normalizeVehicleType(value: string) {
  if (value === "drones" || value === "helis" || value === "planes" || value === "cars") return value;
  return "drones";
}

function incrementComponentCount(counts: Map<string, Map<string, number>>, family: string, componentType: string) {
  const familyCounts = counts.get(family);
  if (!familyCounts?.has(componentType)) return;
  familyCounts.set(componentType, (familyCounts.get(componentType) ?? 0) + 1);
}

function defaultMediaForCategory(categorySlug: string) {
  if (categorySlug === "helis") return "/media/heli-marketplace.svg";
  if (categorySlug === "planes") return "/media/plane-marketplace.svg";
  if (categorySlug === "cars") return "/media/car-marketplace.svg";
  return "/media/drone-marketplace.svg";
}

function formatShortTime(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric"
  }).format(date);
}

function walletTitleForRole(role: Role) {
  if (role === "SELLER") return "Credits & payouts";
  return "Credits & Wallet";
}

function rewardTierForBalance(role: Role, balanceCredits: number) {
  if (role === "ADMIN") return "Operator";
  if (role === "SELLER" && balanceCredits >= 1500) return "Verified Pro";
  if (balanceCredits >= 500) return "Builder";
  return "Member";
}

function mapWalletLedgerRow(row: CreditLedgerSummaryRow, now: Date): WalletLedgerItem {
  return {
    id: row.id,
    label: row.reason,
    amountCredits: row.amount,
    amountLabel: `${row.amount > 0 ? "+" : ""}${row.amount} cr`,
    at: formatLedgerDate(row.createdAt, now),
    tone: ledgerTone(row),
    statusLabel: row.status.toLowerCase()
  };
}

function ledgerTone(row: CreditLedgerSummaryRow): WalletLedgerItem["tone"] {
  if (row.status === "VOIDED") return "bad";
  if (row.status === "PENDING" || row.kind === "HOLD") return "warn";
  if (row.amount > 0) return "good";
  return "neutral";
}

function formatLedgerDate(date: Date, now: Date) {
  if (date.toDateString() === now.toDateString()) {
    return `Today ${new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date)}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";

  return formatShortTime(date);
}

function fallbackWalletSummary(role: Role): WalletSummary {
  const now = new Date("2026-06-09T12:00:00.000Z");

  if (role === "SELLER") {
    return buildWalletSummaryFromLedger(
      [
        {
          id: "fallback-credit-seller-payout",
          amount: 920,
          kind: "CREDIT",
          status: "POSTED",
          reason: "Verified seller payout credit",
          createdAt: new Date("2026-06-09T09:00:00.000Z")
        },
        {
          id: "fallback-credit-seller-boost",
          amount: -125,
          kind: "DEBIT",
          status: "POSTED",
          reason: "Featured Vehicles boost",
          createdAt: new Date("2026-06-08T12:30:00.000Z")
        },
        {
          id: "fallback-credit-seller-verify",
          amount: 1045,
          kind: "CREDIT",
          status: "POSTED",
          reason: "Inventory verification reward",
          createdAt: new Date("2026-06-04T16:00:00.000Z")
        }
      ],
      role,
      now
    );
  }

  if (role === "ADMIN") {
    return buildWalletSummaryFromLedger(
      [
        {
          id: "fallback-credit-admin-system",
          amount: 9999,
          kind: "CREDIT",
          status: "POSTED",
          reason: "Admin test allocation",
          createdAt: new Date("2026-06-01T09:00:00.000Z")
        }
      ],
      role,
      now
    );
  }

  return buildWalletSummaryFromLedger(
    [
      {
        id: "fallback-credit-buyer-bid-hold",
        amount: -33,
        kind: "HOLD",
        status: "POSTED",
        reason: "Bid hold - EVO Lite+",
        createdAt: new Date("2026-06-09T11:12:00.000Z")
      },
      {
        id: "fallback-credit-buyer-verify",
        amount: 120,
        kind: "CREDIT",
        status: "POSTED",
        reason: "Listing verification bonus",
        createdAt: new Date("2026-06-08T14:10:00.000Z")
      },
      {
        id: "fallback-credit-buyer-search",
        amount: -25,
        kind: "DEBIT",
        status: "POSTED",
        reason: "Saved search boost",
        createdAt: new Date("2026-06-08T09:00:00.000Z")
      },
      {
        id: "fallback-credit-buyer-start",
        amount: 480,
        kind: "CREDIT",
        status: "POSTED",
        reason: "Buyer starter credits",
        createdAt: new Date("2026-06-01T09:00:00.000Z")
      }
    ],
    role,
    now
  );
}

function emptyBuildWorkshop(note: string): BuildWorkshopData {
  return {
    title: "No saved build",
    vehicleType: "none",
    dryWeightGrams: 0,
    estimatedCostCents: 0,
    thrustRatio: "-",
    riskLevel: "None",
    note,
    parts: []
  };
}

function formatCompactDate(date: Date, now = new Date()) {
  if (date.toDateString() === now.toDateString()) {
    return new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";

  return new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date);
}

function emptyPricingEngineData(
  vehicleTypes: Array<{ id: string; name: string; count: number }>,
  selectedVehicleFamily: string
): PricingEngineData {
  return {
    vehicleTypes,
    selectedVehicleFamily,
    listingTitle: "",
    listingCondition: "",
    brand: "",
    model: "",
    scale: "",
    versionModelYear: "",
    batteryCells: 0,
    currentPriceCents: 0,
    comparableSales: [],
    guidance: { conservativeCents: 0, recommendedCents: 0, buyNowCents: 0 },
    note: "No active listing or accepted marketplace offers are available for this vehicle family yet."
  };
}

function buildPricingNote(currentPriceCents: number, guidance: PricingGuidance, comparableCount: number, currency = DEFAULT_APPLICATION_CURRENCY) {
  if (comparableCount === 0) {
    return "No accepted marketplace offers are available yet, so the estimate is based only on the entered asking price.";
  }

  if (currentPriceCents > guidance.recommendedCents) {
    return `${formatMoney(currentPriceCents, currency)} is above the accepted-offer average. Strong proof media, battery cycle counts, and service notes should support the asking price.`;
  }

  return `${formatMoney(currentPriceCents, currency)} is inside the accepted-offer range. Verified accessories and battery cycle counts support the recommended range.`;
}

function roundToNearestHundred(value: number) {
  return Math.round(value / 100) * 100;
}

// ── Admin service functions ───────────────────────────────────────────────────

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  handle: string;
  role: Role;
  status: "ACTIVE" | "SUSPENDED" | "CLOSED";
  createdAt: string;
  listingCount: number;
}

export interface AdminListingRow {
  id: string;
  slug: string;
  title: string;
  status: string;
  sellerName: string;
  priceCents: number;
  createdAt: string;
  categoryName: string;
}

export interface AdminCategoryRow extends Category {
  active: boolean;
  listingCount: number;
  createdAt: string;
}

export interface AdminAuditLogRow {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  actorName: string;
  actorEmail: string | null;
  actorRole: Role | "SYSTEM";
  metadataSummary: string;
  createdAt: string;
}

export async function listAdminUsers(): Promise<AdminUser[]> {
  try {
    const rows = await prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { listings: true } } }
    });
    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      displayName: row.displayName,
      handle: row.handle,
      role: row.role as Role,
      status: row.status as AdminUser["status"],
      createdAt: row.createdAt.toISOString(),
      listingCount: row._count.listings
    }));
  } catch {
    return [];
  }
}

export async function listAdminListings(): Promise<AdminListingRow[]> {
  try {
    const rows = await prisma.listing.findMany({
      where: { deletedAt: null },
      include: { seller: true, category: true },
      orderBy: { createdAt: "desc" }
    });
    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      status: row.status,
      sellerName: row.seller.displayName,
      priceCents: row.priceCents,
      createdAt: row.createdAt.toISOString(),
      categoryName: row.category.name
    }));
  } catch {
    return [];
  }
}

export async function listAdminCategories(): Promise<AdminCategoryRow[]> {
  try {
    const rows = await prisma.hobbyCategory.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      include: { _count: { select: { listings: true } } }
    });

    return rows.map((row) => ({
      ...mapCategoryRow(row),
      active: row.active,
      listingCount: row._count.listings,
      createdAt: row.createdAt.toISOString()
    }));
  } catch {
    return fallbackCategories.map((category) => ({
      ...category,
      active: true,
      listingCount: 0,
      createdAt: new Date(0).toISOString()
    }));
  }
}

export async function listAdminAuditLogs(limit = 100): Promise<AdminAuditLogRow[]> {
  try {
    const rows = await prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        actor: {
          select: {
            displayName: true,
            email: true,
            role: true
          }
        }
      }
    });

    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      entity: row.entity,
      entityId: row.entityId,
      actorName: row.actor?.displayName ?? "System",
      actorEmail: row.actor?.email ?? null,
      actorRole: (row.actor?.role as Role | undefined) ?? "SYSTEM",
      metadataSummary: auditMetadataSummary(row.metadata),
      createdAt: row.createdAt.toISOString()
    }));
  } catch {
    return [];
  }
}

export async function approveListingAsAdmin(
  actor: Actor,
  listingId: string
): Promise<{ mode: "approved" | "forbidden" | "missing" | "invalid" | "error" }> {
  if (!can(actor.role, "admin:moderate")) return { mode: "forbidden" };

  try {
    const adminUser = await ensureUserForActor(actor);
    const result = await serializableTransaction(async (tx) => {
      const row = await tx.listing.findUnique({
        where: { id: listingId },
        include: { seller: true }
      });
      if (!row) return { mode: "missing" as const };
      if (row.status !== ListingStatus.PENDING_REVIEW) return { mode: "invalid" as const };

      await tx.listing.update({
        where: { id: listingId },
        data: { status: ListingStatus.ACTIVE, publishedAt: new Date() }
      });

      await tx.moderationAction.create({
        data: {
          listingId,
          reviewerId: adminUser.id,
          action: "approved",
          notes: "Listing approved by admin"
        }
      });

      await tx.auditLog.create({
        data: {
          actorId: adminUser.id,
          action: "listing.approved",
          entity: "Listing",
          entityId: listingId
        }
      });

      await awardReward(tx, {
        userId: row.sellerId,
        type: "LISTING_APPROVED",
        sourceId: row.id,
        metadata: { listingId: row.id, listingSlug: row.slug }
      });

      return { mode: "approved" as const, row };
    });
    if (result.mode !== "approved") return result;
    const row = result.row;

    void createNotification({
      userId: row.sellerId,
      kind: "listing_approved",
      title: "Listing approved",
      body: `Your listing "${row.title}" has been approved and is now live.`,
      linkUrl: `/listings/${row.slug}`
    });
    void sendEmail({
      to: row.seller.email,
      subject: `Your listing "${row.title}" is now live`,
      text: `Good news — your listing "${row.title}" has been approved and is now live on the marketplace.`,
      html: `<p>Your listing <strong>${escapeHtml(row.title)}</strong> has been approved and is now <a href="/listings/${row.slug}">live on the marketplace</a>.</p>`
    });

    return { mode: "approved" };
  } catch {
    return { mode: "error" };
  }
}

export async function rejectListingAsAdmin(
  actor: Actor,
  listingId: string,
  reason: string
): Promise<{ mode: "rejected" | "forbidden" | "missing" | "invalid" | "error" }> {
  if (!can(actor.role, "admin:moderate")) return { mode: "forbidden" };

  try {
    const adminUser = await ensureUserForActor(actor);
    const row = await prisma.listing.findUnique({
      where: { id: listingId },
      include: { seller: true }
    });
    if (!row) return { mode: "missing" };
    if (row.status !== ListingStatus.PENDING_REVIEW && row.status !== ListingStatus.ACTIVE) return { mode: "invalid" };

    await prisma.listing.update({
      where: { id: listingId },
      data: { status: ListingStatus.REJECTED }
    });

    await prisma.moderationAction.create({
      data: {
        listingId,
        reviewerId: adminUser.id,
        action: "rejected",
        notes: reason || "Listing rejected by admin"
      }
    });

    await prisma.auditLog.create({
      data: {
        actorId: adminUser.id,
        action: "listing.rejected",
        entity: "Listing",
        entityId: listingId,
        metadata: { reason }
      }
    });

    void createNotification({
      userId: row.sellerId,
      kind: "listing_rejected",
      title: "Listing not approved",
      body: `Your listing "${row.title}" was not approved. Reason: ${reason || "See admin for details."}`,
      linkUrl: `/sell/new`
    });
    void sendEmail({
      to: row.seller.email,
      subject: `Your listing "${row.title}" was not approved`,
      text: `Unfortunately your listing "${row.title}" was not approved. Reason: ${reason || "Contact admin for details."}`,
      html: `<p>Your listing <strong>${escapeHtml(row.title)}</strong> was not approved. Reason: ${escapeHtml(reason || "Contact admin for details.")}</p>`
    });

    return { mode: "rejected" };
  } catch {
    return { mode: "error" };
  }
}

export async function resolveReportAsAdmin(
  actor: Actor,
  reportId: string,
  resolution: "RESOLVED" | "DISMISSED"
): Promise<{ mode: "ok" | "forbidden" | "missing" | "error" }> {
  if (!can(actor.role, "admin:moderate")) return { mode: "forbidden" };

  try {
    const row = await prisma.report.findUnique({ where: { id: reportId } });
    if (!row) return { mode: "missing" };

    await prisma.report.update({
      where: { id: reportId },
      data: { status: resolution, updatedAt: new Date() }
    });

    const adminUser = await ensureUserForActor(actor);
    await prisma.auditLog.create({
      data: {
        actorId: adminUser.id,
        action: `report.${resolution.toLowerCase()}`,
        entity: "Report",
        entityId: reportId
      }
    });

    return { mode: "ok" };
  } catch {
    return { mode: "error" };
  }
}

export async function updateUserRoleAsAdmin(
  actor: Actor,
  targetUserId: string,
  newRole: Role
): Promise<{ mode: "ok" | "forbidden" | "missing" | "error" }> {
  if (!can(actor.role, "admin:manage-users")) return { mode: "forbidden" };

  try {
    const adminUser = await ensureUserForActor(actor);
    if (adminUser.id === targetUserId && newRole !== "ADMIN") {
      return { mode: "forbidden" };
    }

    const target = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) return { mode: "missing" };

    await prisma.user.update({
      where: { id: targetUserId },
      data: { role: newRole as import("@prisma/client").UserRole }
    });

    await prisma.auditLog.create({
      data: {
        actorId: adminUser.id,
        action: "user.role_changed",
        entity: "User",
        entityId: targetUserId,
        metadata: { from: target.role, to: newRole }
      }
    });

    await syncClerkRole(target.clerkId, newRole as Exclude<Role, "VISITOR">);
    return { mode: "ok" };
  } catch {
    return { mode: "error" };
  }
}

export async function updateUserStatusAsAdmin(
  actor: Actor,
  targetUserId: string,
  newStatus: AdminUser["status"]
): Promise<{ mode: "ok" | "forbidden" | "missing" | "error" }> {
  if (!can(actor.role, "admin:manage-users")) return { mode: "forbidden" };

  try {
    const adminUser = await ensureUserForActor(actor);
    if (adminUser.id === targetUserId && newStatus !== "ACTIVE") {
      return { mode: "forbidden" };
    }

    const target = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) return { mode: "missing" };

    await prisma.user.update({
      where: { id: targetUserId },
      data: { status: newStatus as import("@prisma/client").UserStatus }
    });

    await prisma.auditLog.create({
      data: {
        actorId: adminUser.id,
        action: `user.${newStatus.toLowerCase()}`,
        entity: "User",
        entityId: targetUserId
      }
    });

    await syncClerkStatus(target.clerkId, newStatus);
    return { mode: "ok" };
  } catch {
    return { mode: "error" };
  }
}

export async function updateUserProfileAsAdmin(
  actor: Actor,
  targetUserId: string,
  input: { displayName: string; handle: string; email: string }
): Promise<{ mode: "ok" | "forbidden" | "missing" | "conflict" | "error" }> {
  if (!can(actor.role, "admin:manage-users")) return { mode: "forbidden" };

  try {
    const adminUser = await ensureUserForActor(actor);
    const target = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) return { mode: "missing" };

    const next = {
      displayName: input.displayName.trim(),
      handle: input.handle.trim().toLowerCase(),
      email: input.email.trim().toLowerCase()
    };

    const conflict = await prisma.user.findFirst({
      where: {
        id: { not: targetUserId },
        OR: [{ email: next.email }, { handle: next.handle }]
      },
      select: { id: true }
    });
    if (conflict) return { mode: "conflict" };

    await prisma.user.update({
      where: { id: targetUserId },
      data: next
    });

    await prisma.auditLog.create({
      data: {
        actorId: adminUser.id,
        action: "user.profile_updated",
        entity: "User",
        entityId: targetUserId,
        metadata: {
          displayNameChanged: target.displayName !== next.displayName,
          handleChanged: target.handle !== next.handle,
          emailChanged: target.email !== next.email
        }
      }
    });

    return { mode: "ok" };
  } catch {
    return { mode: "error" };
  }
}

export async function createCategoryAsAdmin(
  actor: Actor,
  input: { name: string; slug: string; description: string; parentId?: string }
): Promise<{ mode: "created" | "forbidden" | "conflict" | "error"; id?: string }> {
  if (!can(actor.role, "admin:manage-categories")) return { mode: "forbidden" };

  try {
    const existing = await prisma.hobbyCategory.findUnique({ where: { slug: input.slug } });
    if (existing) return { mode: "conflict" };

    const category = await prisma.hobbyCategory.create({
      data: {
        slug: input.slug,
        name: input.name,
        description: input.description,
        parentId: input.parentId ?? null,
        attributes: { required: ["brand", "model"], optional: [] }
      }
    });

    const adminUser = await ensureUserForActor(actor);
    await prisma.auditLog.create({
      data: {
        actorId: adminUser.id,
        action: "category.created",
        entity: "HobbyCategory",
        entityId: category.id
      }
    });

    return { mode: "created", id: category.id };
  } catch {
    return { mode: "error" };
  }
}

export async function updateCategoryAsAdmin(
  actor: Actor,
  categoryId: string,
  input: { name?: string; description?: string; active?: boolean }
): Promise<{ mode: "ok" | "forbidden" | "missing" | "error" }> {
  if (!can(actor.role, "admin:manage-categories")) return { mode: "forbidden" };

  try {
    const existing = await prisma.hobbyCategory.findUnique({ where: { id: categoryId } });
    if (!existing) return { mode: "missing" };

    await prisma.hobbyCategory.update({
      where: { id: categoryId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.active !== undefined ? { active: input.active } : {})
      }
    });

    const adminUser = await ensureUserForActor(actor);
    await prisma.auditLog.create({
      data: {
        actorId: adminUser.id,
        action: "category.updated",
        entity: "HobbyCategory",
        entityId: categoryId,
        metadata: input
      }
    });

    return { mode: "ok" };
  } catch {
    return { mode: "error" };
  }
}
