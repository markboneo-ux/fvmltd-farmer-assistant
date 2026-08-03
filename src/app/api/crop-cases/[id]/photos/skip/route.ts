import { NextResponse } from "next/server";
import { CASE_PHOTO_SELECT, mapCasePhotoRow } from "@/lib/crop-check/photoMap";
import {
  CASE_PHOTO_BUCKET,
  isPhotoSlotKey,
  slotMeta,
} from "@/lib/crop-check/photos";
import { asString, tryCreateAdminClient } from "@/lib/supabase/helpers";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

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
  const slotKey = asString(body.slotKey).trim();

  if (!farmerId) {
    return NextResponse.json(
      { error: "farmerId is required." },
      { status: 400 },
    );
  }
  if (!isPhotoSlotKey(slotKey)) {
    return NextResponse.json(
      { error: "A valid photograph slot is required." },
      { status: 400 },
    );
  }

  const admin = tryCreateAdminClient();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: 503 });
  }

  const { data: cropCase, error: caseError } = await admin.client
    .from("crop_checks")
    .select("id, status, guided_step")
    .eq("id", id)
    .eq("farmer_id", farmerId)
    .maybeSingle();

  if (caseError) {
    console.error("Crop case lookup for skip failed:", caseError);
    return NextResponse.json(
      { error: "Could not verify crop case." },
      { status: 500 },
    );
  }
  if (!cropCase) {
    return NextResponse.json({ error: "Crop case not found." }, { status: 404 });
  }
  if (cropCase.status !== "draft" && cropCase.guided_step === "completed") {
    return NextResponse.json(
      { error: "This crop check is already complete." },
      { status: 409 },
    );
  }

  const meta = slotMeta(slotKey);
  const { data: existing } = await admin.client
    .from("crop_photos")
    .select("id, storage_path, storage_bucket")
    .eq("crop_check_id", id)
    .eq("slot_key", slotKey)
    .maybeSingle();

  if (existing?.storage_path) {
    await admin.client.storage
      .from(existing.storage_bucket ?? CASE_PHOTO_BUCKET)
      .remove([existing.storage_path]);
  }

  const row = {
    crop_check_id: id,
    farmer_id: farmerId,
    slot_key: slotKey,
    storage_path: null,
    storage_bucket: CASE_PHOTO_BUCKET,
    label: meta.label,
    mime_type: null,
    file_size_bytes: null,
    sort_order: meta.sortOrder,
    is_skipped: true,
    uploaded_at: new Date().toISOString(),
    photo_type: "other",
  };

  const result = existing
    ? await admin.client
        .from("crop_photos")
        .update(row)
        .eq("id", existing.id)
        .select(CASE_PHOTO_SELECT)
        .single()
    : await admin.client
        .from("crop_photos")
        .insert(row)
        .select(CASE_PHOTO_SELECT)
        .single();

  if (result.error || !result.data) {
    console.error("Skip photo failed:", result.error);
    return NextResponse.json(
      { error: "Could not skip this photograph." },
      { status: 500 },
    );
  }

  return NextResponse.json({ photo: mapCasePhotoRow(result.data, null) });
}
