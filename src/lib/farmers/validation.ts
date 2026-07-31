import type { FarmSizeUnit, FarmerRegistrationInput } from "./types";

export type FieldErrors = Partial<
  Record<keyof FarmerRegistrationInput | "form", string>
>;

const WHATSAPP_PATTERN = /^\+?[0-9][0-9\s()-]{7,18}$/;

function normalizeWhatsApp(value: string): string {
  return value.replace(/[\s()-]/g, "");
}

export function validateFarmerRegistration(
  input: FarmerRegistrationInput,
): { ok: true; data: ValidatedFarmerRegistration } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};

  const fullName = input.fullName.trim();
  if (!fullName) {
    errors.fullName = "Enter your full name.";
  } else if (fullName.length < 2) {
    errors.fullName = "Full name must be at least 2 characters.";
  } else if (fullName.length > 120) {
    errors.fullName = "Full name must be 120 characters or fewer.";
  }

  const whatsappRaw = input.whatsappNumber.trim();
  const whatsappNumber = normalizeWhatsApp(whatsappRaw);
  if (!whatsappRaw) {
    errors.whatsappNumber = "Enter your WhatsApp number.";
  } else if (!WHATSAPP_PATTERN.test(whatsappRaw) || whatsappNumber.length < 8) {
    errors.whatsappNumber =
      "Enter a valid WhatsApp number, including country code (e.g. +255712555014).";
  }

  const country = input.country.trim();
  if (!country) {
    errors.country = "Select your country.";
  }

  const district = input.district.trim();
  if (!district) {
    errors.district = "Enter your district or region.";
  } else if (district.length > 120) {
    errors.district = "District or region must be 120 characters or fewer.";
  }

  const farmSizeRaw = input.farmSize.trim();
  const farmSize = Number(farmSizeRaw);
  if (!farmSizeRaw) {
    errors.farmSize = "Enter your farm size.";
  } else if (!Number.isFinite(farmSize) || farmSize <= 0) {
    errors.farmSize = "Farm size must be a number greater than zero.";
  } else if (farmSize > 100000) {
    errors.farmSize = "Farm size looks too large. Please check the value.";
  }

  const farmSizeUnit = input.farmSizeUnit;
  if (farmSizeUnit !== "acres" && farmSizeUnit !== "hectares") {
    errors.farmSizeUnit = "Choose acres or hectares.";
  }

  if (!input.mainCrops.length) {
    errors.mainCrops = "Select at least one main crop.";
  }

  if (!input.consent) {
    errors.consent =
      "Consent is required to store farm information and crop photographs.";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      fullName,
      whatsappNumber,
      country,
      district,
      farmSize,
      farmSizeUnit: farmSizeUnit as FarmSizeUnit,
      mainCrops: [...new Set(input.mainCrops.map((c) => c.trim()).filter(Boolean))],
      consent: true,
    },
  };
}

export type ValidatedFarmerRegistration = {
  fullName: string;
  whatsappNumber: string;
  country: string;
  district: string;
  farmSize: number;
  farmSizeUnit: FarmSizeUnit;
  mainCrops: string[];
  consent: true;
};
