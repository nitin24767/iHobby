export type ListingImageType = "image/jpeg" | "image/png" | "image/webp";

export const LISTING_IMAGE_TYPES: readonly ListingImageType[] = [
  "image/jpeg",
  "image/png",
  "image/webp"
];

export function isListingImageType(value: string): value is ListingImageType {
  return LISTING_IMAGE_TYPES.includes(value as ListingImageType);
}

export function hasExpectedImageSignature(contentType: ListingImageType, bytes: Uint8Array) {
  if (contentType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }

  if (contentType === "image/png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return bytes.length >= signature.length && signature.every((value, index) => bytes[index] === value);
  }

  return bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
}

export function hasPdfSignature(bytes: Uint8Array) {
  return bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
}

export function hasZipSignature(bytes: Uint8Array) {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b &&
    ((bytes[2] === 0x03 && bytes[3] === 0x04) ||
      (bytes[2] === 0x05 && bytes[3] === 0x06) ||
      (bytes[2] === 0x07 && bytes[3] === 0x08));
}
