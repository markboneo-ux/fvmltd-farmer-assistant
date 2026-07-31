import { NextResponse } from "next/server";
import { CROP_CASE_SELECT, mapCropCaseRow } from "@/lib/crop-check/map";
import { CASE_PHOTO_SELECT, mapCasePhotoRow } from "@/lib/crop-check/photoMap";
import {
  CASE_PHOTO_BUCKET,
  PHOTO_SLOTS,
  type PhotoSlotKey,
} from "@/lib/crop-check/photos";
import { asString, tryCreateAdminClient } from "@/lib/supabase/helpers";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
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

  const admin = tryCreateAdminClient();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: 503 });
  }

  const { data: cropCase, error: caseError } = await admin.client
    .from("crop_cases")
    .select("id, status, guided_step")
    .eq("id", id)
    .eq("farmer_id", farmerId)
    .maybeSingle();

  if (caseError) {
    console.error("Complete case lookup failed:", caseError);
    return NextResponse.json(
      { error: "Could not complete crop check." },
      { status: 500 },
    );
  }
  if (!cropCase) {
    return NextResponse.json({ error: "Crop case not found." }, { status: 404 });
  }
  if (cropCase.status !== "draft") {
    const { data } = await admin.client
      .from("crop_cases")
      .select(CROP_CASE_SELECT)
      .eq("id", id)
      .single();
    return NextResponse.json({
      cropCase: data ? mapCropCaseRow(data) : null,
      missingSlots: [],
    });
  }

  const { data: photos, error: photosError } = await admin.client
    .from("case_photos")
    .select(CASE_PHOTO_SELECT)
    .eq("crop_case_id", id);

  if (photosError) {
    console.error("Complete case photos lookup failed:", photosError);
    return NextResponse.json(
      { error: "Could not read photograph status." },
      { status: 500 },
    );
  }

  const bySlot = new Map(
    (photos ?? []).map((photo) => [photo.slot_key as PhotoSlotKey, photo]),
  );
  const missingSlots: PhotoSlotKey[] = [];

  for (const slot of PHOTO_SLOTS) {
    const existing = bySlot.get(slot.key);
    if (existing && !existing.is_skipped && existing.storage_path) {
      continue;
    }
    if (existing?.is_skipped) {
      missingSlots.push(slot.key);
      continue;
    }

    missingSlots.push(slot.key);
    const { error: skipError } = await admin.client.from("case_photos").upsert(
      {
        crop_case_id: id,
        slot_key: slot.key,
        storage_path: null,
        storage_bucket: CASE_PHOTO_BUCKET,
        label: slot.label,
        mime_type: null,
        file_size_bytes: null,
        sort_order: slot.sortOrder,
        is_skipped: true,
        uploaded_at: new Date().toISOString(),
      },
      { onConflict: "crop_case_id,slot_key" },
    );

    if (skipError) {
      console.error("Auto-skip missing photo failed:", skipError);
      return NextResponse.json(
        { error: "Could not finalize missing photographs." },
        { status: 500 },
      );
    }
  }

  const completedAt = new Date().toISOString();
  const { data: updated, error: updateError } = await admin.client
    .from("crop_cases")
    .update({
      status: "open",
      guided_step: "completed",
      completed_at: completedAt,
    })
    .eq("id", id)
    .eq("farmer_id", farmerId)
    .select(CROP_CASE_SELECT)
    .single();

  if (updateError || !updated) {
    console.error("Complete crop case failed:", updateError);
    return NextResponse.json(
      { error: "Could not complete the crop check." },
      { status: 500 },
    );
  }

  const { data: finalPhotos } = await admin.client
    .from("case_photos")
    .select(CASE_PHOTO_SELECT)
    .eq("crop_case_id", id)
    .order("sort_order", { ascending: true });

  return NextResponse.json({
    cropCase: mapCropCaseRow(updated),
    missingSlots,
    photos: (finalPhotos ?? []).map((row) => mapCasePhotoRow(row, null)),
  });
}
