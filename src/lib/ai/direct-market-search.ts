import type { PricingResearchInput, WebPricingComparable } from "@/lib/ai/pricing-research";

const allowedRetailDomains = [
  "amazon.in",
  "crazyrc.in",
  "desertcart.in",
  "flipkart.com",
  "havochobby.in",
  "nearbuystore.in",
  "ubuy.co.in"
];

interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

export interface DirectMarketResearch {
  summary: string;
  comparables: WebPricingComparable[];
}

export async function searchDirectMarketPricing(input: PricingResearchInput): Promise<DirectMarketResearch | null> {
  if (input.currency !== "INR") return null;
  const identity = productIdentity(input);
  const coreIdentity = productCoreIdentity(input);
  const qualifiers = [input.attributes.scale, input.attributes.versionModelYear]
    .filter((value): value is string | number => typeof value === "string" || typeof value === "number")
    .map(String)
    .join(" ");
  const queries = [
    `"${coreIdentity}" ${qualifiers} price India INR`,
    `"${coreIdentity}" BLX EXB buy online India`
  ];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  let htmlPages: string[];
  try {
    htmlPages = await Promise.all(queries.map(async (query) => {
      const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
        headers: { "user-agent": "Mozilla/5.0 (compatible; iHobbyWorld/1.0; +https://ihobbyworld.local)" },
        signal: controller.signal
      });
      return response.ok ? response.text() : "";
    }));
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }

  const seenUrls = new Set<string>();
  const candidates = htmlPages.flatMap(parseSearchResults)
    .filter((result) => matchesRequestedProduct(result, input))
    .filter((result) => isAllowedRetailUrl(result.url))
    .filter((result) => {
      if (seenUrls.has(result.url)) return false;
      seenUrls.add(result.url);
      return true;
    })
    .slice(0, 12);
  if (candidates.length === 0) return null;

  const resolved = await Promise.all(candidates.map(async (result, index) => {
    const snippetPrice = extractInrPrice(result.snippet);
    const price = snippetPrice ?? await fetchRetailPrice(result.url);
    if (!price) return null;
    return {
      id: `direct-${index}-${simpleHash(result.url)}`,
      title: result.title,
      condition: "New",
      priceCents: Math.round(price * 100),
      source: sourceName(result.url),
      url: result.url,
      priceType: "retail" as const
    } satisfies WebPricingComparable;
  }));
  const comparables: WebPricingComparable[] = resolved
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .slice(0, 6);
  if (comparables.length === 0) return null;

  return {
    summary: `Direct market search found ${comparables.length} current INR listing${comparables.length === 1 ? "" : "s"} matching ${identity}.`,
    comparables
  };
}

function parseSearchResults(html: string): SearchResult[] {
  return html.split(/class="result results_links[^\"]*"/i).slice(1).flatMap((block) => {
    const anchor = /class="result__a" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(block);
    if (!anchor) return [];
    const snippet = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i.exec(block)?.[1] ?? "";
    const url = unwrapDuckDuckGoUrl(decodeHtml(anchor[1]));
    if (!url) return [];
    return [{ title: textContent(anchor[2]), snippet: textContent(snippet), url }];
  });
}

function unwrapDuckDuckGoUrl(value: string) {
  try {
    const absolute = value.startsWith("//") ? `https:${value}` : value;
    const url = new URL(absolute);
    const target = url.hostname.endsWith("duckduckgo.com") ? url.searchParams.get("uddg") : absolute;
    if (!target) return null;
    const parsed = new URL(target);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function matchesRequestedProduct(result: SearchResult, input: PricingResearchInput) {
  const text = `${result.title} ${result.snippet}`.toLowerCase();
  const required = productTokens(input);
  if (required.length && required.some((token) => !text.includes(token))) return false;

  const title = result.title.toLowerCase();
  const accessory = /\b(body|shell|tyres?|tires?|wheels?|chassis|bumper|wing|arms?|upgrade parts?)\b/.test(title);
  const completeVehicle = /\b(rtr|truck|truggy|car|vehicle|monster truck)\b/.test(title);
  return !accessory || completeVehicle;
}

function productTokens(input: PricingResearchInput) {
  const brand = typeof input.attributes.brand === "string" ? input.attributes.brand : "";
  const model = typeof input.attributes.model === "string" ? input.attributes.model : input.title;
  return `${brand} ${model}`.toLowerCase().match(/[a-z0-9]+/g)?.filter((token) => token.length >= 2 && !["rc", "car", "model"].includes(token)) ?? [];
}

function productIdentity(input: PricingResearchInput) {
  const parts = [input.attributes.brand, input.attributes.model, input.attributes.scale, input.attributes.versionModelYear]
    .filter((value): value is string | number => typeof value === "string" || typeof value === "number")
    .map(String)
    .map((value) => value.trim())
    .filter(Boolean);
  return parts.length >= 2 ? parts.join(" ") : input.title.trim();
}

function productCoreIdentity(input: PricingResearchInput) {
  const brand = typeof input.attributes.brand === "string" ? input.attributes.brand.trim() : "";
  const model = typeof input.attributes.model === "string" ? input.attributes.model.trim() : "";
  return brand && model ? `${brand} ${model}` : input.title.trim();
}

function isAllowedRetailUrl(value: string) {
  try {
    const hostname = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
    return allowedRetailDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

async function fetchRetailPrice(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; iHobbyWorld/1.0; +https://ihobbyworld.local)" },
      redirect: "follow",
      signal: controller.signal
    });
    if (!response.ok) return null;
    const html = (await response.text()).slice(0, 750_000);
    return extractStructuredInrPrice(html) ?? extractInrPrice(textContent(html));
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function extractStructuredInrPrice(html: string) {
  const patterns = [
    /"priceCurrency"\s*:\s*"INR"[\s\S]{0,300}?"price"\s*:\s*"?([\d,.]+)"?/gi,
    /"price"\s*:\s*"?([\d,.]+)"?[\s\S]{0,300}?"priceCurrency"\s*:\s*"INR"/gi,
    /property=["']product:price:amount["'][^>]*content=["']([\d,.]+)["']/gi
  ];
  for (const pattern of patterns) {
    const value = pattern.exec(html)?.[1];
    const price = parsePrice(value);
    if (price) return price;
  }
  return null;
}

function extractInrPrice(text: string) {
  const matches = text.matchAll(/(?:₹|\bINR\b|\bRs\.?)(?:\s*[:.-]?\s*)([\d][\d,]*(?:\.\d{1,2})?)/gi);
  for (const match of matches) {
    const price = parsePrice(match[1]);
    if (price) return price;
  }
  return null;
}

function parsePrice(value: string | undefined) {
  if (!value) return null;
  const price = Number(value.replace(/,/g, ""));
  return Number.isFinite(price) && price >= 1_000 && price <= 5_000_000 ? price : null;
}

function sourceName(value: string) {
  const hostname = new URL(value).hostname.replace(/^www\./, "");
  return hostname.split(".")[0].replace(/(^|[-_])\w/g, (part) => part.toUpperCase());
}

function textContent(value: string) {
  return decodeHtml(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#x27;|&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
}

function simpleHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  return Math.abs(hash).toString(36);
}
