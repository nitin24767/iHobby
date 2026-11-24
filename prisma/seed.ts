import { PrismaClient, UserRole } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";
import { hashPassword } from "../src/lib/server/passwords";

config();
config({ path: ".env.local", override: true });

const connectionString = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/ihobbyworld";
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString })
});

const seedNow = new Date();
const seedUsdToInrRate = 95.791;

function usdToInrMinor(usdCents: number) {
  return Math.round(usdCents * seedUsdToInrRate);
}

function daysFromNow(days: number, hour = 12, minute = 0) {
  const date = new Date(seedNow);
  date.setDate(seedNow.getDate() + days);
  date.setHours(hour, minute, 0, 0);
  return date;
}

function daysAgo(days: number, hour = 12, minute = 0) {
  return daysFromNow(-days, hour, minute);
}

const rcCategories = [
  {
    slug: "drones",
    name: "Drones",
    description: "Camera drones, FPV quads, cinewhoops, frames, motors, ESCs, packs, props, and video gear.",
    attributes: { required: ["brand", "model"], optional: ["flightTime", "batteryCount", "controller", "firmware", "airframe"] }
  },
  {
    slug: "helis",
    name: "Helicopters",
    description: "Electric and nitro helicopters, flybarless systems, blades, canopies, and spares.",
    attributes: { required: ["brand", "model"], optional: ["rotorSize", "powerSystem", "gyro", "bladeCondition"] }
  },
  {
    slug: "planes",
    name: "Planes",
    description: "Foamies, warbirds, gliders, balsa kits, servos, receivers, engines, and props.",
    attributes: { required: ["brand", "model"], optional: ["wingspan", "powerSystem", "radio", "airframeMaterial"] }
  },
  {
    slug: "cars",
    name: "Cars",
    description: "Crawlers, buggies, touring cars, drift builds, tires, shocks, diffs, ESCs, and batteries.",
    attributes: { required: ["brand", "model"], optional: ["scale", "drivetrain", "motor", "battery"] }
  }
] as const;

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("The development seed must not run in production. Create production users and marketplace data through controlled operational workflows.");
  }

  const adminPasswordHash = await hashPassword("Admin@123");
  const sellerPasswordHash = await hashPassword("Seller@123");
  const buyerPasswordHash = await hashPassword("Buyer@123");

  const admin = await prisma.user.upsert({
    where: { email: "admin@ihobbyworld.local" },
    update: { role: UserRole.ADMIN, displayName: "Admin Team", handle: "admin", passwordHash: adminPasswordHash },
    create: {
      email: "admin@ihobbyworld.local",
      displayName: "Admin Team",
      handle: "admin",
      passwordHash: adminPasswordHash,
      role: UserRole.ADMIN
    }
  });

  const seller = await prisma.user.upsert({
    where: { email: "seller@ihobbyworld.local" },
    update: { role: UserRole.SELLER, displayName: "Skywright Kit Co.", handle: "skywright", passwordHash: sellerPasswordHash },
    create: {
      email: "seller@ihobbyworld.local",
      displayName: "Skywright Kit Co.",
      handle: "skywright",
      passwordHash: sellerPasswordHash,
      role: UserRole.SELLER
    }
  });

  const buyer = await prisma.user.upsert({
    where: { email: "buyer@ihobbyworld.local" },
    update: { role: UserRole.BUYER, displayName: "Eliot Manning", handle: "eliot", passwordHash: buyerPasswordHash },
    create: {
      email: "buyer@ihobbyworld.local",
      displayName: "Eliot Manning",
      handle: "eliot",
      passwordHash: buyerPasswordHash,
      role: UserRole.BUYER
    }
  });

  await prisma.hobbyCategory.updateMany({
    where: { slug: { notIn: rcCategories.map((category) => category.slug) } },
    data: { active: false }
  });

  const categoryBySlug = new Map<string, string>();
  for (const category of rcCategories) {
    const row = await prisma.hobbyCategory.upsert({
      where: { slug: category.slug },
      update: {
        name: category.name,
        description: category.description,
        attributes: category.attributes,
        active: true
      },
      create: {
        slug: category.slug,
        name: category.name,
        description: category.description,
        attributes: category.attributes,
        active: true
      }
    });
    categoryBySlug.set(category.slug, row.id);
  }

  const autel = await upsertListing({
    sellerId: seller.id,
    categoryId: categoryBySlug.get("drones")!,
    slug: "autel-evo-lite-plus-fly-more-kit",
    title: "Autel EVO Lite+ - Fly More Kit",
    description: "Like-new camera drone with RC-2 controller, six batteries, ND filter set, case, spare props, charger, and verified flight logs.",
    condition: "Like new",
    listingType: "AUCTION",
    status: "ACTIVE",
    priceCents: usdToInrMinor(64200),
    reserveCents: usdToInrMinor(70000),
    buyNowCents: usdToInrMinor(82000),
    location: "Austin, TX",
    publishedAt: daysAgo(1, 15),
    endsAt: daysFromNow(5, 21),
    attributes: {
      scope: "vehicles",
      vehicleType: "drones",
      brand: "Autel",
      model: "EVO Lite+",
      flightTime: "40 min",
      batteryCount: 6,
      controller: "RC-2",
      firmware: "Current"
    },
    mediaUrl: "/media/drone-marketplace.svg",
    mediaUrls: [
      "/media/drone-marketplace.svg",
      "/media/camera-marketplace.svg",
      "/media/console-marketplace.svg",
      "/media/trainer-marketplace.svg",
      "/media/car-marketplace.svg",
      "/media/plane-marketplace.svg"
    ]
  });

  const heli = await upsertListing({
    sellerId: seller.id,
    categoryId: categoryBySlug.get("helis")!,
    slug: "goblin-770-competition-airframe",
    title: "Goblin 770 Competition - Airframe",
    description: "Large-scale helicopter airframe with carbon blades, canopy, tail assembly, KDE upgrades, and clean crash-free logs.",
    condition: "Excellent",
    listingType: "AUCTION",
    status: "ACTIVE",
    priceCents: usdToInrMinor(134000),
    reserveCents: usdToInrMinor(150000),
    location: "Phoenix, AZ",
    publishedAt: daysAgo(2, 16, 30),
    endsAt: daysFromNow(4, 19),
    attributes: {
      scope: "vehicles",
      vehicleType: "helis",
      brand: "SAB",
      model: "Goblin 770",
      rotorSize: "770",
      gyro: "VBar-ready",
      bladeCondition: "Clean"
    },
    mediaUrl: "/media/heli-marketplace.svg"
  });

  await upsertListing({
    sellerId: seller.id,
    categoryId: categoryBySlug.get("planes")!,
    slug: "eflite-p51-mustang-15e-warbird",
    title: "E-flite P-51 Mustang 1.5m Warbird",
    description: "Receiver-ready warbird with Spektrum servos, smart ESC, upgraded spinner, repaired hanger rash, and original box.",
    condition: "Very good",
    listingType: "FIXED_PRICE",
    status: "ACTIVE",
    priceCents: usdToInrMinor(52500),
    location: "Dayton, OH",
    publishedAt: daysAgo(3, 10, 10),
    attributes: {
      scope: "vehicles",
      vehicleType: "planes",
      brand: "E-flite",
      model: "P-51 Mustang 1.5m",
      wingspan: "1.5m",
      radio: "Spektrum",
      powerSystem: "Smart ESC"
    },
    mediaUrl: "/media/plane-marketplace.svg"
  });

  await upsertListing({
    sellerId: seller.id,
    categoryId: categoryBySlug.get("cars")!,
    slug: "traxxas-trx4-defender-crawler",
    title: "Traxxas TRX-4 Defender Crawler",
    description: "Trail-ready crawler with portal axles, brass upgrades, two LiPo packs, charger, scale accessories, and spare tires.",
    condition: "Good",
    listingType: "OFFER",
    status: "ACTIVE",
    priceCents: usdToInrMinor(41000),
    location: "Denver, CO",
    publishedAt: daysAgo(4, 18, 20),
    attributes: {
      scope: "vehicles",
      vehicleType: "cars",
      brand: "Traxxas",
      model: "TRX-4 Defender",
      scale: "1/10",
      drivetrain: "4WD",
      battery: "2 LiPo packs"
    },
    mediaUrl: "/media/car-marketplace.svg"
  });

  await upsertComponent({
    sellerId: seller.id,
    categoryId: categoryBySlug.get("drones")!,
    slug: "tmotor-f60-pro-v-2207-motor-set",
    title: "T-Motor F60 Pro V 2207 set",
    condition: "Excellent",
    priceCents: usdToInrMinor(11800),
    location: "Austin, TX",
    vehicleType: "drones",
    componentType: "motor",
    stock: 4,
    mediaUrl: "/media/drone-marketplace.svg"
  });

  await upsertComponent({
    sellerId: seller.id,
    categoryId: categoryBySlug.get("drones")!,
    slug: "speedybee-45a-4in1-esc",
    title: "SpeedyBee 45A 4-in-1 ESC",
    condition: "New",
    priceCents: usdToInrMinor(6900),
    location: "San Jose, CA",
    vehicleType: "drones",
    componentType: "esc",
    stock: 2,
    mediaUrl: "/media/drone-marketplace.svg"
  });

  await upsertComponent({
    sellerId: seller.id,
    categoryId: categoryBySlug.get("helis")!,
    slug: "sab-770-carbon-main-blades",
    title: "SAB 770 carbon main blades",
    condition: "Like new",
    priceCents: usdToInrMinor(17900),
    location: "Phoenix, AZ",
    vehicleType: "helis",
    componentType: "blade",
    stock: 1,
    mediaUrl: "/media/heli-marketplace.svg"
  });

  await upsertComponent({
    sellerId: seller.id,
    categoryId: categoryBySlug.get("planes")!,
    slug: "savox-metal-gear-servo-pair",
    title: "Savox metal gear servo pair",
    condition: "Tested",
    priceCents: usdToInrMinor(7800),
    location: "Dayton, OH",
    vehicleType: "planes",
    componentType: "servo",
    stock: 2,
    mediaUrl: "/media/plane-marketplace.svg"
  });

  await upsertComponent({
    sellerId: seller.id,
    categoryId: categoryBySlug.get("cars")!,
    slug: "proline-hyrax-tire-set",
    title: "Pro-Line Hyrax tire set",
    condition: "New",
    priceCents: usdToInrMinor(5400),
    location: "Denver, CO",
    vehicleType: "cars",
    componentType: "tire",
    stock: 6,
    mediaUrl: "/media/car-marketplace.svg"
  });

  await prisma.bid.upsert({
    where: { id: "seed-bid-1" },
    update: { listingId: autel.id, bidderId: buyer.id, amountCents: usdToInrMinor(64200), status: "WINNING" },
    create: { id: "seed-bid-1", listingId: autel.id, bidderId: buyer.id, amountCents: usdToInrMinor(64200), status: "WINNING" }
  });

  await prisma.bid.upsert({
    where: { id: "seed-bid-2" },
    update: { listingId: autel.id, bidderId: admin.id, amountCents: usdToInrMinor(62500), status: "OUTBID" },
    create: { id: "seed-bid-2", listingId: autel.id, bidderId: admin.id, amountCents: usdToInrMinor(62500), status: "OUTBID" }
  });

  await prisma.offer.upsert({
    where: { id: "seed-offer-1" },
    update: {
      listingId: heli.id,
      buyerId: buyer.id,
      amountCents: usdToInrMinor(124000),
      message: "Can arrange insured pickup if the blade set is included.",
      status: "PENDING"
    },
    create: {
      id: "seed-offer-1",
      listingId: heli.id,
      buyerId: buyer.id,
      amountCents: usdToInrMinor(124000),
      message: "Can arrange insured pickup if the blade set is included.",
      status: "PENDING"
    }
  });

  await prisma.watchlistItem.upsert({
    where: { userId_listingId: { userId: buyer.id, listingId: autel.id } },
    update: {},
    create: { userId: buyer.id, listingId: autel.id }
  });

  await seedConversation({
    id: "seed-conversation-autel-shipping",
    listingId: autel.id,
    subject: "Autel EVO Lite+ shipping",
    participantIds: [buyer.id, seller.id],
    messages: [
      {
        id: "seed-message-autel-ship-1",
        senderId: seller.id,
        body: "I can ship insured ground and include signature confirmation.",
        createdAt: new Date("2026-06-09T11:14:00.000Z")
      },
      {
        id: "seed-message-autel-ship-2",
        senderId: buyer.id,
        body: "Please confirm the kit includes the original charger and spare props.",
        createdAt: new Date("2026-06-09T11:16:00.000Z")
      },
      {
        id: "seed-message-autel-ship-3",
        senderId: seller.id,
        body: "Confirmed. I added a verification photo to the listing media.",
        createdAt: new Date("2026-06-09T11:20:00.000Z")
      }
    ]
  });

  await seedConversation({
    id: "seed-conversation-admin-serial-review",
    listingId: autel.id,
    subject: "Autel EVO Lite+ serial proof review",
    participantIds: [admin.id, seller.id],
    messages: [
      {
        id: "seed-message-admin-serial-1",
        senderId: admin.id,
        body: "Keep serial proof in private review media, not public listing copy.",
        createdAt: new Date("2026-06-09T12:05:00.000Z")
      },
      {
        id: "seed-message-admin-serial-2",
        senderId: seller.id,
        body: "Understood. I will keep the serial image available only for moderator review.",
        createdAt: new Date("2026-06-09T12:08:00.000Z")
      }
    ]
  });

  await seedCreditLedger(buyer.id, [
    { id: "seed-credit-buyer-bid-hold", amount: -33, kind: "HOLD", reason: "Bid hold - EVO Lite+", createdAt: new Date("2026-06-09T11:12:00.000Z") },
    { id: "seed-credit-buyer-verify", amount: 120, kind: "CREDIT", reason: "Listing verification bonus", createdAt: new Date("2026-06-08T14:10:00.000Z") },
    { id: "seed-credit-buyer-search", amount: -25, kind: "DEBIT", reason: "Saved search boost", createdAt: new Date("2026-06-08T09:00:00.000Z") },
    { id: "seed-credit-buyer-start", amount: 480, kind: "CREDIT", reason: "Buyer starter credits", createdAt: new Date("2026-06-01T09:00:00.000Z") }
  ]);

  await seedCreditLedger(seller.id, [
    { id: "seed-credit-seller-payout", amount: 920, kind: "CREDIT", reason: "Verified seller payout credit", createdAt: new Date("2026-06-09T09:00:00.000Z") },
    { id: "seed-credit-seller-boost", amount: -125, kind: "DEBIT", reason: "Featured Vehicles boost", createdAt: new Date("2026-06-08T12:30:00.000Z") },
    { id: "seed-credit-seller-verify", amount: 1045, kind: "CREDIT", reason: "Inventory verification reward", createdAt: new Date("2026-06-04T16:00:00.000Z") }
  ]);

  await seedCreditLedger(admin.id, [
    { id: "seed-credit-admin-system", amount: 9999, kind: "CREDIT", reason: "Admin test allocation", createdAt: new Date("2026-06-01T09:00:00.000Z") }
  ]);

  await seedLoyaltyEvents(buyer.id, [
    { id: "seed-loyalty-buyer-welcome", rewardKey: `ACCOUNT_CREATED:${buyer.id}`, points: 100, reason: "Welcome reward", createdAt: new Date("2026-06-01T09:00:00.000Z") }
  ]);
  await seedLoyaltyEvents(seller.id, [
    { id: "seed-loyalty-seller-welcome", rewardKey: `ACCOUNT_CREATED:${seller.id}`, points: 100, reason: "Welcome reward", createdAt: new Date("2026-06-01T09:00:00.000Z") },
    { id: "seed-loyalty-seller-approved", rewardKey: "SELLER_APPROVED:seed-seller-application", points: 300, reason: "Seller access approved", createdAt: new Date("2026-06-02T09:00:00.000Z") },
    { id: "seed-loyalty-seller-listing", rewardKey: `LISTING_APPROVED:${autel.id}`, points: 150, reason: "Listing approved", createdAt: new Date("2026-06-04T16:00:00.000Z") }
  ]);

  const build = await prisma.buildConfiguration.upsert({
    where: { id: "seed-build-freestyle-quad" },
    update: {
      ownerId: buyer.id,
      title: "5 inch freestyle quad",
      vehicleType: "drones",
      dryWeightGrams: 393,
      estimatedCostCents: usdToInrMinor(48700),
      thrustRatio: "6.2:1",
      riskLevel: "Low",
      note: "One thermal margin needs review before publishing."
    },
    create: {
      id: "seed-build-freestyle-quad",
      ownerId: buyer.id,
      title: "5 inch freestyle quad",
      vehicleType: "drones",
      dryWeightGrams: 393,
      estimatedCostCents: usdToInrMinor(48700),
      thrustRatio: "6.2:1",
      riskLevel: "Low",
      note: "One thermal margin needs review before publishing."
    }
  });

  await prisma.buildPart.deleteMany({ where: { buildId: build.id } });
  await prisma.buildPart.createMany({
    data: [
      { buildId: build.id, slot: "Frame", selected: "5 inch carbon quad frame", status: "Compatible", sortOrder: 0 },
      { buildId: build.id, slot: "Motor set", selected: "2207 1750KV brushless set", status: "Compatible", sortOrder: 1 },
      { buildId: build.id, slot: "ESC", selected: "45A 4-in-1 BLHeli32", status: "Review heat margin", sortOrder: 2 },
      { buildId: build.id, slot: "Battery", selected: "6S 1300mAh LiPo", status: "Compatible", sortOrder: 3 },
      { buildId: build.id, slot: "Camera", selected: "RunCam 4K nano", status: "Compatible", sortOrder: 4 }
    ]
  });

  await prisma.repairSession.upsert({
    where: { id: "seed-repair-arm-vibration" },
    update: {
      ownerId: buyer.id,
      title: "Arm vibration",
      vehicleType: "drones",
      lastSummary: "Motor shaft and arm check",
      issueNotes: "Motor arm vibration at high throttle after a light crash. Props replaced, issue remains.",
      advisorNote: "Start with motor bell runout, shaft alignment, arm delamination, and fastener compression. Do not list as crash-free until the repair note is attached.",
      checklist: [
        "Inspect motor bell and shaft alignment.",
        "Check arm delamination around fasteners.",
        "Log repair findings before listing for sale."
      ],
      status: "OPEN"
    },
    create: {
      id: "seed-repair-arm-vibration",
      ownerId: buyer.id,
      title: "Arm vibration",
      vehicleType: "drones",
      lastSummary: "Motor shaft and arm check",
      issueNotes: "Motor arm vibration at high throttle after a light crash. Props replaced, issue remains.",
      advisorNote: "Start with motor bell runout, shaft alignment, arm delamination, and fastener compression. Do not list as crash-free until the repair note is attached.",
      checklist: [
        "Inspect motor bell and shaft alignment.",
        "Check arm delamination around fasteners.",
        "Log repair findings before listing for sale."
      ],
      status: "OPEN"
    }
  });

  await prisma.repairSession.upsert({
    where: { id: "seed-repair-esc-desync" },
    update: {
      ownerId: buyer.id,
      title: "ESC desync",
      vehicleType: "drones",
      lastSummary: "Review logs and solder joints",
      issueNotes: "ESC desync at full throttle after motor swap.",
      advisorNote: "Inspect solder joints, motor timing, and BLHeli logs before replacing the ESC.",
      checklist: ["Check solder joints.", "Review BLHeli logs.", "Bench test motor timing."],
      status: "OPEN"
    },
    create: {
      id: "seed-repair-esc-desync",
      ownerId: buyer.id,
      title: "ESC desync",
      vehicleType: "drones",
      lastSummary: "Review logs and solder joints",
      issueNotes: "ESC desync at full throttle after motor swap.",
      advisorNote: "Inspect solder joints, motor timing, and BLHeli logs before replacing the ESC.",
      checklist: ["Check solder joints.", "Review BLHeli logs.", "Bench test motor timing."],
      status: "OPEN"
    }
  });

  await prisma.repairSession.upsert({
    where: { id: "seed-repair-tail-wag" },
    update: {
      ownerId: seller.id,
      title: "Tail wag",
      vehicleType: "helis",
      lastSummary: "Gyro gain and linkage play",
      issueNotes: "Tail wag after linkage replacement.",
      advisorNote: "Verify linkage play, tail blade balance, and gyro gain before flight.",
      checklist: ["Inspect tail linkage.", "Balance tail blades.", "Reduce gyro gain in small steps."],
      status: "OPEN"
    },
    create: {
      id: "seed-repair-tail-wag",
      ownerId: seller.id,
      title: "Tail wag",
      vehicleType: "helis",
      lastSummary: "Gyro gain and linkage play",
      issueNotes: "Tail wag after linkage replacement.",
      advisorNote: "Verify linkage play, tail blade balance, and gyro gain before flight.",
      checklist: ["Inspect tail linkage.", "Balance tail blades.", "Reduce gyro gain in small steps."],
      status: "OPEN"
    }
  });

  await seedPricingComparables(categoryBySlug.get("drones")!, [
    { id: "seed-comp-evo-4bat", title: "EVO Lite+ kit, 4 batteries", condition: "Very good", soldPriceCents: usdToInrMinor(61000), soldAt: new Date("2026-05-30T12:00:00.000Z") },
    { id: "seed-comp-evo-flymore", title: "EVO Lite+ fly more bundle", condition: "Like new", soldPriceCents: usdToInrMinor(69000), soldAt: new Date("2026-06-02T12:00:00.000Z") },
    { id: "seed-comp-evo-case", title: "EVO Lite+ with case", condition: "Good", soldPriceCents: usdToInrMinor(56000), soldAt: new Date("2026-05-24T12:00:00.000Z") }
  ]);

  await prisma.report.upsert({
    where: { id: "seed-report-1" },
    update: {
      listingId: autel.id,
      reporterId: admin.id,
      reason: "Needs serial verification",
      status: "OPEN"
    },
    create: {
      id: "seed-report-1",
      listingId: autel.id,
      reporterId: admin.id,
      reason: "Needs serial verification",
      status: "OPEN"
    }
  });

  await prisma.sellerApplication.upsert({
    where: { id: "seed-seller-application-1" },
    update: {
      applicantId: buyer.id,
      businessName: "Eliot's RC Bench",
      categoryFocus: "Drones, Cars, Components",
      experience: "Sells verified RC kits and components with serial proof and insured shipping.",
      status: "PENDING"
    },
    create: {
      id: "seed-seller-application-1",
      applicantId: buyer.id,
      businessName: "Eliot's RC Bench",
      categoryFocus: "Drones, Cars, Components",
      experience: "Sells verified RC kits and components with serial proof and insured shipping.",
      status: "PENDING"
    }
  });

  // Seed notifications for buyer account
  await prisma.notification.deleteMany({ where: { userId: buyer.id } });
  await prisma.notification.createMany({
    data: [
      {
        userId: buyer.id,
        kind: "bid_outbid",
        title: "You've been outbid",
        body: "Someone placed a higher bid on \"Autel EVO Lite+ Fly More Kit\". Bid again to stay in the lead.",
        linkUrl: "/listings/autel-evo-lite-plus-fly-more-kit",
        createdAt: new Date("2026-06-09T13:22:00.000Z")
      },
      {
        userId: buyer.id,
        kind: "offer_received",
        title: "New offer received",
        body: "A seller responded to your offer on the DJI FPV Combo.",
        linkUrl: "/offers",
        readAt: new Date("2026-06-09T10:00:00.000Z"),
        createdAt: new Date("2026-06-09T09:45:00.000Z")
      },
      {
        userId: buyer.id,
        kind: "message_received",
        title: "New message",
        body: "The seller replied to your question about the Traxxas Slash 4X4.",
        linkUrl: "/messages",
        readAt: new Date("2026-06-08T16:00:00.000Z"),
        createdAt: new Date("2026-06-08T15:30:00.000Z")
      }
    ]
  });

  // Seed notifications for seller account
  await prisma.notification.deleteMany({ where: { userId: seller.id } });
  await prisma.notification.createMany({
    data: [
      {
        userId: seller.id,
        kind: "offer_received",
        title: "New offer received",
        body: "A buyer made an offer on your Autel EVO Lite+ Fly More Kit listing.",
        linkUrl: "/listings/autel-evo-lite-plus-fly-more-kit",
        createdAt: new Date("2026-06-09T14:10:00.000Z")
      },
      {
        userId: seller.id,
        kind: "listing_approved",
        title: "Listing approved",
        body: "Your listing \"Align T-Rex 550 Electric\" is now live on the marketplace.",
        linkUrl: "/listings/align-t-rex-550-electric",
        readAt: new Date("2026-06-08T10:00:00.000Z"),
        createdAt: new Date("2026-06-08T09:00:00.000Z")
      }
    ]
  });

  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      action: "seed.completed",
      entity: "system",
      metadata: { version: "0.3.0", scope: "rc-marketplace" }
    }
  });
}

async function upsertListing(input: {
  sellerId: string;
  categoryId: string;
  slug: string;
  title: string;
  description: string;
  condition: string;
  listingType: "FIXED_PRICE" | "AUCTION" | "OFFER";
  status: "ACTIVE" | "PENDING_REVIEW";
  priceCents: number;
  reserveCents?: number;
  buyNowCents?: number;
  location: string;
  publishedAt: Date;
  endsAt?: Date;
  attributes: Record<string, string | number | boolean>;
  mediaUrl: string;
  mediaUrls?: string[];
}) {
  const listing = await prisma.listing.upsert({
    where: { slug: input.slug },
    update: {
      sellerId: input.sellerId,
      categoryId: input.categoryId,
      title: input.title,
      description: input.description,
      condition: input.condition,
      listingType: input.listingType,
      status: input.status,
      currency: "INR",
      priceCents: input.priceCents,
      reserveCents: input.reserveCents,
      buyNowCents: input.buyNowCents,
      location: input.location,
      publishedAt: input.publishedAt,
      endsAt: input.endsAt,
      attributes: input.attributes
    },
    create: {
      sellerId: input.sellerId,
      categoryId: input.categoryId,
      slug: input.slug,
      title: input.title,
      description: input.description,
      condition: input.condition,
      listingType: input.listingType,
      status: input.status,
      currency: "INR",
      priceCents: input.priceCents,
      reserveCents: input.reserveCents,
      buyNowCents: input.buyNowCents,
      location: input.location,
      publishedAt: input.publishedAt,
      endsAt: input.endsAt,
      attributes: input.attributes
    }
  });

  await prisma.listingMedia.deleteMany({ where: { listingId: listing.id } });
  const mediaUrls = input.mediaUrls?.length ? input.mediaUrls : [input.mediaUrl];
  await prisma.listingMedia.createMany({
    data: mediaUrls.map((url, index) => ({
      listingId: listing.id,
      url,
      alt: index === 0 ? input.title : `${input.title} photo ${index + 1}`,
      sortOrder: index
    }))
  });

  return listing;
}

async function upsertComponent(input: {
  sellerId: string;
  categoryId: string;
  slug: string;
  title: string;
  condition: string;
  priceCents: number;
  location: string;
  vehicleType: string;
  componentType: string;
  stock: number;
  mediaUrl: string;
}) {
  return upsertListing({
    sellerId: input.sellerId,
    categoryId: input.categoryId,
    slug: input.slug,
    title: input.title,
    description: `${input.title} for RC ${input.vehicleType}. Condition: ${input.condition}.`,
    condition: input.condition,
    listingType: "FIXED_PRICE",
    status: "ACTIVE",
    priceCents: input.priceCents,
    location: input.location,
    publishedAt: daysAgo(1, 12),
    attributes: {
      scope: "components",
      vehicleType: input.vehicleType,
      componentType: input.componentType,
      stock: input.stock
    },
    mediaUrl: input.mediaUrl
  });
}

async function seedCreditLedger(
  userId: string,
  entries: Array<{ id: string; amount: number; kind: "CREDIT" | "DEBIT" | "HOLD" | "RELEASE" | "PAYOUT"; reason: string; createdAt: Date }>
) {
  for (const entry of entries) {
    await prisma.creditLedgerEntry.upsert({
      where: { id: entry.id },
      update: {
        userId,
        amount: entry.amount,
        kind: entry.kind,
        reason: entry.reason,
        status: "POSTED",
        createdAt: entry.createdAt
      },
      create: {
        id: entry.id,
        userId,
        amount: entry.amount,
        kind: entry.kind,
        reason: entry.reason,
        status: "POSTED",
        createdAt: entry.createdAt
      }
    });
  }
}

async function seedLoyaltyEvents(
  userId: string,
  events: Array<{ id: string; rewardKey: string; points: number; reason: string; createdAt: Date }>
) {
  for (const event of events) {
    await prisma.loyaltyEvent.upsert({
      where: { rewardKey: event.rewardKey },
      update: {
        userId,
        points: event.points,
        reason: event.reason,
        createdAt: event.createdAt
      },
      create: {
        id: event.id,
        userId,
        points: event.points,
        reason: event.reason,
        rewardKey: event.rewardKey,
        createdAt: event.createdAt
      }
    });
  }
}

async function seedPricingComparables(
  categoryId: string,
  comps: Array<{ id: string; title: string; condition: string; soldPriceCents: number; soldAt: Date }>
) {
  for (const comp of comps) {
    await prisma.pricingComparable.upsert({
      where: { id: comp.id },
      update: {
        categoryId,
        title: comp.title,
        condition: comp.condition,
        soldPriceCents: comp.soldPriceCents,
        soldAt: comp.soldAt
      },
      create: {
        id: comp.id,
        categoryId,
        title: comp.title,
        condition: comp.condition,
        soldPriceCents: comp.soldPriceCents,
        soldAt: comp.soldAt
      }
    });
  }
}

async function seedConversation(input: {
  id: string;
  listingId: string;
  subject: string;
  participantIds: string[];
  messages: Array<{ id: string; senderId: string; body: string; createdAt: Date }>;
}) {
  const conversation = await prisma.conversation.upsert({
    where: { id: input.id },
    update: {
      listingId: input.listingId,
      subject: input.subject
    },
    create: {
      id: input.id,
      listingId: input.listingId,
      subject: input.subject
    }
  });

  await prisma.message.deleteMany({ where: { conversationId: conversation.id } });
  await prisma.conversationParticipant.deleteMany({ where: { conversationId: conversation.id } });
  await prisma.conversationParticipant.createMany({
    data: input.participantIds.map((userId) => ({
      conversationId: conversation.id,
      userId
    }))
  });
  await prisma.message.createMany({
    data: input.messages.map((message) => ({
      id: message.id,
      conversationId: conversation.id,
      senderId: message.senderId,
      body: message.body,
      createdAt: message.createdAt
    }))
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
