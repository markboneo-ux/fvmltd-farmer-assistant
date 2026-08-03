import { NextResponse } from "next/server";
import { runPreliminaryAssessment } from "@/lib/assessment/runAssessment";
import { mapCropCaseRow } from "@/lib/crop-check/map";
import { mapCasePhotoRow } from "@/lib/crop-check/photoMap";
import type { PhotoSlotKey } from "@/lib/crop-check/photos";
import {
  asString,
  describeFarmerRpcError,
  tryCreateAnonServerClient,
} from "@/lib/supabase/helpers";

export const runtime = "nodejs";
export const maxDuration = 60;

type RouteContext = {
  params: Promise<{ id: string }>;
};

type CompletePayload = {
  crop_check: Parameters<typeof mapCropCaseRow>[0] | null;
  missing_slots: string[];
  photos: Parameters<typeof mapCasePhotoRow>[0][];
  already_complete?: boolean;
};

/**
 * Completes a crop check after the photo step.
 * Any still-missing required slots are recorded as skipped so the case
 * clearly reflects which photographs were not provided.
 */
export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
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

  const { data, error } = await anon.client.rpc("complete_crop_check_for_farmer", {
    p_farmer_id: farmerId,
    p_check_id: id,
  });

  if (error || !data) {
    console.error("Complete crop case failed:", error);
    const message = describeFarmerRpcError(
      error,
      "Could not complete the crop check.",
    );
    return NextResponse.json(
      { error: message },
      { status: message.toLowerCase().includes("not found") ? 404 : 500 },
    );
  }

  const payload = data as CompletePayload;
  const missingSlots = (payload.missing_slots ?? []) as PhotoSlotKey[];

  const assessmentResult = await runPreliminaryAssessment({
    client: anon.client,
    caseId: id,
    farmerId,
    force: false,
  });

  return NextResponse.json({
    cropCase: payload.crop_check ? mapCropCaseRow(payload.crop_check) : null,
    missingSlots,
    photos: (payload.photos ?? []).map((row) => mapCasePhotoRow(row, null)),
    assessment: assessmentResult.ok ? assessmentResult.assessment : null,
    assessmentError: assessmentResult.ok ? null : assessmentResult.error,
  });
}
