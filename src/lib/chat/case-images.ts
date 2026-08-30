/**
 * Shared photo rules for the farmer chat composer and /api/ai/case.
 * Farmer-facing messages stay non-technical; log details server-side.
 */

export const CASE_IMAGE_MAX_COUNT = 3;
export const CASE_IMAGE_MAX_BYTES = 8_000_000;
/** After compression, keep each photo well under typical host body limits. */
export const CASE_IMAGE_COMPRESSED_MAX_BYTES = 900_000;
export const CASE_IMAGE_ACCEPT =
  "image/jpeg,image/png,image/webp,image/heic,image/heif,image/*,.jpg,.jpeg,.png,.webp,.heic,.heif";

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
]);

export const FARMER_PHOTO_TOO_LARGE =
  "That photo is too large. Please try a smaller image.";
export const FARMER_PHOTO_UNSUPPORTED = "This file type isn’t supported.";
export const FARMER_PHOTO_UPLOAD_FAILED =
  "I couldn’t upload that photo. Please try again.";
export const FARMER_PHOTO_LIMIT = `You can attach up to ${CASE_IMAGE_MAX_COUNT} photos in one message.`;

export function isSupportedCaseImage(file: {
  name?: string;
  type?: string;
}): boolean {
  const type = (file.type || "").toLowerCase();
  if (type === "image/jpg") return true;
  if (ALLOWED_MIME.has(type)) return true;
  if (type === "image/*" || type === "image") return true;
  // Some mobile browsers omit type (especially HEIC from the iOS library).
  if (!type || type === "application/octet-stream") {
    return /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name || "");
  }
  return /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name || "");
}

export function validateCaseImageMeta(file: {
  name?: string;
  type?: string;
  size: number;
}): { ok: true } | { ok: false; farmerError: string; reason: string } {
  if (!isSupportedCaseImage(file)) {
    return {
      ok: false,
      farmerError: FARMER_PHOTO_UNSUPPORTED,
      reason: `unsupported_type:${file.type || "empty"}:${file.name || "unnamed"}`,
    };
  }
  if (file.size > CASE_IMAGE_MAX_BYTES) {
    return {
      ok: false,
      farmerError: FARMER_PHOTO_TOO_LARGE,
      reason: `too_large:${file.size}`,
    };
  }
  if (file.size === 0) {
    return {
      ok: false,
      farmerError: FARMER_PHOTO_UPLOAD_FAILED,
      reason: "empty_file",
    };
  }
  return { ok: true };
}

export function normalizeImageMimeType(
  mimeType: string,
  fileName?: string,
): string {
  const type = mimeType.toLowerCase();
  if (type === "image/jpg") return "image/jpeg";
  if (ALLOWED_MIME.has(type) && type !== "image/jpg") {
    return type === "image/jpeg" ? "image/jpeg" : type;
  }
  if (/\.png$/i.test(fileName || "")) return "image/png";
  if (/\.webp$/i.test(fileName || "")) return "image/webp";
  if (/\.(heic|heif)$/i.test(fileName || "")) return "image/heic";
  return "image/jpeg";
}

export function farmerFacingSendError(
  error: unknown,
  context: { hadImages: boolean; largestBytes: number },
): string {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "That is taking longer than expected. Please try again.";
  }

  const message = error instanceof Error ? error.message : String(error ?? "");
  const lower = message.toLowerCase();

  if (
    lower.includes("too large") ||
    lower.includes("413") ||
    lower.includes("payload") ||
    context.largestBytes > 4_000_000
  ) {
    return FARMER_PHOTO_TOO_LARGE;
  }

  if (
    lower.includes("unsupported") ||
    lower.includes("file type") ||
    lower.includes("heic") ||
    lower.includes("heif")
  ) {
    return FARMER_PHOTO_UNSUPPORTED;
  }

  if (context.hadImages) {
    return FARMER_PHOTO_UPLOAD_FAILED;
  }

  return "I couldn’t send that message. Please check your connection and try again.";
}
