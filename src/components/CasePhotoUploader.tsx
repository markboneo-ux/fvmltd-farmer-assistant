"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/Button";
import type { AssessmentRecord } from "@/lib/assessment/types";
import { compressImageForUpload } from "@/lib/crop-check/compressImage";
import {
  PHOTO_SLOTS,
  type CasePhotoRecord,
  type PhotoSlotKey,
} from "@/lib/crop-check/photos";

type SlotState = {
  key: PhotoSlotKey;
  label: string;
  hint: string;
  status: "missing" | "uploaded" | "skipped";
  photo: CasePhotoRecord | null;
  localPreview: string | null;
  uploading: boolean;
};

type Props = {
  caseId: string;
  farmerId: string;
  onCompleted?: (result: {
    missingSlots: PhotoSlotKey[];
    assessment: AssessmentRecord | null;
    assessmentError: string | null;
  }) => void;
  completeLabel?: string;
};

export function CasePhotoUploader({
  caseId,
  farmerId,
  onCompleted,
  completeLabel = "Finish crop check",
}: Props) {
  const [photos, setPhotos] = useState<CasePhotoRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busySlot, setBusySlot] = useState<PhotoSlotKey | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [localPreviews, setLocalPreviews] = useState<
    Partial<Record<PhotoSlotKey, string>>
  >({});
  const inputRefs = useRef<Partial<Record<PhotoSlotKey, HTMLInputElement | null>>>(
    {},
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/crop-cases/${caseId}/photos?farmerId=${farmerId}`,
        );
        const payload = (await response.json()) as {
          photos?: CasePhotoRecord[];
          error?: string;
        };
        if (cancelled) return;
        if (!response.ok) {
          setError(payload.error ?? "Could not load photographs.");
          return;
        }
        setPhotos(payload.photos ?? []);
      } catch {
        if (!cancelled) setError("Could not load photographs.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [caseId, farmerId]);

  const slots: SlotState[] = useMemo(() => {
    return PHOTO_SLOTS.map((slot) => {
      const photo = photos.find((item) => item.slotKey === slot.key) ?? null;
      let status: SlotState["status"] = "missing";
      if (photo?.isSkipped) status = "skipped";
      else if (photo?.storagePath) status = "uploaded";
      return {
        key: slot.key,
        label: slot.label,
        hint: slot.hint,
        status,
        photo,
        localPreview: localPreviews[slot.key] ?? photo?.previewUrl ?? null,
        uploading: busySlot === slot.key,
      };
    });
  }, [photos, localPreviews, busySlot]);

  const missingRequired = slots.filter((slot) => slot.status === "missing");
  const skippedRequired = slots.filter((slot) => slot.status === "skipped");
  const uploadedCount = slots.filter((slot) => slot.status === "uploaded").length;

  async function handleFileChosen(slotKey: PhotoSlotKey, file: File | null) {
    if (!file) return;
    setBusySlot(slotKey);
    setError(null);

    try {
      const compressed = await compressImageForUpload(file);
      const previewUrl = URL.createObjectURL(compressed);
      setLocalPreviews((prev) => ({ ...prev, [slotKey]: previewUrl }));

      const body = new FormData();
      body.set("farmerId", farmerId);
      body.set("slotKey", slotKey);
      body.set("file", compressed);

      const response = await fetch(`/api/crop-cases/${caseId}/photos`, {
        method: "POST",
        body,
      });
      const payload = (await response.json()) as {
        photo?: CasePhotoRecord;
        error?: string;
      };
      if (!response.ok || !payload.photo) {
        throw new Error(payload.error ?? "Upload failed.");
      }

      setPhotos((prev) => {
        const others = prev.filter((item) => item.slotKey !== slotKey);
        return [...others, payload.photo!].sort(
          (a, b) => a.sortOrder - b.sortOrder,
        );
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusySlot(null);
    }
  }

  async function handleSkip(slotKey: PhotoSlotKey) {
    setBusySlot(slotKey);
    setError(null);
    try {
      const response = await fetch(`/api/crop-cases/${caseId}/photos/skip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ farmerId, slotKey }),
      });
      const payload = (await response.json()) as {
        photo?: CasePhotoRecord;
        error?: string;
      };
      if (!response.ok || !payload.photo) {
        throw new Error(payload.error ?? "Could not skip photograph.");
      }
      setPhotos((prev) => {
        const others = prev.filter((item) => item.slotKey !== slotKey);
        return [...others, payload.photo!].sort(
          (a, b) => a.sortOrder - b.sortOrder,
        );
      });
      setLocalPreviews((prev) => {
        const next = { ...prev };
        delete next[slotKey];
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not skip photograph.");
    } finally {
      setBusySlot(null);
    }
  }

  async function handleFinish() {
    setFinishing(true);
    setError(null);
    try {
      const response = await fetch(`/api/crop-cases/${caseId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ farmerId }),
      });
      const payload = (await response.json()) as {
        missingSlots?: PhotoSlotKey[];
        assessment?: AssessmentRecord | null;
        assessmentError?: string | null;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not finish crop check.");
      }
      onCompleted?.({
        missingSlots: payload.missingSlots ?? [],
        assessment: payload.assessment ?? null,
        assessmentError: payload.assessmentError ?? null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not finish.");
    } finally {
      setFinishing(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted">Loading photograph slots…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-sun/20 px-3 py-3 text-sm text-soil ring-1 ring-sun/40">
        Tip: Use daylight, fill the frame, and keep fingers out of the shot. Large
        photos are compressed on your phone before upload.
      </div>

      <div className="rounded-2xl bg-surface px-3 py-3 text-sm ring-1 ring-line">
        <p className="font-semibold text-ink">
          {uploadedCount} of {PHOTO_SLOTS.length} required photos uploaded
        </p>
        {missingRequired.length > 0 ? (
          <p className="mt-1 text-danger">
            Missing required photos:{" "}
            {missingRequired.map((slot) => slot.label).join(", ")}
          </p>
        ) : null}
        {skippedRequired.length > 0 ? (
          <p className="mt-1 text-warn">
            Skipped (still required for a complete record):{" "}
            {skippedRequired.map((slot) => slot.label).join(", ")}
          </p>
        ) : null}
        {missingRequired.length === 0 && skippedRequired.length === 0 ? (
          <p className="mt-1 text-ok">All required photographs are uploaded.</p>
        ) : null}
      </div>

      {error ? (
        <p className="text-xs font-medium text-danger" role="alert">
          {error}
        </p>
      ) : null}

      <ul className="space-y-3">
        {slots.map((slot) => {
          const tone =
            slot.status === "uploaded"
              ? "border-solid border-canopy bg-canopy/5"
              : slot.status === "skipped"
                ? "border-solid border-warn/50 bg-sun/10"
                : "border-dashed border-danger/50 bg-danger/5";

          return (
            <li key={slot.key}>
              <div className={`rounded-2xl border-2 px-4 py-4 ${tone}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink">{slot.label}</p>
                    <p className="mt-1 text-xs text-muted">{slot.hint}</p>
                    <p className="mt-2 text-[11px] font-semibold tracking-wide uppercase">
                      {slot.uploading
                        ? "Uploading…"
                        : slot.status === "uploaded"
                          ? "Photo added"
                          : slot.status === "skipped"
                            ? "Skipped — required photo missing"
                            : "Required — not added yet"}
                    </p>
                  </div>
                  {slot.localPreview && slot.status === "uploaded" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={slot.localPreview}
                      alt={slot.label}
                      className="h-16 w-16 shrink-0 rounded-lg object-cover ring-1 ring-line"
                    />
                  ) : null}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={Boolean(busySlot) || finishing}
                    onClick={() => inputRefs.current[slot.key]?.click()}
                    className="min-h-11 rounded-xl bg-canopy text-xs font-semibold text-white disabled:opacity-60"
                  >
                    {slot.status === "uploaded" ? "Replace photo" : "Add photo"}
                  </button>
                  <button
                    type="button"
                    disabled={
                      Boolean(busySlot) || finishing || slot.status === "skipped"
                    }
                    onClick={() => void handleSkip(slot.key)}
                    className="min-h-11 rounded-xl bg-surface text-xs font-semibold text-ink ring-1 ring-line disabled:opacity-60"
                  >
                    Skip for now
                  </button>
                </div>
                <input
                  ref={(element) => {
                    inputRefs.current[slot.key] = element;
                  }}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    event.target.value = "";
                    void handleFileChosen(slot.key, file);
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>

      <Button
        type="button"
        disabled={finishing || Boolean(busySlot)}
        onClick={() => void handleFinish()}
      >
        {finishing ? "Saving & assessing…" : completeLabel}
      </Button>
      {(missingRequired.length > 0 || skippedRequired.length > 0) && (
        <p className="text-center text-xs text-muted">
          You can finish with missing photos. They will stay marked as missing or
          skipped on this crop check.
        </p>
      )}
    </div>
  );
}
