import { describe, expect, it } from "vitest";
import {
  FARMER_PHOTO_TOO_LARGE,
  FARMER_PHOTO_UNSUPPORTED,
  FARMER_PHOTO_UPLOAD_FAILED,
  farmerFacingSendError,
  isSupportedCaseImage,
  validateCaseImageMeta,
} from "./case-images";

describe("case image validation", () => {
  it("accepts jpeg, png, webp and mobile heic names", () => {
    expect(isSupportedCaseImage({ type: "image/jpeg", name: "leaf.jpg" })).toBe(
      true,
    );
    expect(isSupportedCaseImage({ type: "image/png", name: "leaf.png" })).toBe(
      true,
    );
    expect(isSupportedCaseImage({ type: "image/webp", name: "leaf.webp" })).toBe(
      true,
    );
    expect(isSupportedCaseImage({ type: "", name: "IMG_1234.HEIC" })).toBe(true);
  });

  it("rejects unsupported types and oversized files with farmer-facing copy", () => {
    expect(
      validateCaseImageMeta({ type: "application/pdf", name: "x.pdf", size: 12 }),
    ).toEqual({
      ok: false,
      farmerError: FARMER_PHOTO_UNSUPPORTED,
      reason: "unsupported_type:application/pdf:x.pdf",
    });
    expect(
      validateCaseImageMeta({
        type: "image/jpeg",
        name: "huge.jpg",
        size: 9_000_000,
      }).ok,
    ).toBe(false);
    expect(
      validateCaseImageMeta({
        type: "image/jpeg",
        name: "huge.jpg",
        size: 9_000_000,
      }),
    ).toMatchObject({ farmerError: FARMER_PHOTO_TOO_LARGE });
  });

  it("maps failed photo fetches to useful farmer errors instead of Network problem", () => {
    expect(
      farmerFacingSendError(new TypeError("Failed to fetch"), {
        hadImages: true,
        largestBytes: 5_200_000,
      }),
    ).toBe(FARMER_PHOTO_TOO_LARGE);

    expect(
      farmerFacingSendError(new TypeError("Failed to fetch"), {
        hadImages: true,
        largestBytes: 200_000,
      }),
    ).toBe(FARMER_PHOTO_UPLOAD_FAILED);

    expect(
      farmerFacingSendError(new Error("unsupported heic"), {
        hadImages: true,
        largestBytes: 200_000,
      }),
    ).toBe(FARMER_PHOTO_UNSUPPORTED);

    expect(
      farmerFacingSendError(new TypeError("Failed to fetch"), {
        hadImages: false,
        largestBytes: 0,
      }),
    ).not.toMatch(/network problem/i);

    expect(
      farmerFacingSendError(
        new Error("OpenAI is not configured on the server. Add OPENAI_API_KEY and try again."),
        { hadImages: false, largestBytes: 0 },
      ),
    ).not.toMatch(/OPENAI_API_KEY/);
  });
});
