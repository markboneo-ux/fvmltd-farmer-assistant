import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  COMPANY_NAME,
  LOGO_HEIGHT,
  LOGO_SRC,
  LOGO_WIDTH,
  PRODUCT_NAME,
  PRODUCT_SUBTITLE,
} from "./brand";

describe("FVM Crop Solution brand", () => {
  it("uses the farmer-facing product name and subtitle", () => {
    expect(PRODUCT_NAME).toBe("FVM Crop Solution");
    expect(PRODUCT_SUBTITLE).toBe("Your Caribbean Farming Assistant");
    expect(COMPANY_NAME).toBe("Farmersvaluemart Ltd");
    expect(PRODUCT_NAME).not.toMatch(/Farmersvaluemart AI|FVM AI Laboratory|FVMLTD Crop Doctor/);
  });

  it("keeps the official logo file at the public brand path", () => {
    expect(LOGO_SRC).toBe("/brand/farmersvaluemart-logo.png");
    const file = readFileSync(join(process.cwd(), "public/brand/farmersvaluemart-logo.png"));
    expect(file.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBe(
      true,
    );
    expect(file.byteLength).toBeGreaterThan(1000);
    expect(LOGO_WIDTH).toBe(444);
    expect(LOGO_HEIGHT).toBe(617);
  });
});
