import type { FarmSizeUnit } from "@/lib/farmers/types";
import { acresToHectares } from "@/lib/farms/validation";
import {
  CROP_STAGE_OPTIONS,
  GROWING_ENVIRONMENT_OPTIONS,
  type CropCycleFormInput,
  type CropStage,
  type GrowingEnvironment,
} from "./types";

export type CropCycleFieldErrors = Partial<
  Record<keyof CropCycleFormInput | "form", string>
>;

const environmentValues = new Set(
  GROWING_ENVIRONMENT_OPTIONS.map((option) => option.value),
);
const stageValues = new Set(CROP_STAGE_OPTIONS.map((option) => option.value));

export type ValidatedCropCycle = {
  farmerId: string;
  farmId: string;
  cropName: string;
  variety: string | null;
  plantingDate: string;
  areaPlanted: number;
  areaUnit: FarmSizeUnit;
  areaHectares: number;
  plantCount: number | null;
  growingEnvironment: GrowingEnvironment;
  previousCrop: string | null;
  growthStage: CropStage;
};

export function validateCropCycleForm(
  input: CropCycleFormInput,
):
  | { ok: true; data: ValidatedCropCycle }
  | { ok: false; errors: CropCycleFieldErrors } {
  const errors: CropCycleFieldErrors = {};

  const farmerId = input.farmerId.trim();
  if (!farmerId) {
    errors.farmerId = "Register as a farmer before creating a crop cycle.";
  }

  const farmId = input.farmId.trim();
  if (!farmId) {
    errors.farmId = "Select the farm for this crop cycle.";
  }

  const cropName = input.crop.trim();
  if (!cropName || cropName.toLowerCase() === "other") {
    errors.crop = "Enter or select the crop.";
  } else if (cropName.length > 80) {
    errors.crop = "Crop name must be 80 characters or fewer.";
  }

  const variety = input.variety.trim() || null;
  if (variety && variety.length > 80) {
    errors.variety = "Variety must be 80 characters or fewer.";
  }

  const plantingDate = input.plantingDate.trim();
  if (!plantingDate) {
    errors.plantingDate = "Enter the planting date.";
  } else if (Number.isNaN(Date.parse(plantingDate))) {
    errors.plantingDate = "Enter a valid planting date.";
  }

  const areaRaw = input.areaPlanted.trim();
  const areaPlanted = Number(areaRaw);
  if (!areaRaw) {
    errors.areaPlanted = "Enter the area planted.";
  } else if (!Number.isFinite(areaPlanted) || areaPlanted <= 0) {
    errors.areaPlanted = "Area planted must be a number greater than zero.";
  } else if (areaPlanted > 100000) {
    errors.areaPlanted = "Area planted looks too large. Please check the value.";
  }

  const areaUnit = input.areaUnit;
  if (areaUnit !== "acres" && areaUnit !== "hectares") {
    errors.areaUnit = "Choose acres or hectares.";
  }

  const plantCountRaw = input.plantCount.trim();
  let plantCount: number | null = null;
  if (plantCountRaw) {
    const parsed = Number(plantCountRaw);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      errors.plantCount = "Number of plants must be a whole number greater than zero.";
    } else if (parsed > 10_000_000) {
      errors.plantCount = "Number of plants looks too large. Please check the value.";
    } else {
      plantCount = parsed;
    }
  }

  const growingEnvironment = input.growingEnvironment;
  if (!growingEnvironment || !environmentValues.has(growingEnvironment)) {
    errors.growingEnvironment =
      "Choose open field, shade house, or greenhouse.";
  }

  const previousCrop = input.previousCrop.trim() || null;
  if (previousCrop && previousCrop.length > 80) {
    errors.previousCrop = "Previous crop must be 80 characters or fewer.";
  }

  const growthStage = input.currentStage;
  if (!growthStage || !stageValues.has(growthStage)) {
    errors.currentStage = "Select the current crop stage.";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  const unit = areaUnit as FarmSizeUnit;
  const areaHectares =
    unit === "hectares"
      ? Number(areaPlanted.toFixed(3))
      : acresToHectares(areaPlanted);

  return {
    ok: true,
    data: {
      farmerId,
      farmId,
      cropName,
      variety,
      plantingDate,
      areaPlanted,
      areaUnit: unit,
      areaHectares,
      plantCount,
      growingEnvironment: growingEnvironment as GrowingEnvironment,
      previousCrop,
      growthStage: growthStage as CropStage,
    },
  };
}
