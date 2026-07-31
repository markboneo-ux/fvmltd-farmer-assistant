import type { FarmSizeUnit } from "@/lib/farmers/types";
import type {
  CropCycleRecord,
  CropStage,
  GrowingEnvironment,
} from "./types";

type CropCycleRow = {
  id: string;
  farm_id: string;
  crop_name: string;
  variety: string | null;
  planting_date: string | null;
  area_planted: number | string | null;
  area_unit: string | null;
  plant_count: number | null;
  growing_environment: string | null;
  previous_crop: string | null;
  growth_stage: string | null;
  status: CropCycleRecord["status"];
  farms?: { name?: string | null } | { name?: string | null }[] | null;
};

function farmNameFromJoin(
  farms: CropCycleRow["farms"],
): string {
  if (!farms) return "Farm";
  if (Array.isArray(farms)) return farms[0]?.name ?? "Farm";
  return farms.name ?? "Farm";
}

export function mapCropCycleRow(row: CropCycleRow): CropCycleRecord {
  return {
    id: row.id,
    farmId: row.farm_id,
    farmName: farmNameFromJoin(row.farms),
    cropName: row.crop_name,
    variety: row.variety,
    plantingDate: row.planting_date,
    areaPlanted:
      row.area_planted === null || row.area_planted === undefined
        ? null
        : Number(row.area_planted),
    areaUnit: (row.area_unit as FarmSizeUnit | null) ?? null,
    plantCount: row.plant_count,
    growingEnvironment:
      (row.growing_environment as GrowingEnvironment | null) ?? null,
    previousCrop: row.previous_crop,
    growthStage: (row.growth_stage as CropStage | null) ?? null,
    status: row.status,
  };
}

export const CROP_CYCLE_SELECT =
  "id, farm_id, crop_name, variety, planting_date, area_planted, area_unit, plant_count, growing_environment, previous_crop, growth_stage, status, farms(name)";
