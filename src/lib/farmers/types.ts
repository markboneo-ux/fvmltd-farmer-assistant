export type FarmSizeUnit = "acres" | "hectares";

export type FarmerRegistrationInput = {
  fullName: string;
  whatsappNumber: string;
  country: string;
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

export const COUNTRY_OPTIONS = [
  "Tanzania",
  "Kenya",
  "Uganda",
  "Rwanda",
  "Burundi",
  "Malawi",
  "Zambia",
  "Mozambique",
  "Other",
] as const;
