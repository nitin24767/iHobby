import type { ListingDraftInput } from "@/lib/validations/listing";

export const BULK_LISTING_COLUMNS = [
  "title",
  "description",
  "category",
  "condition",
  "listingType",
  "price",
  "reservePrice",
  "buyNowPrice",
  "location",
  "brand",
  "model",
  "images"
] as const;

export interface BulkListingCandidate {
  source: string;
  row: number;
  draft: ListingDraftInput;
  imageFiles: string[];
}

type Cell = unknown;
type RawRecord = Record<string, Cell>;

const aliases: Record<string, string[]> = {
  title: ["title", "listingtitle", "name"],
  description: ["description", "details", "listingdescription"],
  category: ["category", "categoryslug", "vehiclecategory"],
  condition: ["condition", "itemcondition"],
  listingType: ["listingtype", "type", "saletype"],
  price: ["price", "priceinr", "priceusd", "startprice", "startingprice"],
  priceCents: ["pricecents", "startpricecents"],
  reservePrice: ["reserveprice", "reserve", "reserveinr", "reserveusd"],
  reserveCents: ["reservecents", "reservepricecents"],
  buyNowPrice: ["buynowprice", "buynow", "buynowinr", "buynowusd"],
  buyNowCents: ["buynowcents", "buynowpricecents"],
  location: ["location", "city", "sellerlocation"],
  images: ["images", "imagefiles", "photos", "media"],
  brand: ["brand", "manufacturer"],
  model: ["model"],
  scope: ["scope"],
  componentType: ["componenttype", "parttype"],
  shipping: ["shipping", "shippingmethod"],
  durationDays: ["durationdays", "duration", "auctiondays"]
};

export async function parseXlsxBuffer(buffer: Buffer, source: string): Promise<BulkListingCandidate[]> {
  const { default: readXlsxFile } = await import("read-excel-file/node");
  const sheets = await readXlsxFile(buffer);
  const candidates: BulkListingCandidate[] = [];

  for (const sheet of sheets) {
    const [headerRow, ...rows] = sheet.data;
    if (!headerRow) continue;
    const headers = headerRow.map((cell) => cellText(cell));
    rows.forEach((cells, index) => {
      if (cells.every((cell) => cell === null || cellText(cell).trim() === "")) return;
      const record: RawRecord = {};
      headers.forEach((header, column) => {
        if (header) record[header] = cells[column] as Cell;
      });
      candidates.push(candidateFromRecord(record, `${source} / ${sheet.sheet}`, index + 2));
    });
  }

  return candidates;
}

export async function parsePdfBuffer(buffer: Buffer, source: string): Promise<BulkListingCandidate[]> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return parseLabeledPdfText(result.text, source);
  } finally {
    await parser.destroy();
  }
}

export function parseLabeledPdfText(text: string, source = "document.pdf"): BulkListingCandidate[] {
  const cleanText = text.replace(/^--\s*\d+\s+of\s+\d+\s*--$/gim, "").trim();
  if (!cleanText) return [];

  const explicitBlocks = cleanText.split(/\n\s*(?:---+|===+)\s*\n|\f/g).filter((block) => block.trim());
  const blocks = explicitBlocks.flatMap(splitAtRepeatedTitle);

  return blocks.map((block, index) => {
    const record: RawRecord = {};
    let activeKey = "";
    for (const rawLine of block.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      const match = /^([^:]{2,40}):\s*(.*)$/.exec(line);
      if (match) {
        activeKey = match[1].trim();
        record[activeKey] = match[2].trim();
      } else if (activeKey) {
        record[activeKey] = `${cellText(record[activeKey])} ${line}`.trim();
      }
    }
    return candidateFromRecord(record, source, index + 1);
  });
}

export function candidateFromRecord(record: RawRecord, source: string, row: number): BulkListingCandidate {
  const normalized = new Map<string, Cell>();
  for (const [key, value] of Object.entries(record)) normalized.set(normalizeHeader(key), value);

  const get = (field: keyof typeof aliases) => {
    for (const alias of aliases[field]) {
      if (normalized.has(alias)) return normalized.get(alias);
    }
    return undefined;
  };

  const attributes: Record<string, string | number | boolean> = {};
  for (const field of ["brand", "model", "scope", "componentType", "shipping"] as const) {
    const value = get(field);
    if (value !== undefined && value !== null && cellText(value).trim()) attributes[field] = primitive(value);
  }
  for (const [header, value] of Object.entries(record)) {
    const match = /^(?:attribute|attr)[._ -](.+)$/i.exec(header.trim());
    if (match && value !== undefined && value !== null && cellText(value).trim()) {
      attributes[toCamelCase(match[1])] = primitive(value);
    }
  }
  const duration = numberValue(get("durationDays"));
  attributes.scope ??= "vehicles";
  attributes.componentType ??= "all";
  attributes.shipping ??= "insured-ground";
  attributes.durationDays = duration && duration > 0 ? Math.round(duration) : 7;

  return {
    source,
    row,
    imageFiles: splitFileNames(get("images")),
    draft: {
      title: cellText(get("title")).trim(),
      description: cellText(get("description")).trim(),
      categorySlug: cellText(get("category")).trim().toLowerCase().replace(/^rc[\s-]+/, "").replace(/\s+/g, "-"),
      condition: cellText(get("condition")).trim(),
      listingType: listingType(get("listingType")),
      priceCents: moneyCents(get("priceCents") ?? get("price"), get("priceCents") !== undefined),
      reserveCents: optionalMoneyCents(get("reserveCents") ?? get("reservePrice"), get("reserveCents") !== undefined),
      buyNowCents: optionalMoneyCents(get("buyNowCents") ?? get("buyNowPrice"), get("buyNowCents") !== undefined),
      location: cellText(get("location")).trim(),
      attributes,
      mediaUrls: []
    }
  };
}

function splitAtRepeatedTitle(block: string) {
  const lines = block.split(/\r?\n/);
  const blocks: string[] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (/^\s*(?:title|listing\s*title)\s*:/i.test(line) && current.some((item) => /^\s*(?:title|listing\s*title)\s*:/i.test(item))) {
      blocks.push(current.join("\n"));
      current = [];
    }
    current.push(line);
  }
  if (current.some((line) => line.trim())) blocks.push(current.join("\n"));
  return blocks;
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function toCamelCase(value: string) {
  const words = value.trim().split(/[^a-zA-Z0-9]+/).filter(Boolean);
  return words.map((word, index) => index === 0 ? word.toLowerCase() : `${word[0]?.toUpperCase()}${word.slice(1).toLowerCase()}`).join("");
}

function cellText(value: Cell) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function primitive(value: Cell): string | number | boolean {
  if (typeof value === "number" || typeof value === "boolean") return value;
  return cellText(value).trim();
}

function numberValue(value: Cell) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(cellText(value).replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function moneyCents(value: Cell, alreadyCents: boolean) {
  const parsed = numberValue(value);
  return Math.round(alreadyCents ? parsed : parsed * 100);
}

function optionalMoneyCents(value: Cell, alreadyCents: boolean) {
  if (value === undefined || value === null || cellText(value).trim() === "") return undefined;
  return moneyCents(value, alreadyCents);
}

function listingType(value: Cell): ListingDraftInput["listingType"] {
  const normalized = normalizeHeader(cellText(value));
  if (["fixed", "fixedprice", "buynow"].includes(normalized)) return "FIXED_PRICE";
  if (["offer", "bestoffer", "offers"].includes(normalized)) return "OFFER";
  return "AUCTION";
}

function splitFileNames(value: Cell) {
  return Array.from(new Set(cellText(value).split(/[;,\n]/).map((name) => name.trim()).filter(Boolean)));
}
