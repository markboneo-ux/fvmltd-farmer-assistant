import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { CASE_PHOTO_SELECT, mapCasePhotoRow } from "@/lib/crop-check/photoMap";
import {
  CASE_PHOTO_BUCKET,
  isPhotoSlotKey,
  slotMeta,
  type CasePhotoRecord,
} from "@/lib/crop-check/photos";
import { asString, tryCreateAdminClient } from "@/lib/supabase/helpers";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function assertCaseOwned(
  caseId: string,
  farmerId: string,
) {
  const admin = tryCreateAdminClient();
  if (!admin.ok) {
    return { ok: false as const, status: 503 as const, error: admin.error };
  }

  const { data, error } = await admin.client
    .from("crop_checks")
    .select("id, farmer_id, status, guided_step")
    .eq("id", caseId)
    .eq("farmer_id", farmerId)
    .maybeSingle();

  if (error) {
    console.error("Crop case lookup for photos failed:", error);
    return {
      ok: false as const,
      status: 500 as const,
      error: "Could not verify crop case.",
    };
  }

  if (!data) {
    return {
      ok: false as const,
      status: 404 as const,
      error: "Crop case not found.",
    };
  }

  return { ok: true as const, client: admin.client, cropCase: data };
}

async function withPreviewUrls(
  client: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  rows: Parameters<typeof mapCasePhotoRow>[0][],
): Promise<CasePhotoRecord[]> {
  return Promise.all(
    rows.map(async (row) => {
      if (!row.storage_path || row.is_skipped) {
        return mapCasePhotoRow(row, null);
      }
      const { data } = await client.storage
        .from(row.storage_bucket ?? CASE_PHOTO_BUCKET)
        .createSignedUrl(row.storage_path, 60 * 60);
      return mapCasePhotoRow(row, data?.signedUrl ?? null);
    }),
  );
}

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const farmerId = new URL(request.url).searchParams.get("farmerId")?.trim();

  if (!farmerId) {
    return NextResponse.json(
      { error: "farmerId is required." },
      { status: 400 },
    );
  }

  const owned = await assertCaseOwned(id, farmerId);
  if (!owned.ok) {
    return NextResponse.json({ error: owned.error }, { status: owned.status });
  }

  const { data, error } = await owned.client
    .from("crop_photos")
    .select(CASE_PHOTO_SELECT)
    .eq("crop_check_id", id)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("List case photos failed:", error);
    return NextResponse.json(
      { error: "Could not load photographs." },
      { status: 500 },
    );
  }

  const photos = await withPreviewUrls(owned.client, data ?? []);
  return NextResponse.json({ photos });
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart form data." },
      { status: 400 },
    );
  }

  const farmerId = asString(form.get("farmerId")).trim();
  const slotKey = asString(form.get("slotKey")).trim();
  const file = form.get("file");

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
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json(
      { error: "Choose a photograph to upload." },
      { status: 400 },
    );
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json(
      { error: "Only image files are allowed." },
      { status: 400 },
    );
  }
  if (file.size > 10_000_000) {
    return NextResponse.json(
      { error: "Image must be 10 MB or smaller after compression." },
      { status: 400 },
    );
  }

  const owned = await assertCaseOwned(id, farmerId);
  if (!owned.ok) {
    return NextResponse.json({ error: owned.error }, { status: owned.status });
  }

  if (owned.cropCase.status !== "draft" && owned.cropCase.guided_step === "completed") {
    return NextResponse.json(
      { error: "This crop check is already complete." },
      { status: 409 },
    );
  }

  const meta = slotMeta(slotKey);
  const extension =
    file.type === "image/png"
      ? "png"
      : file.type === "image/webp"
        ? "webp"
        : "jpg";
  const storagePath = `${farmerId}/${id}/${slotKey}-${randomUUID()}.${extension}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const { data: existing } = await owned.client
    .from("crop_photos")
    .select("id, storage_path, storage_bucket")
    .eq("crop_check_id", id)
    .eq("slot_key", slotKey)
    .maybeSingle();

  const { error: uploadError } = await owned.client.storage
    .from(CASE_PHOTO_BUCKET)
    .upload(storagePath, bytes, {
      contentType: file.type || "image/jpeg",
      upsert: false,
    });

  if (uploadError) {
    console.error("Storage upload failed:", uploadError);
    return NextResponse.json(
      { error: "Could not store the photograph securely. Please try again." },
      { status: 500 },
    );
  }

  const row = {
    crop_check_id: id,
    farmer_id: farmerId,
    slot_key: slotKey,
    storage_path: storagePath,
    storage_bucket: CASE_PHOTO_BUCKET,
    label: meta.label,
    mime_type: file.type || "image/jpeg",
    file_size_bytes: file.size,
    sort_order: meta.sortOrder,
    is_skipped: false,
    uploaded_at: new Date().toISOString(),
    photo_type: "other",
  };

  const upsert = existing
    ? await owned.client
        .from("crop_photos")
        .update(row)
        .eq("id", existing.id)
        .select(CASE_PHOTO_SELECT)
        .single()
    : await owned.client
        .from("crop_photos")
        .insert(row)
        .select(CASE_PHOTO_SELECT)
        .single();

  if (upsert.error || !upsert.data) {
    console.error("crop_photos upsert failed:", upsert.error);
    await owned.client.storage.from(CASE_PHOTO_BUCKET).remove([storagePath]);
    return NextResponse.json(
      { error: "Could not save the photograph record." },
      { status: 500 },
    );
  }

  if (existing?.storage_path) {
    await owned.client.storage
      .from(existing.storage_bucket ?? CASE_PHOTO_BUCKET)
      .remove([existing.storage_path]);
  }

  // Keep guided step on photos while uploading
  if (owned.cropCase.guided_step !== "photos") {
    await owned.client
      .from("crop_checks")
      .update({ guided_step: "photos", status: "draft" })
      .eq("id", id);
  }

  const [photo] = await withPreviewUrls(owned.client, [upsert.data]);
  return NextResponse.json({ photo }, { status: existing ? 200 : 201 });
}
