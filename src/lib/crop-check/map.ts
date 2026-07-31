import type {
  CropCaseRecord,
  CropCheckDrainage,
  IrrigationFrequency,
  SymptomLocation,
} from "./types";

type CropCaseRow = {
  id: string;
  farmer_id: string;
  farm_id: string;
  crop_cycle_id: string | null;
  crop_name: string;
  title: string | null;
  description: string | null;
  first_observed_on: string | null;
  symptom_location: string | null;
  is_spreading: boolean | null;
  percent_affected: number | string | null;
  recent_fertilizer: string | null;
  recent_spray: string | null;
  irrigation_frequency: string | null;
  drainage_condition: string | null;
  recent_heavy_rainfall: boolean | null;
  guided_step: string | null;
  status: CropCaseRecord["status"];
  completed_at: string | null;
};

export const CROP_CASE_SELECT =
  "id, farmer_id, farm_id, crop_cycle_id, crop_name, title, description, first_observed_on, symptom_location, is_spreading, percent_affected, recent_fertilizer, recent_spray, irrigation_frequency, drainage_condition, recent_heavy_rainfall, guided_step, status, completed_at";

export function mapCropCaseRow(row: CropCaseRow): CropCaseRecord {
  return {
    id: row.id,
    farmerId: row.farmer_id,
    farmId: row.farm_id,
    cropCycleId: row.crop_cycle_id,
    cropName: row.crop_name,
    title: row.title,
    description: row.description,
    firstObservedOn: row.first_observed_on,
    symptomLocation: (row.symptom_location as SymptomLocation | null) ?? null,
    isSpreading: row.is_spreading,
    percentAffected:
      row.percent_affected === null || row.percent_affected === undefined
        ? null
        : Number(row.percent_affected),
    recentFertilizer: row.recent_fertilizer,
    recentSpray: row.recent_spray,
    irrigationFrequency:
      (row.irrigation_frequency as IrrigationFrequency | null) ?? null,
    drainageCondition:
      (row.drainage_condition as CropCheckDrainage | null) ?? null,
    recentHeavyRainfall: row.recent_heavy_rainfall,
    guidedStep: row.guided_step,
    status: row.status,
    completedAt: row.completed_at,
  };
}
