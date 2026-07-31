export const CASE_PHOTO_BUCKET = "case-photos";

export const PHOTO_SLOTS = [
  {
    key: "whole_field",
    label: "Whole field or crop area",
    hint: "Stand back and show the full plot or bed.",
    sortOrder: 1,
  },
  {
    key: "whole_plant",
    label: "Whole affected plant",
    hint: "Capture the full plant that shows the problem.",
    sortOrder: 2,
  },
  {
    key: "leaf_front",
    label: "Front of affected leaf",
    hint: "Close-up of the upper leaf surface.",
    sortOrder: 3,
  },
  {
    key: "leaf_back",
    label: "Back of affected leaf",
    hint: "Close-up of the underside of the same leaf.",
    sortOrder: 4,
  },
  {
    key: "damage_detail",
    label: "Stem, fruit, root, insect or damaged area",
    hint: "Focus on the damaged part or any insect you see.",
    sortOrder: 5,
  },
  {
    key: "healthy_comparison",
    label: "Healthy comparison plant",
    hint: "A nearby healthy plant of the same crop for comparison.",
    sortOrder: 6,
  },
] as const;

export type PhotoSlotKey = (typeof PHOTO_SLOTS)[number]["key"];

export type CasePhotoRecord = {
  id: string;
  cropCaseId: string;
  slotKey: PhotoSlotKey;
  storagePath: string | null;
  storageBucket: string;
  label: string | null;
  mimeType: string | null;
  fileSizeBytes: number | null;
  sortOrder: number;
  isSkipped: boolean;
  uploadedAt: string;
  previewUrl: string | null;
};

export function isPhotoSlotKey(value: string): value is PhotoSlotKey {
  return PHOTO_SLOTS.some((slot) => slot.key === value);
}

export function slotMeta(slotKey: PhotoSlotKey) {
  return PHOTO_SLOTS.find((slot) => slot.key === slotKey)!;
}
