import { beforeEach, describe, expect, it } from "vitest";
import {
  getVerifiedRegionalInputs,
  resetCatalogueStoreToSeed,
  setCatalogueStoreForTests,
} from "./catalogue";
import { NO_VERIFIED_PRODUCT_MESSAGE } from "./types";
import { importRegionalInputsCsv } from "./import-csv";

describe("verified regional inputs — Trinidad tomato", () => {
  beforeEach(() => {
    resetCatalogueStoreToSeed();
  });

  it("returns only verified Trinidad records for tomato whiteflies", () => {
    const result = getVerifiedRegionalInputs({
      country: "Trinidad and Tobago",
      crop: "tomato",
      issue: "whiteflies",
    });

    expect(result.options.length).toBeGreaterThan(0);
    expect(result.unmatchedMessage).toBeNull();

    for (const option of result.options) {
      expect(option.registrationStatus).toBeTruthy();
      expect(option.availabilityStatus).toBeTruthy();
      // Registration and stock are separate fields.
      expect(option).toHaveProperty("registrationStatus");
      expect(option).toHaveProperty("availabilityStatus");
      expect(option.lastVerifiedAt).toBeTruthy();
      // Biological options should appear before chemical when both exist.
    }

    const ingredients = result.options.map(
      (option) => option.activeIngredientOrNutrient,
    );
    expect(ingredients.some((item) => /beauveria/i.test(item))).toBe(true);

    // Brand only when registered + crop use + in stock + label source.
    const withBrand = result.options.find(
      (option) => option.verifiedBrands.length > 0,
    );
    expect(withBrand).toBeTruthy();
    expect(withBrand?.verifiedBrands[0]?.availabilityStatus).toBe("in_stock");
    expect(withBrand?.verifiedBrands[0]?.registrationStatus).toBe("registered");
    expect(withBrand?.verifiedBrands[0]?.officialSource).toBeTruthy();
    expect(withBrand?.verifiedBrands[0]?.sponsored).toBe(false);
  });

  it("shows registration and stock separately for out-of-stock registered product", () => {
    const result = getVerifiedRegionalInputs({
      country: "Trinidad and Tobago",
      crop: "tomato",
      issue: "whiteflies",
      productType: "insecticide",
    });

    const imidacloprid = result.options.find((option) =>
      /imidacloprid/i.test(option.activeIngredientOrNutrient),
    );
    expect(imidacloprid).toBeTruthy();
    expect(imidacloprid?.registrationStatus).toBe("registered");
    expect(imidacloprid?.availabilityStatus).toBe(
      "temporarily_out_of_stock",
    );
    // Brand hidden when not in stock.
    expect(imidacloprid?.verifiedBrands.length).toBe(0);
  });

  it("does not invent products for a country with no catalogue", () => {
    const result = getVerifiedRegionalInputs({
      country: "Jamaica",
      crop: "tomato",
      issue: "whiteflies",
    });

    expect(result.options).toEqual([]);
    expect(result.unmatchedMessage).toBe(NO_VERIFIED_PRODUCT_MESSAGE);
  });

  it("imports CSV rows from official / distributor sources", () => {
    const csv = [
      "country_iso,brand_name,active_ingredient,product_type,crop,target_pest_or_disease,registration_number,registration_status,availability_status,supplier_name,label_source_url,official_source_url,agronomist_approved",
      "TT,Test Bio Spray,Isaria fumosorosea,biological_control,tomato,whiteflies,TT-BIO-TEST-1,registered,in_stock,FVMLTD,https://example.com/label,https://example.com/register,true",
    ].join("\n");

    const imported = importRegionalInputsCsv(csv, {
      sourceType: "official_authority",
      verifiedBy: "test-admin",
    });

    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.rowsImported).toBe(1);

    const result = getVerifiedRegionalInputs({
      country: "Trinidad and Tobago",
      crop: "tomato",
      issue: "whiteflies",
      productType: "biological_control",
    });

    expect(
      result.options.some((option) =>
        /Isaria fumosorosea/i.test(option.activeIngredientOrNutrient),
      ),
    ).toBe(true);
  });

  it("can empty the catalogue for isolation tests", () => {
    setCatalogueStoreForTests({
      countries: [
        {
          id: "country_bb",
          isoCode: "BB",
          name: "Barbados",
          regionGroup: "caribbean",
        },
      ],
      agriInputs: [],
      registrations: [],
      cropUses: [],
      inventory: [],
    });

    const result = getVerifiedRegionalInputs({
      country: "Barbados",
      crop: "tomato",
      issue: "whiteflies",
    });
    expect(result.unmatchedMessage).toBe(NO_VERIFIED_PRODUCT_MESSAGE);
  });
});
