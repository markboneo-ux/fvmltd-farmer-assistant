import { NextResponse } from "next/server";
import { mapFarmRow } from "@/lib/farms/map";
import type { FarmFormInput } from "@/lib/farms/types";
import { validateFarmForm } from "@/lib/farms/validation";
import {
  asString,
  describeFarmerRpcError,
  firstRpcRow,
  rpcRows,
  tryCreateAnonServerClient,
} from "@/lib/supabase/helpers";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const farmerId = new URL(request.url).searchParams.get("farmerId")?.trim();
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

  const { data, error } = await anon.client.rpc("list_farms_for_farmer", {
    p_farmer_id: farmerId,
  });

  if (error) {
    console.error("List farms failed:", error);
    return NextResponse.json(
      { error: describeFarmerRpcError(error, "Could not load farms.") },
      { status: 500 },
    );
  }

  return NextResponse.json({
    farms: rpcRows<Parameters<typeof mapFarmRow>[0]>(data).map((row) =>
      mapFarmRow(row),
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
  const { data, error } = await anon.client.rpc("create_farm_for_farmer", {
    p_farmer_id: payload.farmerId,
    p_name: payload.name,
    p_country: payload.country,
    p_district: payload.district,
    p_farm_size: payload.farmSize,
    p_farm_size_unit: payload.farmSizeUnit,
    p_size_hectares: payload.sizeHectares,
    p_location_description: payload.locationDescription,
    p_latitude: payload.latitude,
    p_longitude: payload.longitude,
    p_water_source: payload.waterSource,
    p_drainage_condition: payload.drainageCondition,
    p_growing_system: payload.growingSystem,
  });

  const row = firstRpcRow<Parameters<typeof mapFarmRow>[0]>(data);
  if (error || !row) {
    console.error("Create farm failed:", error);
    const message = describeFarmerRpcError(
      error,
      "Could not save the farm. Please try again.",
    );
    const notFound = message.toLowerCase().includes("no registered farmer");
    return NextResponse.json(
      {
        error: message,
        errors: notFound
          ? {
              farmerId:
                "No registered farmer was found. Please register first.",
            }
          : { form: message },
      },
      { status: notFound ? 404 : 500 },
    );
  }

  return NextResponse.json({ farm: mapFarmRow(row) }, { status: 201 });
}
