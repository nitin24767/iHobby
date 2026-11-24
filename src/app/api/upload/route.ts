import { NextResponse } from "next/server";
import { getCurrentActor } from "@/lib/auth";
import { hasExpectedImageSignature, isListingImageType } from "@/lib/file-signatures";
import { can } from "@/lib/rbac";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { generateStorageKey, uploadFile } from "@/lib/storage";

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

export async function POST(request: Request) {
  const actor = await getCurrentActor();
  if (!can(actor.role, "listing:create") && !can(actor.role, "listing:update:own")) {
    return NextResponse.json({ error: "Upload access requires seller permissions." }, { status: 403 });
  }

  const limited = rateLimit(`upload:${actor.id}`, 30, 60_000);
  if (!limited.allowed) {
    return NextResponse.json(
      { error: "Upload rate limit exceeded. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(limited)) } }
    );
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.startsWith("multipart/form-data")) {
    return NextResponse.json({ error: "Expected multipart/form-data upload." }, { status: 400 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Could not parse upload form." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file field found in form." }, { status: 400 });
  }

  if (!isListingImageType(file.type)) {
    return NextResponse.json(
      { error: `File type ${file.type} not allowed. Use JPEG, PNG, or WebP.` },
      { status: 400 }
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large. Maximum size is ${MAX_BYTES / 1024 / 1024} MB.` },
      { status: 413 }
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!hasExpectedImageSignature(file.type, bytes)) {
    return NextResponse.json(
      { error: "File contents do not match the declared image type." },
      { status: 400 }
    );
  }

  try {
    const key = generateStorageKey(file.name);
    const result = await uploadFile(file.stream(), key, file.type, file.size);
    return NextResponse.json({
      key: result.key,
      url: result.publicUrl,
      provider: result.provider,
      sizeBytes: result.sizeBytes
    });
  } catch (err) {
    console.error("[upload] Failed to save file:", err);
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }
}
