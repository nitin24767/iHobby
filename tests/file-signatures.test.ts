import { describe, expect, it } from "vitest";
import { hasExpectedImageSignature, hasPdfSignature, hasZipSignature } from "@/lib/file-signatures";

describe("bulk upload file signatures", () => {
  it("recognizes supported image signatures", () => {
    expect(hasExpectedImageSignature("image/jpeg", new Uint8Array([0xff, 0xd8, 0xff]))).toBe(true);
    expect(hasExpectedImageSignature("image/png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
    expect(hasExpectedImageSignature("image/webp", new TextEncoder().encode("RIFF0000WEBP"))).toBe(true);
    expect(hasExpectedImageSignature("image/png", new TextEncoder().encode("not a png"))).toBe(false);
  });

  it("recognizes PDF and ZIP containers", () => {
    expect(hasPdfSignature(new TextEncoder().encode("%PDF-1.7"))).toBe(true);
    expect(hasZipSignature(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe(true);
    expect(hasPdfSignature(new TextEncoder().encode("PK zip"))).toBe(false);
  });
});
