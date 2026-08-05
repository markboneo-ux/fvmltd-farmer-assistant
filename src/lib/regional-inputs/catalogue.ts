import "server-only";

import {
  SEED_AGRI_INPUTS,
  SEED_COUNTRIES,
  SEED_CROP_USES,
  SEED_REGISTRATIONS,
  SEED_SUPPLIER_INVENTORY,
} from "./seed-tt-tomato";
import type {
  AgriInputRecord,
  AvailabilityStatus,
  CountryRecord,
  GetVerifiedRegionalInputsArgs,
  InputCropUseRecord,
  InputRegistrationRecord,
  ProductType,
  RegistrationStatus,
  SupplierInventoryRecord,
  VerifiedBrandOption,
  VerifiedInputOption,
} from "./types";
import { NO_VERIFIED_PRODUCT_MESSAGE } from "./types";

export type CatalogueStore = {
  countries: CountryRecord[];
  agriInputs: AgriInputRecord[];
  registrations: InputRegistrationRecord[];
  cropUses: InputCropUseRecord[];
  inventory: SupplierInventoryRecord[];
};

let runtimeStore: CatalogueStore | null = null;

export function getCatalogueStore(): CatalogueStore {
  if (!runtimeStore) {
    runtimeStore = {
      countries: [...SEED_COUNTRIES],
      agriInputs: [...SEED_AGRI_INPUTS],
      registrations: [...SEED_REGISTRATIONS],
      cropUses: [...SEED_CROP_USES],
      inventory: [...SEED_SUPPLIER_INVENTORY],
    };
  }
  return runtimeStore;
}

/** Test helper — replace catalogue without touching the DB. */
export function setCatalogueStoreForTests(store: CatalogueStore | null) {
  runtimeStore = store;
}

export function resetCatalogueStoreToSeed() {
  runtimeStore = {
    countries: [...SEED_COUNTRIES],
    agriInputs: [...SEED_AGRI_INPUTS],
    registrations: [...SEED_REGISTRATIONS],
    cropUses: [...SEED_CROP_USES],
    inventory: [...SEED_SUPPLIER_INVENTORY],
  };
}

function normalizeCountryName(value: string): string {
  return value.trim().toLowerCase();
}

export function findCountry(
  store: CatalogueStore,
  countryName: string,
): CountryRecord | null {
  const needle = normalizeCountryName(countryName);
  return (
    store.countries.find((country) => {
      const name = normalizeCountryName(country.name);
      return (
        name === needle ||
        name.includes(needle) ||
        needle.includes(name) ||
        (needle.includes("trinidad") && country.isoCode === "TT") ||
        (needle.includes("tobago") && country.isoCode === "TT")
      );
    }) ?? null
  );
}

function issueMatches(target: string, issue: string): boolean {
  const t = target.toLowerCase();
  const i = issue.toLowerCase();
  if (t.includes(i) || i.includes(t)) return true;
  if (i.includes("whitefly") && t.includes("whitefly")) return true;
  if (
    (i.includes("blight") || i.includes("leaf spot") || i.includes("fungal")) &&
    (t.includes("foliar") || t.includes("fungal") || t.includes("blight"))
  ) {
    return true;
  }
  if (
    (i.includes("nutrient") || i.includes("fertilizer") || i.includes("yellow")) &&
    t.includes("nutrient")
  ) {
    return true;
  }
  return false;
}

function inferProductTypes(
  issue: string,
  requested: ProductType | "any" | null | undefined,
): ProductType[] | "any" {
  if (requested && requested !== "any") return [requested];
  const i = issue.toLowerCase();
  if (i.includes("whitefly") || i.includes("insect") || i.includes("pest")) {
    return ["biological_control", "insecticide"];
  }
  if (i.includes("blight") || i.includes("fungal") || i.includes("mould") || i.includes("mold")) {
    return ["fungicide", "biological_control"];
  }
  if (i.includes("nutrient") || i.includes("fertilizer") || i.includes("yellow")) {
    return ["fertilizer"];
  }
  return "any";
}

function brandDisplayAllowed(options: {
  registration: InputRegistrationRecord;
  cropUse: InputCropUseRecord;
  inventory: SupplierInventoryRecord | null;
}): boolean {
  const { registration, cropUse, inventory } = options;
  if (registration.registrationStatus !== "registered") return false;
  if (!cropUse.agronomistApproved) return false;
  if (!cropUse.labelSourceUrl) return false;
  if (!inventory) return false;
  if (inventory.availabilityStatus !== "in_stock") return false;
  // Recent stock check — within 90 days for Phase 1.
  const checked = Date.parse(inventory.lastStockCheckAt);
  if (!Number.isFinite(checked)) return false;
  const ageMs = Date.now() - checked;
  return ageMs <= 90 * 24 * 60 * 60 * 1000;
}

function buildLabelRestrictions(cropUse: InputCropUseRecord): string[] {
  const restrictions: string[] = [];
  if (cropUse.labelRateText) restrictions.push(cropUse.labelRateText);
  if (cropUse.preHarvestInterval) {
    restrictions.push(`Pre-harvest interval: ${cropUse.preHarvestInterval}`);
  }
  if (cropUse.reEntryInterval) {
    restrictions.push(`Re-entry interval: ${cropUse.reEntryInterval}`);
  }
  if (cropUse.maximumApplications != null) {
    restrictions.push(
      `Maximum applications: ${cropUse.maximumApplications}`,
    );
  }
  if (cropUse.registeredTankMixOnly) {
    restrictions.push(
      "Only registered tank mixtures on the label are permitted — never invent mixes.",
    );
  } else {
    restrictions.push(
      "Do not tank-mix unless the registered label explicitly permits the mixture.",
    );
  }
  return restrictions;
}

/**
 * Recommendation order:
 * cultural → monitoring → biological → nutrient → chemical (only when justified)
 */
function sortByInterventionOrder(inputs: AgriInputRecord[]): AgriInputRecord[] {
  const rank = (item: AgriInputRecord) => {
    if (item.biologicalOrChemical === "biological") return 1;
    if (item.productType === "fertilizer" || item.biologicalOrChemical === "nutrient")
      return 2;
    if (item.biologicalOrChemical === "chemical") return 3;
    return 4;
  };
  return [...inputs].sort((a, b) => rank(a) - rank(b));
}

export type VerifiedRegionalInputsResult = {
  country: string;
  crop: string;
  issue: string;
  options: VerifiedInputOption[];
  unmatchedMessage: string | null;
  productDataAsOf: string | null;
};

/**
 * Server tool: get_verified_regional_inputs
 * Never invents products — only returns catalogue matches.
 */
export function getVerifiedRegionalInputs(
  args: GetVerifiedRegionalInputsArgs,
): VerifiedRegionalInputsResult {
  const store = getCatalogueStore();
  const country = findCountry(store, args.country);
  const crop = args.crop.trim().toLowerCase();
  const issue = args.issue.trim();

  if (!country) {
    return {
      country: args.country,
      crop,
      issue,
      options: [],
      unmatchedMessage: NO_VERIFIED_PRODUCT_MESSAGE,
      productDataAsOf: null,
    };
  }

  const wantedTypes = inferProductTypes(issue, args.productType);
  const uses = store.cropUses.filter(
    (use) =>
      use.countryId === country.id &&
      use.crop === crop &&
      issueMatches(use.targetPestOrDisease, issue) &&
      use.agronomistApproved,
  );

  if (uses.length === 0) {
    return {
      country: country.name,
      crop,
      issue,
      options: [],
      unmatchedMessage: NO_VERIFIED_PRODUCT_MESSAGE,
      productDataAsOf: null,
    };
  }

  const byIngredient = new Map<string, VerifiedInputOption>();
  let latestVerified: string | null = null;

  const inputIds = [...new Set(uses.map((use) => use.inputId))];
  const inputs = sortByInterventionOrder(
    store.agriInputs.filter((input) => {
      if (!inputIds.includes(input.id)) return false;
      if (wantedTypes === "any") return true;
      return wantedTypes.includes(input.productType);
    }),
  );

  for (const input of inputs) {
    const cropUse = uses.find((use) => use.inputId === input.id);
    if (!cropUse) continue;

    const registration =
      store.registrations.find(
        (reg) =>
          reg.inputId === input.id && reg.countryId === country.id,
      ) ?? null;

    const inventoryRows = store.inventory.filter(
      (row) => row.inputId === input.id && row.countryId === country.id,
    );
    // Prefer in-stock rows; never assume registration means stock.
    const inventory =
      inventoryRows.find((row) => row.availabilityStatus === "in_stock") ??
      inventoryRows[0] ??
      null;

    const registrationStatus: RegistrationStatus =
      registration?.registrationStatus ?? "registration_unknown";
    const availabilityStatus: AvailabilityStatus =
      inventory?.availabilityStatus ?? "availability_unknown";

    const lastVerifiedAt =
      inventory?.lastStockCheckAt ?? registration?.lastVerifiedAt ?? null;
    if (
      lastVerifiedAt &&
      (!latestVerified || lastVerifiedAt > latestVerified)
    ) {
      latestVerified = lastVerifiedAt;
    }

    const labelRestrictions = buildLabelRestrictions(cropUse);
    const showBrand =
      registration != null &&
      brandDisplayAllowed({ registration, cropUse, inventory });

    const verifiedBrands: VerifiedBrandOption[] = showBrand
      ? [
          {
            brandName: input.brandName,
            registrationNumber: registration.registrationNumber,
            registrationStatus,
            availabilityStatus,
            supplierName: inventory?.supplierName ?? null,
            districtOrRegion: inventory?.districtOrRegion ?? null,
            officialSource: registration.officialSourceUrl,
            labelSourceUrl: cropUse.labelSourceUrl,
            lastVerifiedAt: lastVerifiedAt ?? registration.lastVerifiedAt,
            labelRestrictions,
            agronomistConfirmationRequired: !cropUse.agronomistApproved,
            whyConsidered: `Verified for ${crop} / ${cropUse.targetPestOrDisease} in ${country.name}; active ingredient ${input.activeIngredient}.`,
            sponsored: false,
          },
        ]
      : [];

    const key = `${input.productType}:${input.activeIngredient.toLowerCase()}`;
    const existing = byIngredient.get(key);
    if (existing) {
      existing.verifiedBrands.push(...verifiedBrands);
      continue;
    }

    byIngredient.set(key, {
      productType: input.productType,
      activeIngredientOrNutrient: input.activeIngredient,
      verifiedBrands,
      registrationStatus,
      availabilityStatus,
      labelRestrictions,
      officialSource: registration?.officialSourceUrl ?? null,
      lastVerifiedAt,
      agronomistConfirmationRequired:
        registrationStatus !== "registered" ||
        availabilityStatus !== "in_stock" ||
        !cropUse.agronomistApproved,
      recommendationOrderNote:
        "Recommend active ingredients or nutrient requirements first. Brand names only when registration, crop use, availability, and label source are verified. No sponsorship ranking.",
    });
  }

  const options = [...byIngredient.values()];

  return {
    country: country.name,
    crop,
    issue,
    options,
    unmatchedMessage: options.length === 0 ? NO_VERIFIED_PRODUCT_MESSAGE : null,
    productDataAsOf: latestVerified,
  };
}
