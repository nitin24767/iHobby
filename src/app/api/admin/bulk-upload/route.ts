import { NextResponse } from "next/server";
import { parsePdfBuffer, parseXlsxBuffer, type BulkListingCandidate } from "@/lib/bulk-listings";
import { getCurrentActor } from "@/lib/auth";
import {
  hasExpectedImageSignature,
  hasPdfSignature,
  hasZipSignature,
  isListingImageType,
  type ListingImageType
} from "@/lib/file-signatures";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { createListingFromDraft, listMarketplaceCategories } from "@/lib/server/marketplace";
import { generateStorageKey, uploadFile } from "@/lib/storage";
import { validateListingDraft } from "@/lib/validations/listing";

export const runtime = "nodejs";

const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;
const MAX_FILES = 31;
const MAX_RECORDS = 100;

type RecordResult = {
  source: string;
  row: number;
  title: string;
  status: "ready" | "invalid" | "created" | "failed";
  errors: string[];
  images: string[];
  listingId?: string;
  slug?: string;
};

export async function POST(request: Request) {
  const actor = await getCurrentActor();
  if (actor.role !== "ADMIN") {
    return NextResponse.json({ error: "Bulk upload is restricted to administrators." }, { status: 403 });
  }

  const limited = rateLimit(`admin-bulk-upload:${actor.id}`, 10, 60_000);
  if (!limited.allowed) {
    return NextResponse.json(
      { error: "Bulk upload rate limit exceeded. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(limited)) } }
    );
  }

  if (!(request.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
    return NextResponse.json({ error: "Expected a multipart file upload." }, { status: 400 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Could not parse the uploaded files." }, { status: 400 });
  }

  const mode = formData.get("mode") === "commit" ? "commit" : "preview";
  const files = formData.getAll("files").filter((value): value is File => value instanceof File && value.size > 0);
  if (files.length === 0) return NextResponse.json({ error: "Select at least one Excel or PDF source file." }, { status: 400 });
  if (files.length > MAX_FILES) return NextResponse.json({ error: `Upload at most ${MAX_FILES} files at a time.` }, { status: 400 });
  if (files.reduce((total, file) => total + file.size, 0) > MAX_TOTAL_BYTES) {
    return NextResponse.json({ error: "The combined upload exceeds 50 MB." }, { status: 413 });
  }

  const sources: File[] = [];
  const images: File[] = [];
  for (const file of files) {
    const kind = fileKind(file);
    if (kind === "source") {
      if (file.size > MAX_SOURCE_BYTES) return NextResponse.json({ error: `${file.name} exceeds the 10 MB source-file limit.` }, { status: 413 });
      sources.push(file);
    } else if (kind === "image") {
      if (file.size > MAX_IMAGE_BYTES) return NextResponse.json({ error: `${file.name} exceeds the 8 MB image limit.` }, { status: 413 });
      images.push(file);
    } else {
      return NextResponse.json({ error: `${file.name} is not a supported .xlsx, PDF, JPEG, PNG, or WebP file.` }, { status: 400 });
    }
  }
  if (sources.length === 0) return NextResponse.json({ error: "An .xlsx or PDF source file is required; images are matched as listing media." }, { status: 400 });

  try {
    const candidates = await parseSources(sources);
    if (candidates.length === 0) {
      return NextResponse.json({ error: "No listing records were found in the source files." }, { status: 400 });
    }
    if (candidates.length > MAX_RECORDS) {
      return NextResponse.json({ error: `The upload contains ${candidates.length} records; the limit is ${MAX_RECORDS}.` }, { status: 400 });
    }

    const imageMap = await verifiedImages(images);
    const categories = await listMarketplaceCategories();
    const prepared = candidates.map((candidate) => {
      const category = categories.find((item) => item.slug === candidate.draft.categorySlug || item.slug === `rc-${candidate.draft.categorySlug}`);
      const validation = validateListingDraft(candidate.draft, category);
      const errors = validation.success
        ? []
        : validation.error.issues.map((issue) => `${issue.path.join(".") || "record"}: ${issue.message}`);
      if (!category) errors.push(`categorySlug: Unknown or inactive category "${candidate.draft.categorySlug}".`);
      if (candidate.imageFiles.length > 8) errors.push("images: A listing can contain at most 8 images.");
      for (const imageName of candidate.imageFiles) {
        if (!imageMap.has(normalizeFileName(imageName))) errors.push(`images: ${imageName} was not included in this upload.`);
      }
      return { candidate, errors: Array.from(new Set(errors)) };
    });

    if (mode === "preview") {
      return NextResponse.json(responseBody(mode, prepared.map(({ candidate, errors }) => resultFor(candidate, errors))));
    }

    const uploadedUrls = new Map<string, string>();
    const results: RecordResult[] = [];
    for (const { candidate, errors } of prepared) {
      if (errors.length > 0) {
        results.push(resultFor(candidate, errors));
        continue;
      }
      try {
        const mediaUrls: string[] = [];
        for (const imageName of candidate.imageFiles) {
          const normalizedName = normalizeFileName(imageName);
          let url = uploadedUrls.get(normalizedName);
          if (!url) {
            const image = imageMap.get(normalizedName)!;
            const uploaded = await uploadFile(image.file.stream(), generateStorageKey(image.file.name), image.type, image.file.size);
            url = uploaded.publicUrl;
            uploadedUrls.set(normalizedName, url);
          }
          mediaUrls.push(url);
        }
        const created = await createListingFromDraft(actor, { ...candidate.draft, mediaUrls });
        if (created.mode === "created") {
          results.push({ ...resultFor(candidate, []), status: "created", listingId: created.listingId, slug: created.slug });
        } else {
          results.push({ ...resultFor(candidate, [creationError(created.mode)]), status: "failed" });
        }
      } catch {
        results.push({ ...resultFor(candidate, ["Listing or media creation failed."]), status: "failed" });
      }
    }

    return NextResponse.json(responseBody(mode, results));
  } catch (error) {
    console.error("[admin bulk upload]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Bulk upload processing failed." },
      { status: 400 }
    );
  }
}

async function parseSources(files: File[]) {
  const batches: BulkListingCandidate[][] = [];
  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    if (isXlsx(file)) {
      if (!hasZipSignature(buffer)) throw new Error(`${file.name} is not a valid .xlsx file.`);
      batches.push(await parseXlsxBuffer(buffer, file.name));
    } else {
      if (!hasPdfSignature(buffer)) throw new Error(`${file.name} is not a valid PDF file.`);
      batches.push(await parsePdfBuffer(buffer, file.name));
    }
  }
  return batches.flat();
}

async function verifiedImages(files: File[]) {
  const map = new Map<string, { file: File; type: ListingImageType }>();
  for (const file of files) {
    const type = imageType(file);
    if (!type) throw new Error(`${file.name} has an unsupported image type.`);
    const normalizedName = normalizeFileName(file.name);
    if (map.has(normalizedName)) throw new Error(`Image filename ${file.name} is duplicated.`);
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!hasExpectedImageSignature(type, bytes)) throw new Error(`${file.name} does not match its declared image type.`);
    map.set(normalizedName, { file, type });
  }
  return map;
}

function fileKind(file: File) {
  if (isXlsx(file) || isPdf(file)) return "source" as const;
  if (imageType(file)) return "image" as const;
  return "unsupported" as const;
}

function isXlsx(file: File) {
  return /\.xlsx$/i.test(file.name) || file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
}

function isPdf(file: File) {
  return /\.pdf$/i.test(file.name) || file.type === "application/pdf";
}

function imageType(file: File): ListingImageType | null {
  if (isListingImageType(file.type)) return file.type;
  if (/\.jpe?g$/i.test(file.name)) return "image/jpeg";
  if (/\.png$/i.test(file.name)) return "image/png";
  if (/\.webp$/i.test(file.name)) return "image/webp";
  return null;
}

function normalizeFileName(name: string) {
  return name.trim().replace(/^.*[\\/]/, "").toLowerCase();
}

function resultFor(candidate: BulkListingCandidate, errors: string[]): RecordResult {
  return {
    source: candidate.source,
    row: candidate.row,
    title: candidate.draft.title || "Untitled record",
    status: errors.length ? "invalid" : "ready",
    errors,
    images: candidate.imageFiles
  };
}

function responseBody(mode: "preview" | "commit", results: RecordResult[]) {
  return {
    mode,
    totals: {
      records: results.length,
      ready: results.filter((item) => item.status === "ready").length,
      invalid: results.filter((item) => item.status === "invalid").length,
      created: results.filter((item) => item.status === "created").length,
      failed: results.filter((item) => item.status === "failed").length
    },
    results
  };
}

function creationError(mode: string) {
  if (mode === "forbidden") return "Administrator no longer has listing creation access.";
  if (mode === "invalid") return "Listing failed server-side category validation.";
  return "Database creation failed.";
}
