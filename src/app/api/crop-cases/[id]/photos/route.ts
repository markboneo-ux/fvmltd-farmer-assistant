import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { mapCasePhotoRow } from "@/lib/crop-check/photoMap";
import {
  CASE_PHOTO_BUCKET,
  isPhotoSlotKey,
  slotMeta,
  type CasePhotoRecord,
} from "@/lib/crop-check/photos";
import {
  asString,
  describeFarmerRpcError,
  firstRpcRow,
  rpcRows,
  tryCreateAnonServerClient,
} from "@/lib/supabase/helpers";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function withPreviewUrls(
  client: SupabaseClient,
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

  const anon = tryCreateAnonServerClient();
  if (!anon.ok) {
    return NextResponse.json({ error: anon.error }, { status: 503 });
  }

  const { data, error } = await anon.client.rpc("list_crop_photos_for_farmer", {
    p_farmer_id: farmerId,
    p_check_id: id,
  });

  if (error) {
    console.error("List case photos failed:", error);
    const message = describeFarmerRpcError(error, "Could not load photographs.");
    const notFound = message.toLowerCase().includes("not found");
    return NextResponse.json(
      { error: message },
      { status: notFound ? 404 : 500 },
    );
  }

  const photos = await withPreviewUrls(
    anon.client,
    rpcRows<Parameters<typeof mapCasePhotoRow>[0]>(data),
  );
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

  const anon = tryCreateAnonServerClient();
  if (!anon.ok) {
    return NextResponse.json({ error: anon.error }, { status: 503 });
  }

  // Confirm ownership before uploading to storage
  const owned = await anon.client.rpc("get_crop_check_for_farmer", {
    p_farmer_id: farmerId,
    p_check_id: id,
  });
  const cropCase = firstRpcRow<{
    id: string;
    status: string;
    guided_step: string | null;
  }>(owned.data);
  if (owned.error || !cropCase) {
    const message = describeFarmerRpcError(
      owned.error,
      "Could not verify crop case.",
    );
    return NextResponse.json(
      { error: message },
      { status: message.toLowerCase().includes("not found") || !cropCase ? 404 : 500 },
    );
  }
  if (cropCase.status !== "draft" && cropCase.guided_step === "completed") {
    return NextResponse.json(
      { error: "This crop check is already complete." },
      { status: 409 },
    );
  }

  const existingList = await anon.client.rpc("list_crop_photos_for_farmer", {
    p_farmer_id: farmerId,
    p_check_id: id,
  });
  const existing = (Array.isArray(existingList.data) ? existingList.data : []).find(
    (photo: { slot_key?: string }) => photo.slot_key === slotKey,
  ) as
    | { id: string; storage_path: string | null; storage_bucket: string | null }
    | undefined;

  const meta = slotMeta(slotKey);
  const extension =
    file.type === "image/png"
      ? "png"
      : file.type === "image/webp"
        ? "webp"
        : "jpg";
  const storagePath = `${farmerId}/${id}/${slotKey}-${randomUUID()}.${extension}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await anon.client.storage
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

  const upsert = await anon.client.rpc("upsert_crop_photo_for_farmer", {
    p_farmer_id: farmerId,
    p_check_id: id,
    p_slot_key: slotKey,
    p_storage_path: storagePath,
    p_storage_bucket: CASE_PHOTO_BUCKET,
    p_label: meta.label,
    p_mime_type: file.type || "image/jpeg",
    p_file_size_bytes: file.size,
    p_sort_order: meta.sortOrder,
    p_is_skipped: false,
  });

  const row = firstRpcRow<Parameters<typeof mapCasePhotoRow>[0]>(upsert.data);
  if (upsert.error || !row) {
    console.error("crop_photos upsert failed:", upsert.error);
    await anon.client.storage.from(CASE_PHOTO_BUCKET).remove([storagePath]);
    return NextResponse.json(
      {
        error: describeFarmerRpcError(
          upsert.error,
          "Could not save the photograph record.",
        ),
      },
      { status: 500 },
    );
  }

  if (existing?.storage_path) {
    await anon.client.storage
      .from(existing.storage_bucket ?? CASE_PHOTO_BUCKET)
      .remove([existing.storage_path]);
  }

  const [photo] = await withPreviewUrls(anon.client, [row]);
  return NextResponse.json({ photo }, { status: existing ? 200 : 201 });
}
