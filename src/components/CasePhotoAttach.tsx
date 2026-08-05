"use client";

import { useId, useRef, useState } from "react";

export type AttachedCaseImage = {
  id: string;
  file: File;
  previewUrl: string;
  fileName: string;
  mimeType: string;
};

const ACCEPT =
  "image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif";

const MAX_IMAGES = 3;
const MAX_BYTES = 8_000_000;

type CasePhotoAttachProps = {
  images: AttachedCaseImage[];
  onChange: (images: AttachedCaseImage[]) => void;
  disabled?: boolean;
  uploading?: boolean;
};

function isSupportedImage(file: File): boolean {
  const type = file.type.toLowerCase();
  if (
    type === "image/jpeg" ||
    type === "image/png" ||
    type === "image/webp" ||
    type === "image/heic" ||
    type === "image/heif"
  ) {
    return true;
  }
  // Some mobile browsers omit type for HEIC.
  return /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
}

export function CasePhotoAttach({
  images,
  onChange,
  disabled = false,
  uploading = false,
}: CasePhotoAttachProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  function openPicker() {
    setError(null);
    inputRef.current?.click();
  }

  function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;

    const next = [...images];
    const errors: string[] = [];

    for (const file of Array.from(fileList)) {
      if (next.length >= MAX_IMAGES) {
        errors.push(`You can attach up to ${MAX_IMAGES} photos per message.`);
        break;
      }
      if (!isSupportedImage(file)) {
        errors.push(`${file.name}: unsupported file type.`);
        continue;
      }
      if (file.size > MAX_BYTES) {
        errors.push(`${file.name}: file is larger than 8 MB.`);
        continue;
      }

      next.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        previewUrl: URL.createObjectURL(file),
        fileName: file.name,
        mimeType: file.type || "image/jpeg",
      });
    }

    onChange(next);
    setError(errors[0] ?? null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function removeImage(id: string) {
    const target = images.find((item) => item.id === id);
    if (target) URL.revokeObjectURL(target.previewUrl);
    onChange(images.filter((item) => item.id !== id));
    setError(null);
  }

  return (
    <div className="space-y-2">
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        capture="environment"
        multiple
        className="sr-only"
        disabled={disabled || uploading || images.length >= MAX_IMAGES}
        onChange={(event) => handleFiles(event.target.files)}
      />

      <button
        type="button"
        onClick={openPicker}
        disabled={disabled || uploading || images.length >= MAX_IMAGES}
        className="min-h-11 w-full rounded-xl bg-sky/70 px-3 py-2 text-sm font-semibold text-canopy ring-1 ring-line transition hover:bg-sky disabled:opacity-50"
      >
        {uploading
          ? "Uploading photo…"
          : images.length > 0
            ? `Upload Photo (${images.length}/${MAX_IMAGES})`
            : "Upload Photo"}
      </button>

      {error ? (
        <p className="text-xs font-medium text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {images.length > 0 ? (
        <ul className="space-y-2">
          {images.map((image) => (
            <li
              key={image.id}
              className="flex items-center gap-3 rounded-xl bg-field px-2 py-2 ring-1 ring-line"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.previewUrl}
                alt={image.fileName}
                className="h-14 w-14 rounded-lg object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-ink">
                  {image.fileName}
                </p>
                {uploading ? (
                  <p className="text-[0.7rem] text-muted">Sending…</p>
                ) : (
                  <p className="text-[0.7rem] text-muted">Ready to send</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => removeImage(image.id)}
                disabled={disabled || uploading}
                className="min-h-9 rounded-lg px-2 text-xs font-semibold text-danger ring-1 ring-danger/30"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export async function filesToCaseImagePayload(
  images: AttachedCaseImage[],
): Promise<Array<{ mimeType: string; base64: string; fileName: string }>> {
  const result: Array<{ mimeType: string; base64: string; fileName: string }> =
    [];

  for (const image of images) {
    const buffer = await image.file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    result.push({
      mimeType: image.mimeType || "image/jpeg",
      base64: btoa(binary),
      fileName: image.fileName,
    });
  }

  return result;
}
