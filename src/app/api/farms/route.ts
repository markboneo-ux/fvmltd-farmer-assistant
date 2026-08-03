import { NextResponse } from "next/server";
import { FARM_SELECT, mapFarmRow } from "@/lib/farms/map";
import type { FarmFormInput } from "@/lib/farms/types";
import { validateFarmForm } from "@/lib/farms/validation";
import { asString, tryCreateAdminClient } from "@/lib/supabase/helpers";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const farmerId = new URL(request.url).searchParams.get("farmerId")?.trim();
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

  const { data, error } = await admin.client
    .from("farms")
    .select(FARM_SELECT)
    .eq("farmer_id", farmerId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("List farms failed:", error);
    return NextResponse.json(
      { error: "Could not load farms." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    farms: (data ?? []).map((row) => mapFarmRow(row)),
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

  const input: FarmFormInput = {
    farmerId: asString(body.farmerId),
    name: asString(body.name),
    country: asString(body.country),
    countryOther: asString(body.countryOther),
    district: asString(body.district),
    farmSize: asString(body.farmSize),
    farmSizeUnit: asString(body.farmSizeUnit) as FarmFormInput["farmSizeUnit"],
    locationDescription: asString(body.locationDescription),
    latitude: asString(body.latitude),
    longitude: asString(body.longitude),
    waterSource: asString(body.waterSource) as FarmFormInput["waterSource"],
    drainageCondition: asString(
      body.drainageCondition,
    ) as FarmFormInput["drainageCondition"],
    growingSystem: asString(body.growingSystem) as FarmFormInput["growingSystem"],
  };

  const validation = validateFarmForm(input);
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

  const { data: farmer, error: farmerError } = await admin.client
    .from("farmers")
    .select("id")
    .eq("id", validation.data.farmerId)
    .maybeSingle();

  if (farmerError) {
    console.error("Farmer lookup failed:", farmerError);
    return NextResponse.json(
      {
        error: "Could not verify farmer.",
        errors: { form: "Could not verify farmer. Please try again." },
      },
      { status: 500 },
    );
  }

  if (!farmer) {
    return NextResponse.json(
      {
        error: "Farmer not found.",
        errors: {
          farmerId: "No registered farmer was found. Please register first.",
        },
      },
      { status: 404 },
    );
  }

  const payload = validation.data;
  const { data, error } = await admin.client
    .from("farms")
    .insert({
      farmer_id: payload.farmerId,
      name: payload.name,
      country: payload.country,
      district: payload.district,
      region: payload.district,
      farm_size: payload.farmSize,
      farm_size_unit: payload.farmSizeUnit,
      size_hectares: payload.sizeHectares,
      location_description: payload.locationDescription,
      latitude: payload.latitude,
      longitude: payload.longitude,
      water_source: payload.waterSource,
      drainage_condition: payload.drainageCondition,
      growing_system: payload.growingSystem,
    })
    .select(FARM_SELECT)
    .single();

  if (error || !data) {
    console.error("Create farm failed:", error);
    return NextResponse.json(
      {
        error: "Could not save the farm.",
        errors: { form: "Could not save the farm. Please try again." },
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ farm: mapFarmRow(data) }, { status: 201 });
}
