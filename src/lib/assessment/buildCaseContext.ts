import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { CASE_PHOTO_SELECT } from "@/lib/crop-check/photoMap";
import { CASE_PHOTO_BUCKET } from "@/lib/crop-check/photos";
import { CROP_CASE_SELECT } from "@/lib/crop-check/map";

export type CasePhotoForModel = {
  slotKey: string;
  label: string;
  mimeType: string;
  base64: string;
};

export type CaseContextForModel = {
  caseId: string;
  farmerId: string;
  textPayload: Record<string, unknown>;
  photos: CasePhotoForModel[];
};

function cropAgeLabel(plantingDate: string | null | undefined): string | null {
  if (!plantingDate) return null;
  const planted = new Date(`${plantingDate}T00:00:00Z`);
  if (Number.isNaN(planted.getTime())) return null;
  const days = Math.floor(
    (Date.now() - planted.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (days < 0) return null;
  if (days < 14) return `${days} day(s)`;
  if (days < 60) return `${Math.round(days / 7)} week(s) (~${days} days)`;
  return `${Math.round(days / 30)} month(s) (~${days} days)`;
}

export async function buildCaseContextForModel(
  client: SupabaseClient,
  caseId: string,
  farmerId: string,
): Promise<CaseContextForModel> {
  const { data: cropCase, error: caseError } = await client
    .from("crop_checks")
    .select(CROP_CASE_SELECT)
    .eq("id", caseId)
    .eq("farmer_id", farmerId)
    .maybeSingle();

  if (caseError) {
    throw new Error(`Could not load crop case: ${caseError.message}`);
  }
  if (!cropCase) {
    throw new Error("Crop case not found.");
  }

  const [{ data: farm }, { data: cycle }, { data: soil }, { data: photos }] =
    await Promise.all([
      client
        .from("farms")
        .select(
          "id, name, country, district, region, village, location_description, latitude, longitude, water_source, drainage_condition, growing_system",
        )
        .eq("id", cropCase.farm_id)
        .maybeSingle(),
      cropCase.crop_cycle_id
        ? client
            .from("crop_cycles")
            .select(
              "id, crop_name, variety, planting_date, growth_stage, area_planted, area_unit, growing_environment, previous_crop",
            )
            .eq("id", cropCase.crop_cycle_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      client
        .from("soil_tests")
        .select("ph, electrical_conductivity, sampled_at, notes")
        .eq("farm_id", cropCase.farm_id)
        .order("sampled_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      client
        .from("crop_photos")
        .select(CASE_PHOTO_SELECT)
        .eq("crop_check_id", caseId)
        .eq("is_skipped", false)
        .not("storage_path", "is", null)
        .order("sort_order", { ascending: true }),
    ]);

  const locationParts = [
    farm?.location_description,
    farm?.village,
    farm?.district ?? farm?.region,
    farm?.country,
  ].filter(Boolean);

  const textPayload = {
    crop: cycle?.crop_name ?? cropCase.crop_name,
    variety: cycle?.variety ?? null,
    crop_age: cropAgeLabel(cycle?.planting_date) ?? null,
    planting_date: cycle?.planting_date ?? null,
    growth_stage: cycle?.growth_stage ?? null,
    location: locationParts.join(", ") || null,
    farm_name: farm?.name ?? null,
    coordinates:
      farm?.latitude != null && farm?.longitude != null
        ? { latitude: farm.latitude, longitude: farm.longitude }
        : null,
    problem_description: cropCase.description,
    symptom_location: cropCase.symptom_location,
    is_spreading: cropCase.is_spreading,
    affected_area_percent: cropCase.percent_affected,
    fertilizer_history: cropCase.recent_fertilizer,
    spray_history: cropCase.recent_spray,
    irrigation: cropCase.irrigation_frequency,
    drainage: cropCase.drainage_condition ?? farm?.drainage_condition ?? null,
    recent_heavy_rainfall: cropCase.recent_heavy_rainfall,
    growing_environment: cycle?.growing_environment ?? farm?.growing_system ?? null,
    previous_crop: cycle?.previous_crop ?? null,
    area_planted:
      cycle?.area_planted != null
        ? `${cycle.area_planted} ${cycle.area_unit ?? ""}`.trim()
        : null,
    soil_ph: soil?.ph ?? null,
    soil_ec: soil?.electrical_conductivity ?? null,
    soil_test_sampled_at: soil?.sampled_at ?? null,
    soil_test_notes: soil?.notes ?? null,
    first_observed_on: cropCase.first_observed_on,
    photo_slots_uploaded: (photos ?? []).map((photo) => ({
      slot_key: photo.slot_key,
      label: photo.label,
    })),
  };

  const photoPayloads: CasePhotoForModel[] = [];

  for (const photo of photos ?? []) {
    if (!photo.storage_path) continue;
    const bucket = photo.storage_bucket ?? CASE_PHOTO_BUCKET;
    const { data: file, error: downloadError } = await client.storage
      .from(bucket)
      .download(photo.storage_path);

    if (downloadError || !file) {
      console.error("Photo download for assessment failed:", downloadError);
      continue;
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    // Cap vision payload size — skip extremely large leftovers
    if (buffer.byteLength > 6_000_000) continue;

    photoPayloads.push({
      slotKey: photo.slot_key,
      label: photo.label ?? photo.slot_key,
      mimeType: photo.mime_type || file.type || "image/jpeg",
      base64: buffer.toString("base64"),
    });
  }

  return {
    caseId,
    farmerId,
    textPayload,
    photos: photoPayloads,
  };
}
