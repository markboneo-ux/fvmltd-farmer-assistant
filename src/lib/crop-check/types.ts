export const CROP_CHECK_CROPS = ["Tomato", "Pepper", "Cucumber"] as const;
export type CropCheckCrop = (typeof CROP_CHECK_CROPS)[number];

export type SymptomLocation =
  | "young_leaves"
  | "old_leaves"
  | "fruit"
  | "stem"
  | "roots"
  | "whole_plant";

export type IrrigationFrequency =
  | "daily"
  | "every_2_3_days"
  | "weekly"
  | "rarely"
  | "rainfed_only"
  | "unknown";

export type CropCheckDrainage =
  | "well_drained"
  | "moderately_drained"
  | "poorly_drained"
  | "waterlogged"
  | "unknown";

/** Steps after a crop cycle is linked and a draft case exists. */
export type GuidedQuestionStep =
  | "problem_description"
  | "first_observed_on"
  | "symptom_location"
  | "is_spreading"
  | "percent_affected"
  | "recent_fertilizer"
  | "recent_spray"
  | "irrigation_frequency"
  | "drainage_condition"
  | "recent_heavy_rainfall"
  | "completed";

export type PreCaseStep =
  | "select_crop"
  | "select_cycle"
  | "create_cycle_farm"
  | "create_cycle_details";

export type CropCheckStep = PreCaseStep | GuidedQuestionStep;

export type CropCaseRecord = {
  id: string;
  farmerId: string;
  farmId: string;
  cropCycleId: string | null;
  cropName: string;
  title: string | null;
  description: string | null;
  firstObservedOn: string | null;
  symptomLocation: SymptomLocation | null;
  isSpreading: boolean | null;
  percentAffected: number | null;
  recentFertilizer: string | null;
  recentSpray: string | null;
  irrigationFrequency: IrrigationFrequency | null;
  drainageCondition: CropCheckDrainage | null;
  recentHeavyRainfall: boolean | null;
  guidedStep: string | null;
  status: "draft" | "open" | "in_review" | "resolved" | "closed";
  completedAt: string | null;
};

export const SYMPTOM_LOCATION_OPTIONS: {
  value: SymptomLocation;
  label: string;
}[] = [
  { value: "young_leaves", label: "Young leaves" },
  { value: "old_leaves", label: "Old leaves" },
  { value: "fruit", label: "Fruit" },
  { value: "stem", label: "Stem" },
  { value: "roots", label: "Roots" },
  { value: "whole_plant", label: "Whole plant" },
];

export const IRRIGATION_FREQUENCY_OPTIONS: {
  value: IrrigationFrequency;
  label: string;
}[] = [
  { value: "daily", label: "Daily" },
  { value: "every_2_3_days", label: "Every 2–3 days" },
  { value: "weekly", label: "Weekly" },
  { value: "rarely", label: "Rarely" },
  { value: "rainfed_only", label: "Rainfed only" },
  { value: "unknown", label: "Not sure" },
];

export const CROP_CHECK_DRAINAGE_OPTIONS: {
  value: CropCheckDrainage;
  label: string;
}[] = [
  { value: "well_drained", label: "Well drained" },
  { value: "moderately_drained", label: "Moderately drained" },
  { value: "poorly_drained", label: "Poorly drained" },
  { value: "waterlogged", label: "Waterlogged" },
  { value: "unknown", label: "Not sure" },
];

export const GUIDED_QUESTION_STEPS: GuidedQuestionStep[] = [
  "problem_description",
  "first_observed_on",
  "symptom_location",
  "is_spreading",
  "percent_affected",
  "recent_fertilizer",
  "recent_spray",
  "irrigation_frequency",
  "drainage_condition",
  "recent_heavy_rainfall",
  "completed",
];
