import {
  isOtherCountryOption,
  resolveStoredCountry,
} from "@/data/countries";
import type { FarmSizeUnit } from "@/lib/farmers/types";
import {
  DRAINAGE_OPTIONS,
  GROWING_SYSTEM_OPTIONS,
  WATER_SOURCE_OPTIONS,
  type DrainageCondition,
  type FarmFormInput,
  type GrowingSystem,
  type WaterSource,
} from "./types";

export type FarmFieldErrors = Partial<Record<keyof FarmFormInput | "form", string>>;

const waterValues = new Set(WATER_SOURCE_OPTIONS.map((o) => o.value));
const drainageValues = new Set(DRAINAGE_OPTIONS.map((o) => o.value));
const growingValues = new Set(GROWING_SYSTEM_OPTIONS.map((o) => o.value));

function parseOptionalCoordinate(
  value: string,
  kind: "latitude" | "longitude",
): number | null | undefined {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const num = Number(trimmed);
  if (!Number.isFinite(num)) return undefined;
  if (kind === "latitude" && (num < -90 || num > 90)) return undefined;
  if (kind === "longitude" && (num < -180 || num > 180)) return undefined;
  return Number(num.toFixed(6));
}

export type ValidatedFarm = {
  farmerId: string;
  name: string;
  country: string;
  district: string;
  farmSize: number;
  farmSizeUnit: FarmSizeUnit;
  sizeHectares: number;
  locationDescription: string | null;
  latitude: number | null;
  longitude: number | null;
  waterSource: WaterSource;
  drainageCondition: DrainageCondition;
  growingSystem: GrowingSystem;
};

export function acresToHectares(acres: number): number {
  return Number((acres * 0.40468564224).toFixed(3));
}

export function validateFarmForm(
  input: FarmFormInput,
): { ok: true; data: ValidatedFarm } | { ok: false; errors: FarmFieldErrors } {
  const errors: FarmFieldErrors = {};

  const farmerId = input.farmerId.trim();
  if (!farmerId) {
    errors.farmerId = "Register as a farmer before adding a farm.";
  }

  const name = input.name.trim();
  if (!name) {
    errors.name = "Enter a name for this farm or plot.";
  } else if (name.length > 120) {
    errors.name = "Farm name must be 120 characters or fewer.";
  }

  const countrySelected = input.country.trim();
  const countryOther = (input.countryOther ?? "").trim();
  if (!countrySelected) {
    errors.country = "Select the country.";
  } else if (isOtherCountryOption(countrySelected) && !countryOther) {
    errors.countryOther = "Enter the country name.";
  }
  const country = resolveStoredCountry(countrySelected, countryOther);

  const district = input.district.trim();
  if (!district) {
    errors.district = "Enter the district or region.";
  }

  const farmSizeRaw = input.farmSize.trim();
  const farmSize = Number(farmSizeRaw);
  if (!farmSizeRaw) {
    errors.farmSize = "Enter the farm size.";
  } else if (!Number.isFinite(farmSize) || farmSize <= 0) {
    errors.farmSize = "Farm size must be a number greater than zero.";
  } else if (farmSize > 100000) {
    errors.farmSize = "Farm size looks too large. Please check the value.";
  }

  const farmSizeUnit = input.farmSizeUnit;
  if (farmSizeUnit !== "acres" && farmSizeUnit !== "hectares") {
    errors.farmSizeUnit = "Choose acres or hectares.";
  }

  const locationDescription = input.locationDescription.trim() || null;
  const latitude = parseOptionalCoordinate(input.latitude, "latitude");
  const longitude = parseOptionalCoordinate(input.longitude, "longitude");

  if (latitude === undefined) {
    errors.latitude = "Enter a valid latitude between -90 and 90.";
  }
  if (longitude === undefined) {
    errors.longitude = "Enter a valid longitude between -180 and 180.";
  }
  if (
    (latitude === null && longitude !== null && longitude !== undefined) ||
    (longitude === null && latitude !== null && latitude !== undefined)
  ) {
    errors.latitude = "Provide both latitude and longitude, or leave both blank.";
    errors.longitude = "Provide both latitude and longitude, or leave both blank.";
  }
  if (!locationDescription && latitude === null && longitude === null) {
    errors.locationDescription =
      "Share your GPS location or describe where the farm is.";
  }

  const waterSource = input.waterSource;
  if (!waterSource || !waterValues.has(waterSource)) {
    errors.waterSource = "Select a water source.";
  }

  const drainageCondition = input.drainageCondition;
  if (!drainageCondition || !drainageValues.has(drainageCondition)) {
    errors.drainageCondition = "Select the drainage condition.";
  }

  const growingSystem = input.growingSystem;
  if (!growingSystem || !growingValues.has(growingSystem)) {
    errors.growingSystem = "Select a growing system.";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  const unit = farmSizeUnit as FarmSizeUnit;
  const sizeHectares =
    unit === "hectares" ? Number(farmSize.toFixed(3)) : acresToHectares(farmSize);

  return {
    ok: true,
    data: {
      farmerId,
      name,
      country,
      district,
      farmSize,
      farmSizeUnit: unit,
      sizeHectares,
      locationDescription,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      waterSource: waterSource as WaterSource,
      drainageCondition: drainageCondition as DrainageCondition,
      growingSystem: growingSystem as GrowingSystem,
    },
  };
}
