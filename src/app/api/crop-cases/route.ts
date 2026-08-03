import { NextResponse } from "next/server";
import { CROP_CASE_SELECT, mapCropCaseRow } from "@/lib/crop-check/map";
import { isCropCheckCrop } from "@/lib/crop-check/validation";
import { asString, tryCreateAdminClient } from "@/lib/supabase/helpers";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const farmerId = searchParams.get("farmerId")?.trim();
  const status = searchParams.get("status")?.trim();
  const id = searchParams.get("id")?.trim();

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

  let query = admin.client
    .from("crop_checks")
    .select(CROP_CASE_SELECT)
    .eq("farmer_id", farmerId)
    .order("updated_at", { ascending: false });

  if (id) {
    query = query.eq("id", id);
  }
  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    console.error("List crop cases failed:", error);
    return NextResponse.json(
      { error: "Could not load crop cases." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    cropCases: (data ?? []).map((row) => mapCropCaseRow(row)),
  });
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }

  const farmerId = asString(body.farmerId).trim();
  const cropCycleId = asString(body.cropCycleId).trim();
  const cropName = asString(body.cropName).trim();

  if (!farmerId) {
    return NextResponse.json(
      { error: "farmerId is required." },
      { status: 400 },
    );
  }
  if (!cropCycleId) {
    return NextResponse.json(
      { error: "cropCycleId is required." },
      { status: 400 },
    );
  }
  if (!isCropCheckCrop(cropName)) {
    return NextResponse.json(
      {
        error:
          "Guided crop check currently supports Tomato, Pepper, and Cucumber only.",
      },
      { status: 400 },
    );
  }

  const admin = tryCreateAdminClient();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: 503 });
  }

  const { data: cycle, error: cycleError } = await admin.client
    .from("crop_cycles")
    .select("id, farm_id, crop_name")
    .eq("id", cropCycleId)
    .maybeSingle();

  if (cycleError) {
    console.error("Crop cycle lookup failed:", cycleError);
    return NextResponse.json(
      { error: "Could not verify crop cycle." },
      { status: 500 },
    );
  }

  if (!cycle) {
    return NextResponse.json(
      { error: "Crop cycle not found for this farmer." },
      { status: 404 },
    );
  }

  const { data: farm, error: farmError } = await admin.client
    .from("farms")
    .select("id, farmer_id")
    .eq("id", cycle.farm_id)
    .maybeSingle();

  if (farmError) {
    console.error("Farm lookup for crop case failed:", farmError);
    return NextResponse.json(
      { error: "Could not verify farm." },
      { status: 500 },
    );
  }

  if (!farm || farm.farmer_id !== farmerId) {
    return NextResponse.json(
      { error: "Crop cycle not found for this farmer." },
      { status: 404 },
    );
  }

  if (cycle.crop_name.toLowerCase() !== cropName.toLowerCase()) {
    return NextResponse.json(
      {
        error: `Selected cycle is for ${cycle.crop_name}, not ${cropName}.`,
      },
      { status: 400 },
    );
  }

  const { data, error } = await admin.client
    .from("crop_checks")
    .insert({
      farmer_id: farmerId,
      farm_id: cycle.farm_id,
      crop_cycle_id: cropCycleId,
      crop_name: cropName,
      title: `${cropName} crop check`,
      status: "draft",
      guided_step: "problem_description",
    })
    .select(CROP_CASE_SELECT)
    .single();

  if (error || !data) {
    console.error("Create crop case failed:", error);
    return NextResponse.json(
      { error: "Could not start the crop check." },
      { status: 500 },
    );
  }

  return NextResponse.json({ cropCase: mapCropCaseRow(data) }, { status: 201 });
}
