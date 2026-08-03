import { NextResponse } from "next/server";
import { mapCasePhotoRow } from "@/lib/crop-check/photoMap";
import {
  CASE_PHOTO_BUCKET,
  isPhotoSlotKey,
  slotMeta,
} from "@/lib/crop-check/photos";
import {
  asString,
  describeFarmerRpcError,
  firstRpcRow,
  tryCreateAnonServerClient,
} from "@/lib/supabase/helpers";

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

  const anon = tryCreateAnonServerClient();
  if (!anon.ok) {
    return NextResponse.json({ error: anon.error }, { status: 503 });
  }

  const existingList = await anon.client.rpc("list_crop_photos_for_farmer", {
    p_farmer_id: farmerId,
    p_check_id: id,
  });
  if (existingList.error) {
    const message = describeFarmerRpcError(
      existingList.error,
      "Could not verify crop case.",
    );
    return NextResponse.json(
      { error: message },
      { status: message.toLowerCase().includes("not found") ? 404 : 500 },
    );
  }

  const existing = (Array.isArray(existingList.data) ? existingList.data : []).find(
    (photo: { slot_key?: string }) => photo.slot_key === slotKey,
  ) as
    | { storage_path: string | null; storage_bucket: string | null }
    | undefined;

  if (existing?.storage_path) {
    await anon.client.storage
      .from(existing.storage_bucket ?? CASE_PHOTO_BUCKET)
      .remove([existing.storage_path]);
  }

  const meta = slotMeta(slotKey);
  const result = await anon.client.rpc("upsert_crop_photo_for_farmer", {
    p_farmer_id: farmerId,
    p_check_id: id,
    p_slot_key: slotKey,
    p_storage_path: null,
    p_storage_bucket: CASE_PHOTO_BUCKET,
    p_label: meta.label,
    p_mime_type: null,
    p_file_size_bytes: null,
    p_sort_order: meta.sortOrder,
    p_is_skipped: true,
  });

  const row = firstRpcRow<Parameters<typeof mapCasePhotoRow>[0]>(result.data);
  if (result.error || !row) {
    console.error("Skip photo failed:", result.error);
    return NextResponse.json(
      {
        error: describeFarmerRpcError(
          result.error,
          "Could not skip this photograph.",
        ),
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    photo: mapCasePhotoRow(row, null),
  });
}
