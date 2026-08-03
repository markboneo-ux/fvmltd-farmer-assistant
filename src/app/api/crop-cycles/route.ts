import { NextResponse } from "next/server";
import { mapCropCycleRow } from "@/lib/crop-cycles/map";
import type { CropCycleFormInput } from "@/lib/crop-cycles/types";
import { validateCropCycleForm } from "@/lib/crop-cycles/validation";
import {
  asString,
  describeFarmerRpcError,
  firstRpcRow,
  rpcRows,
  tryCreateAnonServerClient,
} from "@/lib/supabase/helpers";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const farmerId = searchParams.get("farmerId")?.trim();
  const status = searchParams.get("status")?.trim() || "active";
  const crop = searchParams.get("crop")?.trim() || null;

  if (!farmerId) {
    return NextResponse.json(
      { error: "farmerId is required." },
      { status: 400 },
    );
  }

  const anon = tryCreateAnonServerClient();
  if (!anon.ok) {
    return NextResponse.json({ error: anon.error }, { status: 503 });
  }

  const { data, error } = await anon.client.rpc("list_crop_cycles_for_farmer", {
    p_farmer_id: farmerId,
    p_status: status,
    p_crop: crop,
  });

  if (error) {
    console.error("List crop cycles failed:", error);
    return NextResponse.json(
      { error: describeFarmerRpcError(error, "Could not load crop cycles.") },
      { status: 500 },
    );
  }

  return NextResponse.json({
    cropCycles: rpcRows<Parameters<typeof mapCropCycleRow>[0]>(data).map(
      (row) => mapCropCycleRow(row),
    ),
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

  const anon = tryCreateAnonServerClient();
  if (!anon.ok) {
    return NextResponse.json(
      {
        error: anon.error,
        errors: { form: anon.error },
      },
      { status: 503 },
    );
  }

  const payload = validation.data;
  const { data, error } = await anon.client.rpc("create_crop_cycle_for_farmer", {
    p_farmer_id: payload.farmerId,
    p_farm_id: payload.farmId,
    p_crop_name: payload.cropName,
    p_variety: payload.variety,
    p_planting_date: payload.plantingDate,
    p_area_planted: payload.areaPlanted,
    p_area_unit: payload.areaUnit,
    p_area_hectares: payload.areaHectares,
    p_plant_count: payload.plantCount,
    p_growing_environment: payload.growingEnvironment,
    p_previous_crop: payload.previousCrop,
    p_growth_stage: payload.growthStage,
  });

  const row = firstRpcRow<Parameters<typeof mapCropCycleRow>[0]>(data);
  if (error || !row) {
    console.error("Create crop cycle failed:", error);
    const message = describeFarmerRpcError(
      error,
      "Could not save the crop cycle. Please try again.",
    );
    const farmMissing = message.toLowerCase().includes("select one of your farms");
    return NextResponse.json(
      {
        error: message,
        errors: farmMissing
          ? { farmId: "Select one of your farms for this crop cycle." }
          : { form: message },
      },
      { status: farmMissing ? 404 : 500 },
    );
  }

  return NextResponse.json(
    { cropCycle: mapCropCycleRow(row) },
    { status: 201 },
  );
}
