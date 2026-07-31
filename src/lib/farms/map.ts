import type { FarmSizeUnit } from "@/lib/farmers/types";
import type {
  DrainageCondition,
  FarmRecord,
  GrowingSystem,
  WaterSource,
} from "./types";

type FarmRow = {
  id: string;
  farmer_id: string;
  name: string;
  country: string | null;
  district: string | null;
  region: string | null;
  farm_size: number | string | null;
  farm_size_unit: string | null;
  location_description: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  water_source: string | null;
  drainage_condition: string | null;
  growing_system: string | null;
};

export function mapFarmRow(row: FarmRow): FarmRecord {
  return {
    id: row.id,
    farmerId: row.farmer_id,
    name: row.name,
    country: row.country ?? "",
    district: row.district ?? row.region ?? "",
    farmSize: Number(row.farm_size ?? 0),
    farmSizeUnit: (row.farm_size_unit as FarmSizeUnit) ?? "hectares",
    locationDescription: row.location_description,
    latitude: row.latitude === null || row.latitude === undefined
      ? null
      : Number(row.latitude),
    longitude:
      row.longitude === null || row.longitude === undefined
        ? null
        : Number(row.longitude),
    waterSource: (row.water_source as WaterSource) ?? "other",
    drainageCondition:
      (row.drainage_condition as DrainageCondition) ?? "unknown",
    growingSystem: (row.growing_system as GrowingSystem) ?? "other",
  };
}

export const FARM_SELECT =
  "id, farmer_id, name, country, district, region, farm_size, farm_size_unit, location_description, latitude, longitude, water_source, drainage_condition, growing_system";
