import type { FarmSizeUnit } from "@/lib/farmers/types";

export type WaterSource =
  | "rainfed"
  | "river"
  | "borehole"
  | "well"
  | "irrigation_canal"
  | "dam"
  | "municipal"
  | "other";

export type DrainageCondition =
  | "well_drained"
  | "moderately_drained"
  | "poorly_drained"
  | "waterlogged"
  | "unknown";

export type GrowingSystem =
  | "open_field"
  | "shade_house"
  | "greenhouse"
  | "mixed"
  | "other";

export type FarmFormInput = {
  farmerId: string;
  name: string;
  country: string;
  district: string;
  farmSize: string;
  farmSizeUnit: FarmSizeUnit | "";
  locationDescription: string;
  latitude: string;
  longitude: string;
  waterSource: WaterSource | "";
  drainageCondition: DrainageCondition | "";
  growingSystem: GrowingSystem | "";
};

export type FarmRecord = {
  id: string;
  farmerId: string;
  name: string;
  country: string;
  district: string;
  farmSize: number;
  farmSizeUnit: FarmSizeUnit;
  locationDescription: string | null;
  latitude: number | null;
  longitude: number | null;
  waterSource: WaterSource;
  drainageCondition: DrainageCondition;
  growingSystem: GrowingSystem;
};

export const WATER_SOURCE_OPTIONS: { value: WaterSource; label: string }[] = [
  { value: "rainfed", label: "Rainfed" },
  { value: "river", label: "River" },
  { value: "borehole", label: "Borehole" },
  { value: "well", label: "Well" },
  { value: "irrigation_canal", label: "Irrigation canal" },
  { value: "dam", label: "Dam / reservoir" },
  { value: "municipal", label: "Municipal supply" },
  { value: "other", label: "Other" },
];

export const DRAINAGE_OPTIONS: { value: DrainageCondition; label: string }[] = [
  { value: "well_drained", label: "Well drained" },
  { value: "moderately_drained", label: "Moderately drained" },
  { value: "poorly_drained", label: "Poorly drained" },
  { value: "waterlogged", label: "Waterlogged" },
  { value: "unknown", label: "Unknown" },
];

export const GROWING_SYSTEM_OPTIONS: { value: GrowingSystem; label: string }[] = [
  { value: "open_field", label: "Open field" },
  { value: "shade_house", label: "Shade house" },
  { value: "greenhouse", label: "Greenhouse" },
  { value: "mixed", label: "Mixed systems" },
  { value: "other", label: "Other" },
];
