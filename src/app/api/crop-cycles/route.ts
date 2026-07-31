import { NextResponse } from "next/server";
import { CROP_CYCLE_SELECT, mapCropCycleRow } from "@/lib/crop-cycles/map";
import type { CropCycleFormInput } from "@/lib/crop-cycles/types";
import { validateCropCycleForm } from "@/lib/crop-cycles/validation";
import { asString, tryCreateAdminClient } from "@/lib/supabase/helpers";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const farmerId = searchParams.get("farmerId")?.trim();
  const status = searchParams.get("status")?.trim() || "active";

  if (!farmerId) {
    return NextResponse.json(
      { error: "farmerId is required." },
      { status: 400 },
    );
  }

  const admin = tryCreateAdminClient();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: 503 });
  }

  const { data: farms, error: farmsError } = await admin.client
    .from("farms")
    .select("id")
    .eq("farmer_id", farmerId);

  if (farmsError) {
    console.error("List farms for crop cycles failed:", farmsError);
    return NextResponse.json(
      { error: "Could not load crop cycles." },
      { status: 500 },
    );
  }

  const farmIds = (farms ?? []).map((farm) => farm.id as string);
  if (farmIds.length === 0) {
    return NextResponse.json({ cropCycles: [] });
  }

  let query = admin.client
    .from("crop_cycles")
    .select(CROP_CYCLE_SELECT)
    .in("farm_id", farmIds)
    .order("planting_date", { ascending: false });

  if (status !== "all") {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    console.error("List crop cycles failed:", error);
    return NextResponse.json(
      { error: "Could not load crop cycles." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    cropCycles: (data ?? []).map((row) => mapCropCycleRow(row)),
  });
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body.", errors: { form: "Invalid request body." } },
      { status: 400 },
    );
  }

  const input: CropCycleFormInput = {
    farmerId: asString(body.farmerId),
    farmId: asString(body.farmId),
    crop: asString(body.crop),
    variety: asString(body.variety),
    plantingDate: asString(body.plantingDate),
    areaPlanted: asString(body.areaPlanted),
    areaUnit: asString(body.areaUnit) as CropCycleFormInput["areaUnit"],
    plantCount: asString(body.plantCount),
    growingEnvironment: asString(
      body.growingEnvironment,
    ) as CropCycleFormInput["growingEnvironment"],
    previousCrop: asString(body.previousCrop),
    currentStage: asString(body.currentStage) as CropCycleFormInput["currentStage"],
  };

  const validation = validateCropCycleForm(input);
  if (!validation.ok) {
    return NextResponse.json(
      { error: "Please fix the highlighted fields.", errors: validation.errors },
      { status: 400 },
    );
  }

  const admin = tryCreateAdminClient();
  if (!admin.ok) {
    return NextResponse.json(
      {
        error: admin.error,
        errors: { form: admin.error },
      },
      { status: 503 },
    );
  }

  const payload = validation.data;

  const { data: farm, error: farmError } = await admin.client
    .from("farms")
    .select("id, name, farmer_id")
    .eq("id", payload.farmId)
    .maybeSingle();

  if (farmError) {
    console.error("Farm lookup for crop cycle failed:", farmError);
    return NextResponse.json(
      {
        error: "Could not verify farm.",
        errors: { form: "Could not verify farm. Please try again." },
      },
      { status: 500 },
    );
  }

  if (!farm || farm.farmer_id !== payload.farmerId) {
    return NextResponse.json(
      {
        error: "Farm not found for this farmer.",
        errors: {
          farmId: "Select one of your farms for this crop cycle.",
        },
      },
      { status: 404 },
    );
  }

  const { data, error } = await admin.client
    .from("crop_cycles")
    .insert({
      farm_id: payload.farmId,
      crop_name: payload.cropName,
      variety: payload.variety,
      planting_date: payload.plantingDate,
      area_planted: payload.areaPlanted,
      area_unit: payload.areaUnit,
      area_hectares: payload.areaHectares,
      plant_count: payload.plantCount,
      growing_environment: payload.growingEnvironment,
      previous_crop: payload.previousCrop,
      growth_stage: payload.growthStage,
      status: "active",
    })
    .select(CROP_CYCLE_SELECT)
    .single();

  if (error || !data) {
    console.error("Create crop cycle failed:", error);
    return NextResponse.json(
      {
        error: "Could not save the crop cycle.",
        errors: { form: "Could not save the crop cycle. Please try again." },
      },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { cropCycle: mapCropCycleRow(data) },
    { status: 201 },
  );
}
