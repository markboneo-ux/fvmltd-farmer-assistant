/**
 * Verified regional agricultural-input catalogue types.
 * Legal registration and stock availability are tracked separately.
 */

export type ProductType =
  | "fertilizer"
  | "insecticide"
  | "fungicide"
  | "herbicide"
  | "biological_control"
  | "other";

export type RegistrationStatus =
  | "registered"
  | "expired"
  | "suspended"
  | "registration_unknown";

export type AvailabilityStatus =
  | "in_stock"
  | "temporarily_out_of_stock"
  | "availability_unknown";

export type CountryRecord = {
  id: string;
  isoCode: string;
  name: string;
  regionGroup: string;
};

export type AgriInputRecord = {
  id: string;
  productType: ProductType;
  brandName: string;
  activeIngredient: string;
  nutrientAnalysis: string | null;
  formulation: string | null;
  manufacturer: string | null;
  biologicalOrChemical: "biological" | "chemical" | "nutrient" | "other";
  modeOfActionGroup: string | null;
  createdAt: string;
  updatedAt: string;
};

export type InputRegistrationRecord = {
  id: string;
  inputId: string;
  countryId: string;
  registrationNumber: string | null;
  registrationStatus: RegistrationStatus;
  registrationExpiry: string | null;
  officialSourceUrl: string | null;
  lastVerifiedAt: string;
  verifiedBy: string;
};

export type InputCropUseRecord = {
  id: string;
  inputId: string;
  countryId: string;
  crop: string;
  targetPestOrDisease: string;
  labelRateText: string | null;
  maximumApplications: number | null;
  preHarvestInterval: string | null;
  reEntryInterval: string | null;
  registeredTankMixOnly: boolean;
  labelSourceUrl: string | null;
  agronomistApproved: boolean;
};

export type SupplierInventoryRecord = {
  id: string;
  inputId: string;
  countryId: string;
  supplierName: string;
  districtOrRegion: string | null;
  availabilityStatus: AvailabilityStatus;
  packSizes: string | null;
  lastStockCheckAt: string;
  sourceType:
    | "fvmltd_inventory"
    | "approved_distributor"
    | "fertilizer_supplier"
    | "biological_control_supplier"
    | "official_authority"
    | "other";
};

export type VerifiedBrandOption = {
  brandName: string;
  registrationNumber: string | null;
  registrationStatus: RegistrationStatus;
  availabilityStatus: AvailabilityStatus;
  supplierName: string | null;
  districtOrRegion: string | null;
  officialSource: string | null;
  labelSourceUrl: string | null;
  lastVerifiedAt: string;
  labelRestrictions: string[];
  agronomistConfirmationRequired: boolean;
  whyConsidered: string;
  sponsored: false;
};

export type VerifiedInputOption = {
  productType: ProductType;
  activeIngredientOrNutrient: string;
  verifiedBrands: VerifiedBrandOption[];
  registrationStatus: RegistrationStatus;
  availabilityStatus: AvailabilityStatus;
  labelRestrictions: string[];
  officialSource: string | null;
  lastVerifiedAt: string | null;
  agronomistConfirmationRequired: boolean;
  recommendationOrderNote: string;
};

export type GetVerifiedRegionalInputsArgs = {
  country: string;
  crop: string;
  issue: string;
  productType?: ProductType | "any" | null;
  /** Farmer-facing lookups hide test/example catalogue rows. */
  forFarmerDisplay?: boolean;
};

export const NO_VERIFIED_PRODUCT_MESSAGE =
  "I can suggest the type of treatment or active ingredient, but I can’t confirm a locally available registered product for your area yet. Check the product label before applying anything.";
