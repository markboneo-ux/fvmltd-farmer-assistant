import type { FarmSizeUnit } from "@/lib/farmers/types";

export type GrowingEnvironment = "open_field" | "shade_house" | "greenhouse";

export type CropStage =
  | "nursery"
  | "transplanting"
  | "vegetative"
  | "flowering"
  | "fruiting"
  | "maturity"
  | "harvest"
  | "other";

export type CropCycleFormInput = {
  farmerId: string;
  farmId: string;
  crop: string;
  variety: string;
  plantingDate: string;
  areaPlanted: string;
  areaUnit: FarmSizeUnit | "";
  plantCount: string;
  growingEnvironment: GrowingEnvironment | "";
  previousCrop: string;
  currentStage: CropStage | "";
};

export type CropCycleRecord = {
  id: string;
  farmId: string;
  farmName: string;
  cropName: string;
  variety: string | null;
  plantingDate: string | null;
  areaPlanted: number | null;
  areaUnit: FarmSizeUnit | null;
  plantCount: number | null;
  growingEnvironment: GrowingEnvironment | null;
  previousCrop: string | null;
  growthStage: CropStage | null;
  status: "planned" | "active" | "harvested" | "abandoned";
};

export const GROWING_ENVIRONMENT_OPTIONS: {
  value: GrowingEnvironment;
  label: string;
}[] = [
  { value: "open_field", label: "Open field" },
  { value: "shade_house", label: "Shade house" },
  { value: "greenhouse", label: "Greenhouse" },
];

export const CROP_STAGE_OPTIONS: { value: CropStage; label: string }[] = [
  { value: "nursery", label: "Nursery" },
  { value: "transplanting", label: "Transplanting" },
  { value: "vegetative", label: "Vegetative" },
  { value: "flowering", label: "Flowering" },
  { value: "fruiting", label: "Fruiting" },
  { value: "maturity", label: "Maturity" },
  { value: "harvest", label: "Harvest" },
  { value: "other", label: "Other" },
];
