type SeededAccount = "buyer" | "seller" | "admin";
type SmokeRole = "buyer" | "seller" | "admin";

const baseUrl = new URL(process.env.SMOKE_BASE_URL ?? process.argv[2] ?? "http://127.0.0.1:3000");

const localSeededCredentials: Record<SeededAccount, { email: string; password: string }> = {
  buyer: { email: "buyer@ihobbyworld.local", password: "Buyer@123" },
  seller: { email: "seller@ihobbyworld.local", password: "Seller@123" },
  admin: { email: "admin@ihobbyworld.local", password: "Admin@123" }
};

type PageCheck = {
  name: string;
  path: string;
  expectedText: string;
  account?: SmokeRole;
};

const pageChecks: PageCheck[] = [
  { name: "home marketplace", path: "/", expectedText: "Marketplace" },
  { name: "marketplace alias", path: "/marketplace", expectedText: "Marketplace" },
  { name: "drones category page", path: "/categories/drones", expectedText: "Drones" },
  { name: "helicopters category page", path: "/categories/helis", expectedText: "Helicopters" },
  { name: "helicopters category alias", path: "/categories/helicopters", expectedText: "Helicopters" },
  { name: "planes category page", path: "/categories/planes", expectedText: "Planes" },
  { name: "cars category page", path: "/categories/cars", expectedText: "Cars" },
  { name: "listing detail", path: "/listings/autel-evo-lite-plus-fly-more-kit", expectedText: "Autel EVO Lite+" },
  { name: "buyer dashboard", path: "/dashboard/buyer", expectedText: "Buyer workspace", account: "buyer" },
  { name: "buyer watchlist", path: "/watchlist", expectedText: "Watchlist", account: "buyer" },
  { name: "buyer bids", path: "/bids", expectedText: "Bids", account: "buyer" },
  { name: "buyer offers", path: "/offers", expectedText: "Offers", account: "buyer" },
  { name: "buyer messages", path: "/messages", expectedText: "Messages", account: "buyer" },
  { name: "buyer notifications", path: "/notifications", expectedText: "Notification center", account: "buyer" },
  { name: "seller dashboard", path: "/dashboard/seller", expectedText: "Seller workspace", account: "seller" },
  { name: "seller listings", path: "/sell/listings", expectedText: "My listings", account: "seller" },
  { name: "seller listing form", path: "/sell/new", expectedText: "Create RC listing", account: "seller" },
  { name: "admin dashboard", path: "/dashboard/admin", expectedText: "Admin workspace", account: "admin" },
  { name: "admin listings", path: "/admin/listings", expectedText: "Listing moderation", account: "admin" },
  { name: "admin reports", path: "/admin/reports", expectedText: "Reports", account: "admin" },
  { name: "admin seller applications", path: "/admin/seller-applications", expectedText: "Seller applications", account: "admin" },
  { name: "admin users", path: "/admin/users", expectedText: "Members and roles", account: "admin" },
  { name: "admin categories", path: "/admin/categories", expectedText: "RC marketplace taxonomy", account: "admin" },
  { name: "admin audit", path: "/admin/audit", expectedText: "Platform audit log", account: "admin" }
];

function urlFor(path: string) {
  return new URL(path, baseUrl);
}

function seededCredentials(account: SeededAccount) {
  const prefix = `SMOKE_${account.toUpperCase()}_`;
  const email = process.env[`${prefix}EMAIL`];
  const password = process.env[`${prefix}PASSWORD`];
  if (email && password) return { email, password };

  if (baseUrl.hostname === "127.0.0.1" || baseUrl.hostname === "localhost") {
    return localSeededCredentials[account];
  }

  throw new Error(`Set ${prefix}EMAIL and ${prefix}PASSWORD before smoke testing a non-local environment.`);
}

async function fetchText(path: string, cookie?: string) {
  const response = await fetch(urlFor(path), {
    headers: cookie ? { cookie } : undefined
  });
  const text = await response.text();
  return { response, text };
}

async function signIn(account: SeededAccount) {
  const credentials = seededCredentials(account);
  const body = new FormData();
  body.set("email", credentials.email);
  body.set("password", credentials.password);
  const response = await fetch(urlFor("/api/auth/sign-in"), {
    method: "POST",
    body,
    redirect: "manual"
  });

  if (response.status === 403) {
    throw new Error("Password sign-in is disabled because Clerk is configured. Run browser-based production auth smoke checks instead.");
  }

  if (response.status !== 303) {
    throw new Error(`Credential sign-in for ${account} returned HTTP ${response.status}.`);
  }

  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const setCookie = headers.getSetCookie?.()[0] ?? response.headers.get("set-cookie");
  const cookie = setCookie?.split(";")[0];
  if (!cookie?.startsWith("ihw_session=")) {
    throw new Error(`Credential sign-in for ${account} did not return the expected session cookie.`);
  }
  return cookie;
}

async function registerSmokeBuyer() {
  const password = "SmokeBuyer@123";
  const body = new FormData();
  body.set("displayName", "Smoke Test Buyer");
  body.set("email", `smoke-buyer-${Date.now()}@ihobbyworld.local`);
  body.set("password", password);
  const response = await fetch(urlFor("/api/auth/register"), {
    method: "POST",
    body,
    redirect: "manual"
  });

  if (response.status === 403) {
    throw new Error("Password registration is disabled because Clerk is configured. Run browser-based production auth smoke checks instead.");
  }

  if (response.status !== 303) {
    throw new Error(`Smoke buyer registration returned HTTP ${response.status}.`);
  }

  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const setCookie = headers.getSetCookie?.()[0] ?? response.headers.get("set-cookie");
  const cookie = setCookie?.split(";")[0];
  if (!cookie?.startsWith("ihw_session=")) {
    throw new Error("Smoke buyer registration did not return the expected session cookie.");
  }
  return cookie;
}

async function checkPage(check: PageCheck, cookies: Record<SmokeRole, string>) {
  const { response, text } = await fetchText(check.path, check.account ? cookies[check.account] : undefined);

  if (response.status !== 200) {
    throw new Error(`${check.name} returned HTTP ${response.status}.`);
  }

  if (!text.includes(check.expectedText)) {
    throw new Error(`${check.name} did not include expected text "${check.expectedText}".`);
  }
}

async function checkJsonApi(path: string, options: RequestInit, assert: (payload: unknown, status: number) => void | Promise<void>) {
  const response = await fetch(urlFor(path), options);
  const payload = await response.json();
  await assert(payload, response.status);
}

function assertRecord(payload: unknown): asserts payload is Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Expected JSON object payload.");
  }
}

async function main() {
  const cookies: Record<SmokeRole, string> = {
    buyer: await registerSmokeBuyer(),
    seller: await signIn("seller"),
    admin: await signIn("admin")
  };

  for (const check of pageChecks) {
    await checkPage(check, cookies);
    console.log(`[ok] ${check.name}`);
  }

  await checkJsonApi("/api/health/database", {}, (payload, status) => {
    assertRecord(payload);
    if (status !== 200 || payload.connected !== true) {
      throw new Error(`Database health failed: ${JSON.stringify(payload)}`);
    }
    console.log("[ok] database health");
  });

  await checkJsonApi(
    "/api/health/readiness",
    { headers: { cookie: cookies.admin ?? "" } },
    (payload, status) => {
      assertRecord(payload);
      if (![200, 503].includes(status) || typeof payload.readyForNonPaymentLaunch !== "boolean") {
        throw new Error(`Readiness API returned an unexpected payload: ${JSON.stringify(payload)}`);
      }
      console.log("[ok] readiness health");
    }
  );

  await checkJsonApi(
    "/api/ai/pricing",
    {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookies.buyer ?? "" },
      body: JSON.stringify({
        title: "Smoke test RC drone",
        category: "drones",
        condition: "Used - Good condition",
        targetPriceCents: 45000,
        attributes: { brand: "Autel", model: "EVO Nano+" }
      })
    },
    (payload, status) => {
      assertRecord(payload);
      if (status !== 200 || typeof payload.text !== "string") {
        throw new Error(`AI pricing smoke failed: ${JSON.stringify(payload)}`);
      }
      console.log("[ok] AI pricing API");
    }
  );

  await checkJsonApi(
    "/api/notifications",
    {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookies.buyer ?? "" },
      body: JSON.stringify({})
    },
    (payload, status) => {
      assertRecord(payload);
      if (status !== 200 || payload.ok !== true) {
        throw new Error(`Notifications API smoke failed: ${JSON.stringify(payload)}`);
      }
      console.log("[ok] notifications API");
    }
  );

  console.log(`Smoke workflow checks passed for ${baseUrl.origin}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
