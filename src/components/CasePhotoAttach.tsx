"use client";

import {
  forwardRef,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { compressImageForUpload } from "@/lib/crop-check/compressImage";
import {
  CASE_IMAGE_ACCEPT,
  CASE_IMAGE_COMPRESSED_MAX_BYTES,
  CASE_IMAGE_MAX_COUNT,
  FARMER_PHOTO_LIMIT,
  FARMER_PHOTO_TOO_LARGE,
  FARMER_PHOTO_UNSUPPORTED,
  FARMER_PHOTO_UPLOAD_FAILED,
  validateCaseImageMeta,
} from "@/lib/chat/case-images";

export type AttachedCaseImage = {
  id: string;
  file: File;
  previewUrl: string;
  fileName: string;
  mimeType: string;
};

export type CasePhotoAttachHandle = {
  openLibrary: () => void;
  openCamera: () => void;
};

type CasePhotoAttachProps = {
  images: AttachedCaseImage[];
  onChange: (images: AttachedCaseImage[]) => void;
  disabled?: boolean;
  uploading?: boolean;
  variant?: "composer" | "button";
};

export const CasePhotoAttach = forwardRef<
  CasePhotoAttachHandle,
  CasePhotoAttachProps
>(function CasePhotoAttach(
  {
    images,
    onChange,
    disabled = false,
    uploading = false,
    variant = "composer",
  },
  ref,
) {
  const inputId = useId();
  const libraryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  function openLibrary() {
    setError(null);
    libraryRef.current?.click();
  }

  function openCamera() {
    setError(null);
    cameraRef.current?.click();
  }

  useImperativeHandle(ref, () => ({ openLibrary, openCamera }));

  function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;

    const next = [...images];
    const errors: string[] = [];

    for (const file of Array.from(fileList)) {
      if (next.length >= CASE_IMAGE_MAX_COUNT) {
        errors.push(FARMER_PHOTO_LIMIT);
        break;
      }
      const check = validateCaseImageMeta(file);
      if (!check.ok) {
        errors.push(check.farmerError);
        continue;
      }

      next.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        previewUrl: URL.createObjectURL(file),
        fileName: file.name || "crop-photo.jpg",
        mimeType: file.type || "image/jpeg",
      });
    }

    onChange(next);
    setError(errors[0] ?? null);
    if (libraryRef.current) libraryRef.current.value = "";
    if (cameraRef.current) cameraRef.current.value = "";
  }

  function removeImage(id: string) {
    const target = images.find((item) => item.id === id);
    if (target) URL.revokeObjectURL(target.previewUrl);
    onChange(images.filter((item) => item.id !== id));
    setError(null);
  }

  const inputs = (
    <>
      <input
        id={`${inputId}-library`}
        ref={libraryRef}
        type="file"
        accept={CASE_IMAGE_ACCEPT}
        multiple
        className="sr-only"
        disabled={disabled || uploading || images.length >= CASE_IMAGE_MAX_COUNT}
        onChange={(event) => handleFiles(event.target.files)}
      />
      <input
        id={`${inputId}-camera`}
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        disabled={disabled || uploading || images.length >= CASE_IMAGE_MAX_COUNT}
        onChange={(event) => handleFiles(event.target.files)}
      />
    </>
  );

  const thumbs =
    images.length > 0 ? (
      <ul className="flex flex-wrap gap-2">
        {images.map((image) => (
          <li key={image.id} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image.previewUrl}
              alt={image.fileName}
              className="h-16 w-16 rounded-xl object-cover ring-1 ring-line"
            />
            <button
              type="button"
              onClick={() => removeImage(image.id)}
              disabled={disabled || uploading}
              className="absolute -top-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-canopy text-xs font-bold text-white disabled:opacity-50"
              aria-label={`Remove ${image.fileName}`}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    ) : null;

  if (variant === "button") {
    return (
      <div className="space-y-2">
        {inputs}
        <button
          type="button"
          onClick={openLibrary}
          disabled={disabled || uploading || images.length >= CASE_IMAGE_MAX_COUNT}
          className="min-h-11 w-full rounded-xl bg-sky/70 px-3 py-2 text-sm font-semibold text-canopy ring-1 ring-line transition hover:bg-sky disabled:opacity-50"
        >
          {uploading
            ? "Uploading photo…"
            : images.length > 0
              ? `Upload Photo (${images.length}/${CASE_IMAGE_MAX_COUNT})`
              : "Upload Photo"}
        </button>
        {error ? (
          <p className="text-xs font-medium text-danger" role="alert">
            {error}
          </p>
        ) : null}
        {thumbs}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {inputs}
      {thumbs}
      {error ? (
        <p className="text-xs font-medium text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {uploading && images.length > 0 ? (
        <p className="text-xs text-muted">Uploading and analysing photo…</p>
      ) : null}
    </div>
  );
});

export async function prepareCaseImageFiles(
  images: AttachedCaseImage[],
): Promise<File[]> {
  const files: File[] = [];

  for (const image of images) {
    let prepared: File;
    try {
      prepared = await compressImageForUpload(image.file, {
        maxEdge: 1600,
        quality: 0.7,
        maxBytes: CASE_IMAGE_COMPRESSED_MAX_BYTES,
      });
    } catch {
      throw new Error(
        image.file.size > 4_000_000
          ? FARMER_PHOTO_TOO_LARGE
          : FARMER_PHOTO_UPLOAD_FAILED,
      );
    }

    const stillHeic =
      /heic|heif/i.test(prepared.type) || /\.(heic|heif)$/i.test(prepared.name);
    if (stillHeic) {
      throw new Error(FARMER_PHOTO_UNSUPPORTED);
    }

    if (prepared.size > CASE_IMAGE_COMPRESSED_MAX_BYTES * 1.4) {
      throw new Error(FARMER_PHOTO_TOO_LARGE);
    }

    files.push(prepared);
  }

  return files;
}

/** @deprecated Prefer multipart + prepareCaseImageFiles. Kept for JSON fallbacks. */
export async function filesToCaseImagePayload(
  images: AttachedCaseImage[],
): Promise<Array<{ mimeType: string; base64: string; fileName: string }>> {
  const files = await prepareCaseImageFiles(images);
  const result: Array<{ mimeType: string; base64: string; fileName: string }> =
    [];

  for (const file of files) {
    const dataUrl = await readFileAsDataUrl(file);
    const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
    result.push({
      mimeType: file.type || "image/jpeg",
      base64,
      fileName: file.name,
    });
  }

  return result;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error(FARMER_PHOTO_UPLOAD_FAILED));
    reader.readAsDataURL(file);
  });
}
