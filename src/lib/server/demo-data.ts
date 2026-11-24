import { UserRole, UserStatus, type Prisma, type PrismaClient } from "@prisma/client";
import { hashPassword } from "./passwords";

type DemoDataClient = Pick<PrismaClient, "$transaction">;
type CategorySlug = "drones" | "helis" | "planes" | "cars";

export interface DemoDataEnvironment {
  DEPLOYMENT_MODE?: string;
  DEMO_SEED_DATA?: string;
  DEMO_BUYER_PASSWORD?: string;
  DEMO_SELLER_PASSWORD?: string;
  DEMO_TEST_ADMIN_PASSWORD?: string;
}

export interface DemoDataResult {
  status: "created" | "preserved";
  counts: Record<string, number>;
}

export class DemoDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DemoDataError";
  }
}

const markerId = "demo-v1-sample-data-marker";
const markerAction = "demo.sample-data.v1";
const categorySlugs: CategorySlug[] = ["drones", "helis", "planes", "cars"];
const fixtureMetadata = { fixture: "demo-v1", demo: true };
const accounts = [
  { id: "demo-v1-buyer", email: "buyer.demo@ihobbyworld.local", handle: "demo-v1-buyer", displayName: "Demo Buyer (test)", role: UserRole.BUYER, passwordKey: "DEMO_BUYER_PASSWORD" },
  { id: "demo-v1-seller", email: "seller.demo@ihobbyworld.local", handle: "demo-v1-seller", displayName: "Demo RC Seller (test)", role: UserRole.SELLER, passwordKey: "DEMO_SELLER_PASSWORD" },
  { id: "demo-v1-admin", email: "admin.demo@ihobbyworld.local", handle: "demo-v1-admin", displayName: "Demo Administrator (test)", role: UserRole.ADMIN, passwordKey: "DEMO_TEST_ADMIN_PASSWORD" }
] as const;

export function assertDemoDataEnabled(environment: DemoDataEnvironment) {
  if (environment.DEPLOYMENT_MODE !== "demo" || environment.DEMO_SEED_DATA !== "true") {
    throw new DemoDataError("Sample data requires DEPLOYMENT_MODE=demo and DEMO_SEED_DATA=true. Production data must never be seeded with demo fixtures.");
  }
}

function firstRunPasswords(environment: DemoDataEnvironment) {
  const passwords = accounts.map((account) => {
    const password = environment[account.passwordKey];
    if (
      !password || password.length < 12 || password.length > 128 ||
      !/[a-z]/.test(password) || !/[A-Z]/.test(password) ||
      !/[0-9]/.test(password) || !/[^A-Za-z0-9\s]/.test(password)
    ) {
      throw new DemoDataError(`${account.passwordKey} is required on the first run and must contain 12–128 characters with uppercase, lowercase, a number, and a symbol.`);
    }
    return password;
  });
  if (new Set(passwords).size !== accounts.length) {
    throw new DemoDataError("Supply a distinct password for each demo test account.");
  }
  return passwords;
}

function validMarker(row: { id: string; action: string; entity: string; entityId: string | null; metadata: Prisma.JsonValue }) {
  const metadata = row.metadata;
  return row.id === markerId && row.action === markerAction &&
    row.entity === "DemoFixtureSet" && row.entityId === "demo-v1" &&
    typeof metadata === "object" && metadata !== null && !Array.isArray(metadata) &&
    metadata.fixture === "demo-v1" && metadata.version === 1;
}

interface ListingFixture {
  key: string;
  title: string;
  category: CategorySlug;
  scope: "vehicles" | "components";
  listingType: "AUCTION" | "FIXED_PRICE" | "OFFER";
  priceRupees: number;
  image: string;
  brand: string;
  model: string;
  componentType?: string;
  pending?: boolean;
}

const listingFixtures: ListingFixture[] = [
  { key: "camera-drone-kit", title: "Autel EVO Lite+ camera drone kit", category: "drones", scope: "vehicles", listingType: "AUCTION", priceRupees: 60000, image: "drone-marketplace.svg", brand: "Autel", model: "EVO Lite+" },
  { key: "electric-helicopter", title: "Align T-Rex 550 electric helicopter", category: "helis", scope: "vehicles", listingType: "FIXED_PRICE", priceRupees: 42000, image: "heli-marketplace.svg", brand: "Align", model: "T-Rex 550" },
  { key: "trainer-plane", title: "E-flite RC trainer plane", category: "planes", scope: "vehicles", listingType: "FIXED_PRICE", priceRupees: 18500, image: "plane-marketplace.svg", brand: "E-flite", model: "Trainer" },
  { key: "trail-crawler", title: "Traxxas TRX-4 trail crawler", category: "cars", scope: "vehicles", listingType: "OFFER", priceRupees: 32000, image: "car-marketplace.svg", brand: "Traxxas", model: "TRX-4" },
  { key: "motor-set", title: "T-Motor 2207 brushless motor set", category: "drones", scope: "components", listingType: "FIXED_PRICE", priceRupees: 6800, image: "drone-marketplace.svg", brand: "T-Motor", model: "2207", componentType: "motor" },
  { key: "esc", title: "SpeedyBee 45A 4-in-1 ESC", category: "drones", scope: "components", listingType: "FIXED_PRICE", priceRupees: 4200, image: "drone-marketplace.svg", brand: "SpeedyBee", model: "45A", componentType: "esc" },
  { key: "heli-blades", title: "Carbon helicopter main blades", category: "helis", scope: "components", listingType: "FIXED_PRICE", priceRupees: 5200, image: "heli-marketplace.svg", brand: "Demo RC", model: "550 mm", componentType: "blade" },
  { key: "servo-pair", title: "Savox metal gear servo pair", category: "planes", scope: "components", listingType: "FIXED_PRICE", priceRupees: 3900, image: "plane-marketplace.svg", brand: "Savox", model: "Metal gear", componentType: "servo" },
  { key: "crawler-tires", title: "Crawler tire and wheel set", category: "cars", scope: "components", listingType: "FIXED_PRICE", priceRupees: 2800, image: "car-marketplace.svg", brand: "Demo RC", model: "1.9 inch", componentType: "tire" },
  { key: "pending-fpv-frame", title: "FPV frame awaiting moderation", category: "drones", scope: "components", listingType: "FIXED_PRICE", priceRupees: 2500, image: "drone-marketplace.svg", brand: "Demo RC", model: "5 inch frame", componentType: "frame", pending: true }
];

/**
 * Inserts one isolated demo fixture set. The audit marker and every fixture are
 * committed together, so a failed or colliding insert rolls back the whole set.
 * Once the marker exists, subsequent runs never reset passwords or interactions.
 * This does not import, call, or relax the legacy development seed.
 */
export async function seedDemoData(
  client: DemoDataClient,
  environment: DemoDataEnvironment,
  now = new Date()
): Promise<DemoDataResult> {
  assertDemoDataEnabled(environment);

  try {
    return await client.$transaction(async (tx): Promise<DemoDataResult> => {
      // Decode an integer, not PostgreSQL's void advisory-lock return value.
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(481010, 2)`;
      const markers = await tx.auditLog.findMany({
        where: { OR: [{ id: markerId }, { action: markerAction }] },
        take: 2,
        select: { id: true, action: true, entity: true, entityId: true, metadata: true }
      });
      if (markers.length) {
        if (markers.length !== 1 || !validMarker(markers[0])) {
          throw new DemoDataError("The reserved demo audit marker collides with existing data. No records will be claimed or overwritten.");
        }
        return { status: "preserved", counts: {} };
      }

      const passwords = firstRunPasswords(environment);
      const accountCollision = await tx.user.findFirst({
        where: { OR: [
          { id: { in: accounts.map((account) => account.id) } },
          { email: { in: accounts.map((account) => account.email), mode: "insensitive" } },
          { handle: { in: accounts.map((account) => account.handle), mode: "insensitive" } }
        ] },
        select: { id: true }
      });
      if (accountCollision) {
        throw new DemoDataError("A reserved demo account ID, email, or handle already exists. Existing users will not be promoted, reset, or overwritten.");
      }

      const categories = await tx.hobbyCategory.findMany({
        where: { slug: { in: categorySlugs } },
        select: { id: true, slug: true, active: true }
      });
      const categoryIds = new Map(categories.map((category) => [category.slug, category.id]));
      if (categorySlugs.some((slug) => !categories.some((category) => category.slug === slug && category.active))) {
        throw new DemoDataError("Demo fixtures require the four active RC categories from demo:bootstrap. Existing category settings are never changed by the data seed.");
      }

      const listingCollision = await tx.listing.findFirst({
        where: { OR: [
          { id: { in: listingFixtures.map((listing) => `demo-v1-listing-${listing.key}`) } },
          { slug: { in: listingFixtures.map((listing) => `demo-v1-${listing.key}`), mode: "insensitive" } }
        ] },
        select: { id: true }
      });
      if (listingCollision) {
        throw new DemoDataError("A reserved demo listing ID or slug already exists. Existing listings will not be claimed or overwritten.");
      }

      const users: Prisma.UserCreateManyInput[] = [];
      for (const [index, account] of accounts.entries()) {
        users.push({
          id: account.id,
          email: account.email,
          handle: account.handle,
          displayName: account.displayName,
          role: account.role,
          status: UserStatus.ACTIVE,
          passwordHash: await hashPassword(passwords[index])
        });
      }
      const buyerId = accounts[0].id;
      const sellerId = accounts[1].id;
      const adminId = accounts[2].id;
      const atDay = (days: number) => new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
      const listingId = (key: string) => `demo-v1-listing-${key}`;
      const listings: Prisma.ListingCreateManyInput[] = listingFixtures.map((listing) => ({
        id: listingId(listing.key),
        sellerId,
        categoryId: categoryIds.get(listing.category)!,
        slug: `demo-v1-${listing.key}`,
        title: `Demo: ${listing.title}`,
        description: `DEMO DATA ONLY. ${listing.title} is an illustrative RC marketplace example, not a real item for sale. The INR price is sample data; no payment or fulfilment is available.`,
        condition: "Very good",
        listingType: listing.listingType,
        status: listing.pending ? "PENDING_REVIEW" : "ACTIVE",
        priceCents: listing.priceRupees * 100,
        currency: "INR",
        location: "Demo location, Punjab, India",
        publishedAt: listing.pending ? null : atDay(-1),
        endsAt: listing.listingType === "AUCTION" ? atDay(7) : null,
        ...(listing.listingType === "AUCTION" ? { reserveCents: 6200000, buyNowCents: 6800000 } : {}),
        attributes: {
          ...fixtureMetadata,
          scope: listing.scope,
          vehicleType: listing.category,
          brand: listing.brand,
          model: listing.model,
          ...(listing.componentType ? { componentType: listing.componentType, stock: 2 } : {})
        }
      }));
      const media: Prisma.ListingMediaCreateManyInput[] = listingFixtures.map((listing) => ({
        id: `demo-v1-media-${listing.key}`,
        listingId: listingId(listing.key),
        url: `/media/${listing.image}`,
        alt: `Demo illustration: ${listing.title}`,
        sortOrder: 0
      }));
      media.push(
        { id: "demo-v1-media-drone-camera", listingId: listingId("camera-drone-kit"), url: "/media/camera-marketplace.svg", alt: "Demo illustration of the camera kit", sortOrder: 1 },
        { id: "demo-v1-media-drone-controller", listingId: listingId("camera-drone-kit"), url: "/media/console-marketplace.svg", alt: "Demo illustration of the controller", sortOrder: 2 }
      );

      const bids: Prisma.BidCreateManyInput[] = [
        { id: "demo-v1-bid-earlier", listingId: listingId("camera-drone-kit"), bidderId: adminId, amountCents: 5850000, status: "OUTBID", createdAt: atDay(-0.5) },
        { id: "demo-v1-bid-winning", listingId: listingId("camera-drone-kit"), bidderId: buyerId, amountCents: 6000000, status: "WINNING", createdAt: atDay(-0.25) }
      ];
      const offers: Prisma.OfferCreateManyInput[] = [{
        id: "demo-v1-offer-crawler", listingId: listingId("trail-crawler"), buyerId,
        amountCents: 3000000, message: "Demo offer only: can the sample crawler include the spare wheels?",
        status: "PENDING", expiresAt: atDay(7)
      }];
      const watchlist: Prisma.WatchlistItemCreateManyInput[] = [
        { id: "demo-v1-watch-drone", userId: buyerId, listingId: listingId("camera-drone-kit") },
        { id: "demo-v1-watch-plane", userId: buyerId, listingId: listingId("trainer-plane") }
      ];
      const conversations: Prisma.ConversationCreateManyInput[] = [
        { id: "demo-v1-conversation-buyer", listingId: listingId("camera-drone-kit"), subject: "Demo: drone kit questions" },
        { id: "demo-v1-conversation-review", listingId: listingId("pending-fpv-frame"), subject: "Demo: listing moderation review" }
      ];
      const participants: Prisma.ConversationParticipantCreateManyInput[] = [
        { id: "demo-v1-participant-buyer", conversationId: conversations[0].id!, userId: buyerId },
        { id: "demo-v1-participant-seller-buyer", conversationId: conversations[0].id!, userId: sellerId },
        { id: "demo-v1-participant-admin", conversationId: conversations[1].id!, userId: adminId },
        { id: "demo-v1-participant-seller-review", conversationId: conversations[1].id!, userId: sellerId }
      ];
      const messages: Prisma.MessageCreateManyInput[] = [
        { id: "demo-v1-message-buyer-1", conversationId: conversations[0].id!, senderId: buyerId, body: "Demo message: does the sample drone kit include a charger?", createdAt: atDay(-0.3) },
        { id: "demo-v1-message-seller-1", conversationId: conversations[0].id!, senderId: sellerId, body: "Demo reply: the example kit includes a charger and spare propellers. This is test inventory.", createdAt: atDay(-0.29) },
        { id: "demo-v1-message-buyer-2", conversationId: conversations[0].id!, senderId: buyerId, body: "Demo message: thank you. I will test the watchlist and bidding workflow.", createdAt: atDay(-0.28) },
        { id: "demo-v1-message-admin-1", conversationId: conversations[1].id!, senderId: adminId, body: "Demo moderation: please check the sample description before approving this listing.", createdAt: atDay(-0.2) },
        { id: "demo-v1-message-seller-2", conversationId: conversations[1].id!, senderId: sellerId, body: "Demo reply: the listing is labelled test data and ready for a moderation demonstration.", createdAt: atDay(-0.19) }
      ];
      const notifications: Prisma.NotificationCreateManyInput[] = [
        { id: "demo-v1-notification-buyer-bid", userId: buyerId, kind: "bid_winning", title: "Demo: your sample bid is leading", body: "Test bid only; no money is reserved or collected.", linkUrl: "/bids" },
        { id: "demo-v1-notification-buyer-message", userId: buyerId, kind: "message_received", title: "Demo: seller replied", body: "A sample seller reply is available in your test inbox.", linkUrl: "/messages" },
        { id: "demo-v1-notification-seller-offer", userId: sellerId, kind: "offer_received", title: "Demo: sample offer received", body: "Review the illustrative crawler offer to test accept or decline.", linkUrl: "/offers" },
        { id: "demo-v1-notification-seller-approved", userId: sellerId, kind: "listing_approved", title: "Demo: sample listings are visible", body: "Nine sample listings are available and one awaits moderation.", linkUrl: "/sell/listings" },
        { id: "demo-v1-notification-admin-message", userId: adminId, kind: "message_received", title: "Demo: moderation conversation", body: "The test seller has replied about the pending sample listing.", linkUrl: "/messages" }
      ];
      const credits: Prisma.CreditLedgerEntryCreateManyInput[] = [
        { id: "demo-v1-credit-buyer", userId: buyerId, amount: 1000, kind: "CREDIT", reason: "Demo test credits; no monetary value", metadata: fixtureMetadata },
        { id: "demo-v1-credit-buyer-used", userId: buyerId, amount: -25, kind: "DEBIT", reason: "Demo example debit; no payment", metadata: fixtureMetadata },
        { id: "demo-v1-credit-seller", userId: sellerId, amount: 1840, kind: "CREDIT", reason: "Demo seller credits; no monetary value", metadata: fixtureMetadata },
        { id: "demo-v1-credit-seller-used", userId: sellerId, amount: -125, kind: "DEBIT", reason: "Demo listing boost example; no payment", metadata: fixtureMetadata },
        { id: "demo-v1-credit-admin", userId: adminId, amount: 1000, kind: "CREDIT", reason: "Demo administrator test allocation; no monetary value", metadata: fixtureMetadata }
      ];
      const loyalty: Prisma.LoyaltyEventCreateManyInput[] = accounts.map((account) => ({
        id: `demo-v1-loyalty-${account.role.toLowerCase()}`, userId: account.id,
        points: 100, reason: "Demo welcome points; test data only", metadata: fixtureMetadata,
        rewardKey: `demo-v1-welcome-${account.role.toLowerCase()}`
      }));
      const builds: Prisma.BuildConfigurationCreateManyInput[] = [{
        id: "demo-v1-build-quad", ownerId: buyerId, title: "Demo: 5 inch freestyle quad",
        vehicleType: "drones", dryWeightGrams: 393, estimatedCostCents: 2850000,
        thrustRatio: "6.2:1", riskLevel: "Review", note: "Demo configuration and illustrative INR cost. Not a verified build or flight recommendation."
      }];
      const buildParts: Prisma.BuildPartCreateManyInput[] = [
        { id: "demo-v1-part-frame", buildId: builds[0].id!, slot: "Frame", selected: "Demo 5 inch carbon frame", status: "Compatible", sortOrder: 0 },
        { id: "demo-v1-part-motor", buildId: builds[0].id!, slot: "Motor set", selected: "Demo 2207 1750KV set", status: "Compatible", sortOrder: 1 },
        { id: "demo-v1-part-esc", buildId: builds[0].id!, slot: "ESC", selected: "Demo 45A 4-in-1 ESC", status: "Review heat margin", sortOrder: 2 },
        { id: "demo-v1-part-battery", buildId: builds[0].id!, slot: "Battery", selected: "Demo 6S 1300mAh pack", status: "Compatible", sortOrder: 3 },
        { id: "demo-v1-part-camera", buildId: builds[0].id!, slot: "Camera", selected: "Demo nano FPV camera", status: "Compatible", sortOrder: 4 }
      ];
      const repairs: Prisma.RepairSessionCreateManyInput[] = [
        { id: "demo-v1-repair-quad", ownerId: buyerId, title: "Demo: quad vibration", vehicleType: "drones", lastSummary: "Demo saved inspection checklist", issueNotes: "Demo scenario: vibration after a light impact.", advisorNote: "Illustrative checklist only. Verify the actual equipment before use.", checklist: ["Demo: inspect props with power disconnected.", "Demo: inspect the frame and motor fasteners.", "Demo: record findings before operating."], status: "OPEN" },
        { id: "demo-v1-repair-heli", ownerId: sellerId, title: "Demo: helicopter tail vibration", vehicleType: "helis", lastSummary: "Demo linkage and blade inspection", issueNotes: "Demo scenario: tail vibration after replacing a linkage.", advisorNote: "Illustrative saved notes only, not a completed diagnosis.", checklist: ["Demo: inspect linkage play.", "Demo: check blade condition.", "Demo: record the outcome for review."], status: "OPEN" }
      ];
      const pricingComparables: Prisma.PricingComparableCreateManyInput[] = [58000, 61000, 55000].map((price, index) => ({
        id: `demo-v1-comparable-${index + 1}`, categoryId: categoryIds.get("drones")!,
        title: `Demo: Autel EVO Lite+ sample comparable ${index + 1}`, condition: "Very good",
        soldPriceCents: price * 100, soldAt: atDay(-7 - index), attributes: { ...fixtureMetadata, currency: "INR", illustrative: true }
      }));
      // Historical examples are older than the request quota window, so users
      // keep their full daily allowance when trying the pricing tool.
      const pricingSearches: Prisma.PricingSearchCreateManyInput[] = [buyerId, sellerId].map((userId, index) => ({
        id: `demo-v1-pricing-search-${index + 1}`, userId, vehicleFamily: "drones",
        title: "Demo: saved camera drone price estimate", brand: "Autel", itemModel: "EVO Lite+",
        condition: "Very good", targetPriceCents: 6000000, currency: "INR", status: "COMPLETED",
        provider: "mock", providerModel: "demo-fixture", summary: "Demo history only; illustrative INR prices with no live web search or external AI call.",
        conservativeCents: 5500000, recommendedCents: 5800000, buyNowCents: 6100000,
        confidence: "Demo", evidenceCount: 0, webComparables: [], createdAt: atDay(-3), completedAt: atDay(-3)
      }));
      const reports: Prisma.ReportCreateManyInput[] = [{
        id: "demo-v1-report-description", listingId: listingId("camera-drone-kit"), reporterId: buyerId,
        reason: "Demo: review sample description", details: "Test moderation report only; no real seller complaint.", status: "OPEN"
      }];
      const applications: Prisma.SellerApplicationCreateManyInput[] = [{
        id: "demo-v1-seller-application", applicantId: buyerId,
        businessName: "Demo RC Workshop (test)", categoryFocus: "Drones, Cars, Components",
        experience: "Demo application for testing the seller approval workflow. No real business or identity verification is represented.",
        status: "PENDING", notes: "Demo sample data only."
      }];

      // Batched inserts keep the transaction short. No skipDuplicates, updates,
      // deletes, or upserts: any unexpected unique-ID collision aborts everything.
      await tx.user.createMany({ data: users });
      await tx.listing.createMany({ data: listings });
      await tx.listingMedia.createMany({ data: media });
      await tx.bid.createMany({ data: bids });
      await tx.offer.createMany({ data: offers });
      await tx.watchlistItem.createMany({ data: watchlist });
      await tx.conversation.createMany({ data: conversations });
      await tx.conversationParticipant.createMany({ data: participants });
      await tx.message.createMany({ data: messages });
      await tx.notification.createMany({ data: notifications });
      await tx.creditLedgerEntry.createMany({ data: credits });
      await tx.loyaltyEvent.createMany({ data: loyalty });
      await tx.buildConfiguration.createMany({ data: builds });
      await tx.buildPart.createMany({ data: buildParts });
      await tx.repairSession.createMany({ data: repairs });
      await tx.pricingComparable.createMany({ data: pricingComparables });
      await tx.pricingSearch.createMany({ data: pricingSearches });
      await tx.report.createMany({ data: reports });
      await tx.sellerApplication.createMany({ data: applications });

      const counts = {
        users: users.length, listings: listings.length, listingMedia: media.length,
        bids: bids.length, offers: offers.length, watchlistItems: watchlist.length,
        conversations: conversations.length, conversationParticipants: participants.length,
        messages: messages.length, notifications: notifications.length, creditLedgerEntries: credits.length,
        loyaltyEvents: loyalty.length, builds: builds.length, buildParts: buildParts.length,
        repairSessions: repairs.length, pricingComparables: pricingComparables.length,
        pricingSearches: pricingSearches.length, reports: reports.length, sellerApplications: applications.length,
        auditMarkers: 1
      };
      await tx.auditLog.create({
        data: {
          id: markerId, actorId: adminId, action: markerAction, entity: "DemoFixtureSet", entityId: "demo-v1",
          metadata: { ...fixtureMetadata, version: 1, counts }
        }
      });
      return { status: "created", counts };
    }, { maxWait: 10_000, timeout: 120_000 });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      throw new DemoDataError("A reserved demo record collides with existing data. The demo transaction was rolled back; no existing records were overwritten.");
    }
    throw error;
  }
}
