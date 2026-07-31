import {
  CROP_STAGE_OPTIONS,
  GROWING_ENVIRONMENT_OPTIONS,
  type CropStage,
  type GrowingEnvironment,
} from "./types";

export function labelForStage(stage: CropStage | null | undefined): string {
  if (!stage) return "Stage unknown";
  return CROP_STAGE_OPTIONS.find((option) => option.value === stage)?.label ?? stage;
}

export function labelForEnvironment(
  environment: GrowingEnvironment | null | undefined,
): string {
  if (!environment) return "Growing place unknown";
  return (
    GROWING_ENVIRONMENT_OPTIONS.find((option) => option.value === environment)
      ?.label ?? environment
  );
}

export function formatPlantingDate(value: string | null | undefined): string {
  if (!value) return "Planting date not set";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
