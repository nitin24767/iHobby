import type {
  Bid,
  Category,
  ConversationSummary,
  DashboardMetric,
  Listing,
  Offer,
  Report,
  Role,
  SellerApplication
} from "@/types/domain";

const demoNow = new Date();

function demoIsoDate(days: number, hour = 12, minute = 0) {
  const date = new Date(demoNow);
  date.setDate(demoNow.getDate() + days);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

export const rcScope = {
  sections: [
    { id: "vehicles", name: "Vehicles", count: 1204 },
    { id: "components", name: "Components", count: 2860 }
  ],
  vehicleTypes: [
    { id: "all", name: "All vehicles", count: 1204 },
    { id: "drones", name: "Drones", count: 412 },
    { id: "helis", name: "Helicopters", count: 178 },
    { id: "planes", name: "Planes", count: 296 },
    { id: "cars", name: "Cars", count: 318 }
  ],
  componentTypes: {
    all: [{ id: "all", name: "All components", count: 2860 }],
    drones: [
      { id: "all", name: "All", count: 1140 },
      { id: "motor", name: "Motors", count: 210 },
      { id: "esc", name: "ESCs", count: 96 },
      { id: "fc", name: "Flight controllers", count: 134 },
      { id: "frame", name: "Frames", count: 188 },
      { id: "vtx", name: "VTX / Video", count: 88 },
      { id: "cam", name: "Cameras", count: 72 },
      { id: "battery", name: "Batteries", count: 176 },
      { id: "prop", name: "Props", count: 114 }
    ],
    helis: [
      { id: "all", name: "All", count: 430 },
      { id: "blade", name: "Main/tail blades", count: 88 },
      { id: "motor", name: "Motors", count: 64 },
      { id: "esc", name: "ESCs / Governors", count: 52 },
      { id: "gyro", name: "Flybarless / Gyro", count: 41 },
      { id: "swash", name: "Swashplates", count: 36 },
      { id: "canopy", name: "Canopies", count: 58 },
      { id: "battery", name: "Batteries", count: 91 }
    ],
    planes: [
      { id: "all", name: "All", count: 610 },
      { id: "servo", name: "Servos", count: 142 },
      { id: "motor", name: "Motors", count: 98 },
      { id: "esc", name: "ESCs", count: 76 },
      { id: "prop", name: "Propellers / Spinners", count: 88 },
      { id: "rx", name: "Receivers", count: 110 },
      { id: "engine", name: "Gas / Glow engines", count: 96 }
    ],
    cars: [
      { id: "all", name: "All", count: 680 },
      { id: "motor", name: "Motors", count: 130 },
      { id: "esc", name: "ESCs", count: 88 },
      { id: "tire", name: "Tires / Wheels", count: 156 },
      { id: "shock", name: "Shocks / Suspension", count: 94 },
      { id: "diff", name: "Diffs / Drivetrain", count: 72 },
      { id: "chassis", name: "Chassis / Body", count: 80 },
      { id: "battery", name: "Batteries", count: 60 }
    ]
  } as Record<string, Array<{ id: string; name: string; count: number }>>
};

export const categories: Category[] = [
  {
    id: "cat-drones",
    slug: "drones",
    name: "Drones",
    description: "Camera drones, FPV quads, cinewhoops, frames, motors, ESCs, packs, props, and video gear.",
    attributes: {
      required: ["brand", "model"],
      optional: ["flightTime", "batteryCount", "controller", "firmware", "airframe"]
    }
  },
  {
    id: "cat-helis",
    slug: "helis",
    name: "Helicopters",
    description: "Electric and nitro helicopters, flybarless systems, blades, canopies, and spares.",
    attributes: {
      required: ["brand", "model"],
      optional: ["rotorSize", "powerSystem", "gyro", "bladeCondition"]
    }
  },
  {
    id: "cat-planes",
    slug: "planes",
    name: "Planes",
    description: "Foamies, warbirds, gliders, balsa kits, servos, receivers, engines, and props.",
    attributes: {
      required: ["brand", "model"],
      optional: ["wingspan", "powerSystem", "radio", "airframeMaterial"]
    }
  },
  {
    id: "cat-cars",
    slug: "cars",
    name: "Cars",
    description: "Crawlers, buggies, touring cars, drift builds, tires, shocks, diffs, ESCs, and batteries.",
    attributes: {
      required: ["brand", "model"],
      optional: ["scale", "drivetrain", "motor", "battery"]
    }
  }
];

const skywright = {
  id: "demo-seller",
  displayName: "Skywright Kit Co.",
  handle: "skywright",
  rating: null,
  reviewCount: 0,
  responseTime: "No reply data yet",
  location: "Austin, TX"
};

export const listings: Listing[] = [
  {
    id: "L-4821",
    slug: "autel-evo-lite-plus-fly-more-kit",
    title: "Autel EVO Lite+ - Fly More Kit",
    description:
      "Like-new camera drone with RC-2 controller, six batteries, ND filter set, case, spare props, charger, and verified flight logs.",
    categorySlug: "drones",
    categoryName: "Drones",
    hobbyName: "Vehicles",
    condition: "Like new",
    listingType: "AUCTION",
    status: "ACTIVE",
    priceCents: 64200,
    reserveCents: 70000,
    buyNowCents: 82000,
    currency: "INR",
    location: "Austin, TX",
    publishedAt: demoIsoDate(-1, 15),
    endsAt: demoIsoDate(5, 21),
    seller: skywright,
    media: [
      { url: "/media/drone-marketplace.svg", alt: "Autel EVO Lite+ Fly More Kit" },
      { url: "/media/camera-marketplace.svg", alt: "Autel EVO Lite+ camera detail" },
      { url: "/media/console-marketplace.svg", alt: "Autel EVO Lite+ controller" },
      { url: "/media/trainer-marketplace.svg", alt: "Autel EVO Lite+ kit accessories" },
      { url: "/media/car-marketplace.svg", alt: "Autel EVO Lite+ case" },
      { url: "/media/plane-marketplace.svg", alt: "Autel EVO Lite+ flight profile" }
    ],
    attributes: {
      brand: "Autel",
      model: "EVO Lite+",
      flightTime: "40 min",
      batteryCount: 6,
      controller: "RC-2",
      firmware: "Current"
    },
    stats: { bids: 18, watchers: 126, offers: 4 }
  },
  {
    id: "L-7700",
    slug: "goblin-770-competition-airframe",
    title: "Goblin 770 Competition - Airframe",
    description:
      "Large-scale helicopter airframe with carbon blades, canopy, tail assembly, KDE upgrades, and clean crash-free logs.",
    categorySlug: "helis",
    categoryName: "Helicopters",
    hobbyName: "Vehicles",
    condition: "Excellent",
    listingType: "AUCTION",
    status: "ACTIVE",
    priceCents: 134000,
    reserveCents: 150000,
    currency: "INR",
    location: "Phoenix, AZ",
    publishedAt: demoIsoDate(-2, 16, 30),
    endsAt: demoIsoDate(4, 19),
    seller: {
      id: "seller-heli",
      displayName: "Rotorhead Works",
      handle: "rotorhead",
      rating: null,
      reviewCount: 0,
      responseTime: "No reply data yet",
      location: "Phoenix, AZ"
    },
    media: [{ url: "/media/heli-marketplace.svg", alt: "Goblin helicopter airframe" }],
    attributes: {
      brand: "SAB",
      model: "Goblin 770",
      rotorSize: "770",
      gyro: "VBar-ready",
      bladeCondition: "Clean"
    },
    stats: { bids: 22, watchers: 88, offers: 2 }
  },
  {
    id: "L-P51",
    slug: "eflite-p51-mustang-15e-warbird",
    title: "E-flite P-51 Mustang 1.5m Warbird",
    description:
      "Receiver-ready warbird with Spektrum servos, smart ESC, upgraded spinner, repaired hanger rash, and original box.",
    categorySlug: "planes",
    categoryName: "Planes",
    hobbyName: "Vehicles",
    condition: "Very good",
    listingType: "FIXED_PRICE",
    status: "ACTIVE",
    priceCents: 52500,
    currency: "INR",
    location: "Dayton, OH",
    publishedAt: demoIsoDate(-3, 10, 10),
    seller: {
      id: "seller-plane",
      displayName: "Warbird Works",
      handle: "warbirdworks",
      rating: null,
      reviewCount: 0,
      responseTime: "No reply data yet",
      location: "Dayton, OH"
    },
    media: [{ url: "/media/plane-marketplace.svg", alt: "E-flite P-51 Mustang warbird" }],
    attributes: {
      brand: "E-flite",
      model: "P-51 Mustang 1.5m",
      wingspan: "1.5m",
      radio: "Spektrum",
      powerSystem: "Smart ESC"
    },
    stats: { bids: 0, watchers: 52, offers: 3 }
  },
  {
    id: "L-TRX",
    slug: "traxxas-trx4-defender-crawler",
    title: "Traxxas TRX-4 Defender Crawler",
    description:
      "Trail-ready crawler with portal axles, brass upgrades, two LiPo packs, charger, scale accessories, and spare tires.",
    categorySlug: "cars",
    categoryName: "Cars",
    hobbyName: "Vehicles",
    condition: "Good",
    listingType: "OFFER",
    status: "ACTIVE",
    priceCents: 41000,
    currency: "INR",
    location: "Denver, CO",
    publishedAt: demoIsoDate(-4, 18, 20),
    seller: {
      id: "seller-cars",
      displayName: "Trail Bench RC",
      handle: "trailbench",
      rating: null,
      reviewCount: 0,
      responseTime: "No reply data yet",
      location: "Denver, CO"
    },
    media: [{ url: "/media/car-marketplace.svg", alt: "Traxxas TRX-4 crawler" }],
    attributes: {
      brand: "Traxxas",
      model: "TRX-4 Defender",
      scale: "1/10",
      drivetrain: "4WD",
      battery: "2 LiPo packs"
    },
    stats: { bids: 0, watchers: 69, offers: 8 }
  }
];

export const componentListings = [
  {
    id: "C-2207",
    slug: "tmotor-f60-pro-v-2207-motor-set",
    title: "T-Motor F60 Pro V 2207 set",
    vt: "drones",
    ct: "motor",
    condition: "Excellent",
    priceCents: 11800,
    location: "Austin, TX",
    stock: 4,
    media: "/media/drone-marketplace.svg"
  },
  {
    id: "C-ESC45",
    slug: "speedybee-45a-4in1-esc",
    title: "SpeedyBee 45A 4-in-1 ESC",
    vt: "drones",
    ct: "esc",
    condition: "New",
    priceCents: 6900,
    location: "San Jose, CA",
    stock: 2,
    media: "/media/drone-marketplace.svg"
  },
  {
    id: "C-BLADE",
    slug: "sab-770-carbon-main-blades",
    title: "SAB 770 carbon main blades",
    vt: "helis",
    ct: "blade",
    condition: "Like new",
    priceCents: 17900,
    location: "Phoenix, AZ",
    stock: 1,
    media: "/media/heli-marketplace.svg"
  },
  {
    id: "C-SERVO",
    slug: "savox-metal-gear-servo-pair",
    title: "Savox metal gear servo pair",
    vt: "planes",
    ct: "servo",
    condition: "Tested",
    priceCents: 7800,
    location: "Dayton, OH",
    stock: 2,
    media: "/media/plane-marketplace.svg"
  },
  {
    id: "C-TIRE",
    slug: "proline-hyrax-tire-set",
    title: "Pro-Line Hyrax tire set",
    vt: "cars",
    ct: "tire",
    condition: "New",
    priceCents: 5400,
    location: "Denver, CO",
    stock: 6,
    media: "/media/car-marketplace.svg"
  }
];

export const bids: Bid[] = [
  {
    id: "bid-1",
    listingId: "L-4821",
    bidderId: "demo-buyer",
    amountCents: 64200,
    status: "WINNING",
    createdAt: "2026-06-09T09:10:00.000Z"
  },
  {
    id: "bid-2",
    listingId: "L-4821",
    bidderId: "buyer-2",
    amountCents: 62500,
    status: "OUTBID",
    createdAt: "2026-06-09T08:35:00.000Z"
  }
];

export const offers: Offer[] = [
  {
    id: "offer-1",
    listingId: "L-TRX",
    buyerId: "demo-buyer",
    amountCents: 38000,
    status: "PENDING",
    message: "Can pick up locally this weekend if the batteries are healthy.",
    createdAt: "2026-06-09T07:40:00.000Z"
  }
];

export const reports: Report[] = [
  {
    id: "rep-1",
    listingId: "L-4821",
    listingTitle: "Autel EVO Lite+ - Fly More Kit",
    reason: "Needs serial verification",
    status: "OPEN",
    submittedBy: "trust-system",
    createdAt: "2026-06-09T06:20:00.000Z"
  },
  {
    id: "rep-2",
    listingId: "L-7700",
    listingTitle: "Goblin 770 Competition - Airframe",
    reason: "High-value helicopter requires ownership proof",
    status: "REVIEWING",
    submittedBy: "pricing-system",
    createdAt: "2026-06-09T05:15:00.000Z"
  }
];

export const conversations: ConversationSummary[] = [
  {
    id: "conv-1",
    subject: "Autel EVO Lite+ shipping",
    listingTitle: "Autel EVO Lite+ - Fly More Kit",
    otherParty: "Skywright Kit Co.",
    lastMessage: "I can ship insured ground and include signature confirmation.",
    updatedAt: "11:14",
    unread: 2,
    messages: [
      {
        id: "conv-1-msg-1",
        senderId: "demo-seller",
        senderName: "Skywright Kit Co.",
        senderRole: "SELLER",
        body: "I can ship insured ground and include signature confirmation.",
        createdAt: "2026-06-09T11:14:00.000Z",
        sentAt: "Jun 9",
        isMine: false
      }
    ]
  },
  {
    id: "conv-2",
    subject: "P-51 servo check",
    listingTitle: "E-flite P-51 Mustang 1.5m Warbird",
    otherParty: "Warbird Works",
    lastMessage: "Aileron servo was bench-tested before shipping.",
    updatedAt: "Yesterday",
    unread: 0,
    messages: [
      {
        id: "conv-2-msg-1",
        senderId: "seller-plane",
        senderName: "Warbird Works",
        senderRole: "SELLER",
        body: "Aileron servo was bench-tested before shipping.",
        createdAt: "2026-06-08T11:14:00.000Z",
        sentAt: "Jun 8",
        isMine: false
      }
    ]
  }
];

export const sellerApplications: SellerApplication[] = [
  {
    id: "seller-app-1",
    applicantName: "Eliot Manning",
    applicantEmail: "buyer@ihobbyworld.local",
    businessName: "Eliot's RC Bench",
    categoryFocus: "Drones, Cars, Components",
    status: "PENDING",
    submittedAt: "2026-06-09T10:30:00.000Z"
  }
];

export function getListingBySlug(slug: string) {
  return listings.find((listing) => listing.slug === slug);
}

export function getCategoryBySlug(slug: string) {
  return categories.find((category) => category.slug === slug);
}

export function searchListings(query = "", categorySlug = "all") {
  const normalized = query.trim().toLowerCase();
  return listings.filter((listing) => {
    const inCategory = categorySlug === "all" || listing.categorySlug === categorySlug;
    const inQuery =
      normalized.length === 0 ||
      [listing.title, listing.description, listing.hobbyName, listing.categoryName, listing.seller.displayName]
        .join(" ")
        .toLowerCase()
        .includes(normalized);
    return inCategory && inQuery;
  });
}

export function getDashboardMetrics(role: Role): DashboardMetric[] {
  if (role === "SELLER") {
    return [
      { label: "Active listings", value: "6", delta: "+2 this week", tone: "good" },
      { label: "Pending offers", value: "18", delta: "9 need reply", tone: "warn" },
      { label: "Credits", value: "1,840", delta: "+134 cycle", tone: "good" },
      { label: "Response SLA", value: "21m", delta: "inside target", tone: "good" }
    ];
  }

  if (role === "ADMIN") {
    return [
      { label: "Open reports", value: "23", delta: "7 urgent", tone: "warn" },
      { label: "Listings reviewed", value: "318", delta: "+18%", tone: "good" },
      { label: "User risk holds", value: "7", delta: "-3 today", tone: "good" },
      { label: "AI jobs", value: "1.8k", delta: "99.2% success", tone: "good" }
    ];
  }

  return [
    { label: "Watched listings", value: "8", delta: "+4 new matches", tone: "good" },
    { label: "Active bids", value: "5", delta: "2 winning", tone: "good" },
    { label: "Credits", value: "542", delta: "33 bid holds", tone: "neutral" },
    { label: "Saved searches", value: "9", delta: "healthy alerts", tone: "neutral" }
  ];
}

export const marketplaceSummary = {
  activeListings: listings.length,
  totalWatchers: listings.reduce((sum, listing) => sum + listing.stats.watchers, 0),
  activeBids: bids.filter((bid) => bid.status === "ACTIVE" || bid.status === "WINNING").length,
  openReports: reports.filter((report) => report.status === "OPEN" || report.status === "REVIEWING").length
};
