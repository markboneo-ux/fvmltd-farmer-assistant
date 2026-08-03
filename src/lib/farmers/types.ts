export type FarmSizeUnit = "acres" | "hectares";

export type FarmerRegistrationInput = {
  fullName: string;
  whatsappNumber: string;
  country: string;
  /** Required when country is an "Other…" option. */
  countryOther: string;
  district: string;
  farmSize: string;
  farmSizeUnit: FarmSizeUnit | "";
  mainCrops: string[];
  consent: boolean;
};

export type RegisteredFarmer = {
  id: string;
  farmerCode: string;
  fullName: string;
  whatsappNumber: string;
  country: string;
  district: string;
  farmSize: number;
  farmSizeUnit: FarmSizeUnit;
  mainCrops: string[];
  memberSince: string;
};

export const CROP_OPTIONS = [
  "Cassava",
  "Maize",
  "Tomato",
  "Banana",
  "Beans",
  "Rice",
  "Coffee",
  "Other",
] as const;

/** Re-export shared country list for convenience. */
export {
  COUNTRY_OPTIONS,
  DEFAULT_COUNTRY,
  isOtherCountryOption,
  resolveStoredCountry,
} from "@/data/countries";
