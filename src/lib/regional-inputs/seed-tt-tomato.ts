/**
 * Phase 1 seed catalogue for Trinidad and Tobago — tomato focus.
 * These are illustrative verified records for architecture + tests.
 * Real official imports must replace or extend them via admin CSV import.
 */

import type {
  AgriInputRecord,
  CountryRecord,
  InputCropUseRecord,
  InputRegistrationRecord,
  SupplierInventoryRecord,
} from "./types";

export const SEED_COUNTRIES: CountryRecord[] = [
  {
    id: "country_tt",
    isoCode: "TT",
    name: "Trinidad and Tobago",
    regionGroup: "caribbean",
  },
  {
    id: "country_jm",
    isoCode: "JM",
    name: "Jamaica",
    regionGroup: "caribbean",
  },
];

const now = "2026-08-01T12:00:00.000Z";

export const SEED_AGRI_INPUTS: AgriInputRecord[] = [
  {
    id: "input_tt_imidacloprid_sc",
    productType: "insecticide",
    brandName: "Confidor Super (example verified listing)",
    activeIngredient: "imidacloprid",
    nutrientAnalysis: null,
    formulation: "SC",
    manufacturer: "Example manufacturer — replace via official import",
    biologicalOrChemical: "chemical",
    modeOfActionGroup: "IRAC 4A",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "input_tt_beauveria",
    productType: "biological_control",
    brandName: "BotaniGard (example verified listing)",
    activeIngredient: "Beauveria bassiana",
    nutrientAnalysis: null,
    formulation: "WP",
    manufacturer: "Example biological supplier",
    biologicalOrChemical: "biological",
    modeOfActionGroup: "biological entomopathogen",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "input_tt_npk_12_12_17",
    productType: "fertilizer",
    brandName: "CropMaster 12-12-17+2MgO (example verified listing)",
    activeIngredient: "NPK 12-12-17 + Mg",
    nutrientAnalysis: "12-12-17+2MgO",
    formulation: "granular",
    manufacturer: "Example fertilizer supplier",
    biologicalOrChemical: "nutrient",
    modeOfActionGroup: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "input_tt_mancozeb",
    productType: "fungicide",
    brandName: "Dithane M-45 (example verified listing)",
    activeIngredient: "mancozeb",
    nutrientAnalysis: null,
    formulation: "WP",
    manufacturer: "Example manufacturer",
    biologicalOrChemical: "chemical",
    modeOfActionGroup: "FRAC M03",
    createdAt: now,
    updatedAt: now,
  },
];

export const SEED_REGISTRATIONS: InputRegistrationRecord[] = [
  {
    id: "reg_tt_imidacloprid",
    inputId: "input_tt_imidacloprid_sc",
    countryId: "country_tt",
    registrationNumber: "TT-PEST-EX-1001",
    registrationStatus: "registered",
    registrationExpiry: "2027-12-31",
    officialSourceUrl:
      "https://www.agriculture.gov.tt/ (replace with exact pesticide register URL after import)",
    lastVerifiedAt: now,
    verifiedBy: "FVMLTD catalogue seed",
  },
  {
    id: "reg_tt_beauveria",
    inputId: "input_tt_beauveria",
    countryId: "country_tt",
    registrationNumber: "TT-BIO-EX-2001",
    registrationStatus: "registered",
    registrationExpiry: "2027-06-30",
    officialSourceUrl:
      "https://www.agriculture.gov.tt/ (replace with exact register URL after import)",
    lastVerifiedAt: now,
    verifiedBy: "FVMLTD catalogue seed",
  },
  {
    id: "reg_tt_npk",
    inputId: "input_tt_npk_12_12_17",
    countryId: "country_tt",
    registrationNumber: null,
    registrationStatus: "registration_unknown",
    registrationExpiry: null,
    officialSourceUrl: null,
    lastVerifiedAt: now,
    verifiedBy: "FVMLTD fertilizer supplier list",
  },
  {
    id: "reg_tt_mancozeb",
    inputId: "input_tt_mancozeb",
    countryId: "country_tt",
    registrationNumber: "TT-PEST-EX-1101",
    registrationStatus: "registered",
    registrationExpiry: "2027-12-31",
    officialSourceUrl:
      "https://www.agriculture.gov.tt/ (replace with exact pesticide register URL after import)",
    lastVerifiedAt: now,
    verifiedBy: "FVMLTD catalogue seed",
  },
];

export const SEED_CROP_USES: InputCropUseRecord[] = [
  {
    id: "use_tt_imidacloprid_tomato_whitefly",
    inputId: "input_tt_imidacloprid_sc",
    countryId: "country_tt",
    crop: "tomato",
    targetPestOrDisease: "whiteflies",
    labelRateText: "Follow registered label rate for tomato whiteflies",
    maximumApplications: 2,
    preHarvestInterval: "7 days (confirm on label)",
    reEntryInterval: "24 hours (confirm on label)",
    registeredTankMixOnly: false,
    labelSourceUrl:
      "https://www.agriculture.gov.tt/ (label PDF to be attached on import)",
    agronomistApproved: true,
  },
  {
    id: "use_tt_beauveria_tomato_whitefly",
    inputId: "input_tt_beauveria",
    countryId: "country_tt",
    crop: "tomato",
    targetPestOrDisease: "whiteflies",
    labelRateText: "Follow registered biological label for whiteflies",
    maximumApplications: null,
    preHarvestInterval: "0 days when label allows",
    reEntryInterval: "When spray has dried (confirm on label)",
    registeredTankMixOnly: false,
    labelSourceUrl:
      "https://www.agriculture.gov.tt/ (label PDF to be attached on import)",
    agronomistApproved: true,
  },
  {
    id: "use_tt_mancozeb_tomato_foliar",
    inputId: "input_tt_mancozeb",
    countryId: "country_tt",
    crop: "tomato",
    targetPestOrDisease: "foliar fungal disease",
    labelRateText: "Follow registered label for tomato foliar diseases",
    maximumApplications: 4,
    preHarvestInterval: "7 days (confirm on label)",
    reEntryInterval: "24 hours (confirm on label)",
    registeredTankMixOnly: false,
    labelSourceUrl:
      "https://www.agriculture.gov.tt/ (label PDF to be attached on import)",
    agronomistApproved: true,
  },
  {
    id: "use_tt_npk_tomato_nutrition",
    inputId: "input_tt_npk_12_12_17",
    countryId: "country_tt",
    crop: "tomato",
    targetPestOrDisease: "nutrient deficiency",
    labelRateText: "Apply based on soil test and crop stage — not a pesticide",
    maximumApplications: null,
    preHarvestInterval: null,
    reEntryInterval: null,
    registeredTankMixOnly: false,
    labelSourceUrl: null,
    agronomistApproved: true,
  },
];

export const SEED_SUPPLIER_INVENTORY: SupplierInventoryRecord[] = [
  {
    id: "inv_tt_beauveria_fvm",
    inputId: "input_tt_beauveria",
    countryId: "country_tt",
    supplierName: "Farmers Value Mart Ltd",
    districtOrRegion: "Trinidad",
    availabilityStatus: "in_stock",
    packSizes: "500 g, 1 kg",
    lastStockCheckAt: now,
    sourceType: "fvmltd_inventory",
  },
  {
    id: "inv_tt_imidacloprid_dist",
    inputId: "input_tt_imidacloprid_sc",
    countryId: "country_tt",
    supplierName: "Approved Trinidad agro distributor (example)",
    districtOrRegion: "Chaguanas",
    availabilityStatus: "temporarily_out_of_stock",
    packSizes: "100 ml, 250 ml",
    lastStockCheckAt: now,
    sourceType: "approved_distributor",
  },
  {
    id: "inv_tt_mancozeb_fvm",
    inputId: "input_tt_mancozeb",
    countryId: "country_tt",
    supplierName: "Farmers Value Mart Ltd",
    districtOrRegion: "Trinidad",
    availabilityStatus: "in_stock",
    packSizes: "500 g, 1 kg",
    lastStockCheckAt: now,
    sourceType: "fvmltd_inventory",
  },
  {
    id: "inv_tt_npk_supplier",
    inputId: "input_tt_npk_12_12_17",
    countryId: "country_tt",
    supplierName: "Caribbean fertilizer supplier (example)",
    districtOrRegion: "San Fernando",
    availabilityStatus: "in_stock",
    packSizes: "25 kg",
    lastStockCheckAt: now,
    sourceType: "fertilizer_supplier",
  },
];
