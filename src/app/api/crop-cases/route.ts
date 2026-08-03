import { NextResponse } from "next/server";
import { mapCropCaseRow } from "@/lib/crop-check/map";
import { isCropCheckCrop } from "@/lib/crop-check/validation";
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
  const status = searchParams.get("status")?.trim() || null;
  const id = searchParams.get("id")?.trim() || null;

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

  const { data, error } = await anon.client.rpc("list_crop_checks_for_farmer", {
    p_farmer_id: farmerId,
    p_status: status,
    p_id: id,
  });

  if (error) {
    console.error("List crop cases failed:", error);
    return NextResponse.json(
      { error: describeFarmerRpcError(error, "Could not load crop cases.") },
      { status: 500 },
    );
  }

  return NextResponse.json({
    cropCases: rpcRows<Parameters<typeof mapCropCaseRow>[0]>(data).map((row) =>
      mapCropCaseRow(row),
    ),
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

  const anon = tryCreateAnonServerClient();
  if (!anon.ok) {
    return NextResponse.json({ error: anon.error }, { status: 503 });
  }

  const { data, error } = await anon.client.rpc("create_crop_check_for_farmer", {
    p_farmer_id: farmerId,
    p_crop_cycle_id: cropCycleId,
    p_crop_name: cropName,
  });

  const row = firstRpcRow<Parameters<typeof mapCropCaseRow>[0]>(data);
  if (error || !row) {
    console.error("Create crop case failed:", error);
    const message = describeFarmerRpcError(
      error,
      "Could not start the crop check.",
    );
    const notFound = message.toLowerCase().includes("not found");
    return NextResponse.json(
      { error: message },
      { status: notFound ? 404 : 500 },
    );
  }

  return NextResponse.json({ cropCase: mapCropCaseRow(row) }, { status: 201 });
}
