import type { CasePhotoRecord, PhotoSlotKey } from "./photos";
import { CASE_PHOTO_BUCKET } from "./photos";

type CasePhotoRow = {
  id: string;
  crop_case_id: string;
  slot_key: string;
  storage_path: string | null;
  storage_bucket: string | null;
  label: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  sort_order: number;
  is_skipped: boolean;
  uploaded_at: string;
};

export const CASE_PHOTO_SELECT =
  "id, crop_case_id, slot_key, storage_path, storage_bucket, label, mime_type, file_size_bytes, sort_order, is_skipped, uploaded_at";

export function mapCasePhotoRow(
  row: CasePhotoRow,
  previewUrl: string | null = null,
): CasePhotoRecord {
  return {
    id: row.id,
    cropCaseId: row.crop_case_id,
    slotKey: row.slot_key as PhotoSlotKey,
    storagePath: row.storage_path,
    storageBucket: row.storage_bucket ?? CASE_PHOTO_BUCKET,
    label: row.label,
    mimeType: row.mime_type,
    fileSizeBytes: row.file_size_bytes,
    sortOrder: row.sort_order,
    isSkipped: row.is_skipped,
    uploadedAt: row.uploaded_at,
    previewUrl,
  };
}
