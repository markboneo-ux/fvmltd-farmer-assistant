"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/Button";
import { FieldError } from "@/components/FieldError";
import {
  CROP_STAGE_OPTIONS,
  GROWING_ENVIRONMENT_OPTIONS,
  type CropCycleFormInput,
  type CropCycleRecord,
  type GrowingEnvironment,
} from "@/lib/crop-cycles/types";
import {
  validateCropCycleForm,
  type CropCycleFieldErrors,
} from "@/lib/crop-cycles/validation";
import { CROP_OPTIONS, type FarmSizeUnit } from "@/lib/farmers/types";
import { useRegisteredFarmer } from "@/lib/farmers/useRegisteredFarmer";
import type { FarmRecord } from "@/lib/farms/types";

const inputClass =
  "min-h-12 w-full rounded-xl border bg-surface px-3 text-sm text-ink outline-none ring-canopy/30 transition focus:ring-2";
const errorBorder = "border-danger";
const normalBorder = "border-line";

type FarmsResult = {
  farmerId: string;
  farms: FarmRecord[];
  error: string | null;
};

export function AddCropCycleForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const farmer = useRegisteredFarmer();
  const presetFarmId = searchParams.get("farmId") ?? "";

  const [farmsResult, setFarmsResult] = useState<FarmsResult | null>(null);
  const [values, setValues] = useState<CropCycleFormInput>({
    farmerId: "",
    farmId: presetFarmId,
    crop: "",
    variety: "",
    plantingDate: "",
    areaPlanted: "",
    areaUnit: "hectares",
    plantCount: "",
    growingEnvironment: "",
    previousCrop: "",
    currentStage: "",
  });
  const [errors, setErrors] = useState<CropCycleFieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!farmer?.id) return;

    const farmerId = farmer.id;
    let cancelled = false;

    fetch(`/api/farms?farmerId=${farmerId}`)
      .then(async (response) => {
        const payload = (await response.json()) as {
          farms?: FarmRecord[];
          error?: string;
        };
        if (cancelled) return;
        if (!response.ok) {
          setFarmsResult({
            farmerId,
            farms: [],
            error: payload.error ?? "Could not load your farms.",
          });
          return;
        }
        const list = payload.farms ?? [];
        setFarmsResult({ farmerId, farms: list, error: null });
        setValues((prev) => ({
          ...prev,
          farmerId,
          farmId:
            prev.farmId && list.some((farm) => farm.id === prev.farmId)
              ? prev.farmId
              : presetFarmId && list.some((farm) => farm.id === presetFarmId)
                ? presetFarmId
                : (list[0]?.id ?? ""),
        }));
      })
      .catch(() => {
        if (!cancelled) {
          setFarmsResult({
            farmerId,
            farms: [],
            error: "Could not load your farms. Check your connection.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [farmer?.id, presetFarmId]);

  function updateField<K extends keyof CropCycleFormInput>(
    key: K,
    value: CropCycleFormInput[K],
  ) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key] && !prev.form) return prev;
      const next = { ...prev };
      delete next[key];
      delete next.form;
      return next;
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!farmer?.id) {
      setErrors({
        form: "Register as a farmer first, then create a crop cycle.",
        farmerId: "Register as a farmer first, then create a crop cycle.",
      });
      return;
    }

    const local = validateCropCycleForm({ ...values, farmerId: farmer.id });
    if (!local.ok) {
      setErrors(local.errors);
      return;
    }

    setSubmitting(true);
    setErrors({});

    try {
      const response = await fetch("/api/crop-cycles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, farmerId: farmer.id }),
      });
      const payload = (await response.json()) as {
        cropCycle?: CropCycleRecord;
        error?: string;
        errors?: CropCycleFieldErrors;
      };

      if (!response.ok || !payload.cropCycle) {
        setErrors(
          payload.errors ?? {
            form:
              payload.error ??
              "Could not save the crop cycle. Please try again.",
          },
        );
        return;
      }

      startTransition(() => {
        router.push("/dashboard");
      });
    } catch {
      setErrors({
        form: "Network error. Check your connection and try again.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (!farmer) {
    return (
      <div className="space-y-4 rounded-2xl bg-surface px-4 py-5 ring-1 ring-line">
        <p className="text-sm text-ink">
          You need a farmer profile before creating a crop cycle.
        </p>
        <Button href="/register">Register as a farmer</Button>
      </div>
    );
  }

  const farmsMatch = farmsResult?.farmerId === farmer.id;
  const loadingFarms = !farmsMatch;
  const farms = farmsMatch ? farmsResult.farms : [];
  const farmsError = farmsMatch ? farmsResult.error : null;
  const busy = submitting || isPending || loadingFarms;

  if (farmsError) {
    return (
      <div className="space-y-4 rounded-2xl bg-danger/10 px-4 py-5 text-sm text-danger ring-1 ring-danger/30">
        <p>{farmsError}</p>
        <Button href="/farms/new" variant="secondary">
          Add a farm
        </Button>
      </div>
    );
  }

  if (!loadingFarms && farms.length === 0) {
    return (
      <div className="space-y-4 rounded-2xl bg-surface px-4 py-5 ring-1 ring-line">
        <p className="text-sm text-ink">
          Add a farm first, then create a crop cycle for that plot.
        </p>
        <Button href="/farms/new">Add a farm</Button>
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit} noValidate>
      {errors.form ? (
        <div
          className="rounded-xl bg-danger/10 px-3 py-3 text-sm font-medium text-danger ring-1 ring-danger/30"
          role="alert"
        >
          {errors.form}
        </div>
      ) : null}

      {loadingFarms ? (
        <p className="text-sm text-muted">Loading your farms…</p>
      ) : null}

      <label className="block space-y-1.5" htmlFor="farmId">
        <span className="text-sm font-medium text-ink">Farm</span>
        <select
          id="farmId"
          name="farmId"
          value={values.farmId}
          onChange={(event) => updateField("farmId", event.target.value)}
          disabled={busy}
          className={`${inputClass} ${errors.farmId ? errorBorder : normalBorder}`}
        >
          <option value="">Select farm</option>
          {farms.map((farm) => (
            <option key={farm.id} value={farm.id}>
              {farm.name} · {farm.district}
            </option>
          ))}
        </select>
        <FieldError message={errors.farmId} />
      </label>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-ink">Crop</legend>
        <div className="flex flex-wrap gap-2">
          {CROP_OPTIONS.map((crop) => {
            const selected =
              values.crop === crop ||
              (crop === "Other" &&
                Boolean(values.crop) &&
                !(CROP_OPTIONS as readonly string[]).includes(values.crop));
            return (
              <button
                key={crop}
                type="button"
                disabled={busy}
                onClick={() =>
                  updateField("crop", crop === "Other" ? "Other" : crop)
                }
                aria-pressed={selected}
                className={`inline-flex min-h-11 items-center rounded-xl px-3 py-2 text-sm font-medium ring-1 transition ${
                  selected
                    ? "bg-canopy text-white ring-canopy"
                    : "bg-surface text-ink ring-line hover:bg-sky/50"
                }`}
              >
                {crop}
              </button>
            );
          })}
        </div>
        {values.crop === "Other" ||
        (values.crop &&
          !(CROP_OPTIONS as readonly string[]).includes(values.crop)) ? (
          <input
            id="cropOther"
            name="cropOther"
            type="text"
            value={values.crop === "Other" ? "" : values.crop}
            onChange={(event) => updateField("crop", event.target.value)}
            placeholder="Enter crop name"
            disabled={busy}
            className={`${inputClass} ${errors.crop ? errorBorder : normalBorder}`}
          />
        ) : null}
        <FieldError message={errors.crop} />
      </fieldset>

      <label className="block space-y-1.5" htmlFor="variety">
        <span className="text-sm font-medium text-ink">Variety</span>
        <input
          id="variety"
          name="variety"
          type="text"
          value={values.variety}
          onChange={(event) => updateField("variety", event.target.value)}
          placeholder="e.g. Kiroba, Cal J"
          disabled={busy}
          className={`${inputClass} ${errors.variety ? errorBorder : normalBorder}`}
        />
        <FieldError message={errors.variety} />
      </label>

      <label className="block space-y-1.5" htmlFor="plantingDate">
        <span className="text-sm font-medium text-ink">Planting date</span>
        <input
          id="plantingDate"
          name="plantingDate"
          type="date"
          value={values.plantingDate}
          onChange={(event) => updateField("plantingDate", event.target.value)}
          disabled={busy}
          className={`${inputClass} ${errors.plantingDate ? errorBorder : normalBorder}`}
        />
        <FieldError message={errors.plantingDate} />
      </label>

      <div className="grid grid-cols-[1.4fr_1fr] gap-3">
        <label className="block space-y-1.5" htmlFor="areaPlanted">
          <span className="text-sm font-medium text-ink">Area planted</span>
          <input
            id="areaPlanted"
            name="areaPlanted"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={values.areaPlanted}
            onChange={(event) => updateField("areaPlanted", event.target.value)}
            placeholder="0.5"
            disabled={busy}
            className={`${inputClass} ${errors.areaPlanted ? errorBorder : normalBorder}`}
          />
          <FieldError message={errors.areaPlanted} />
        </label>
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium text-ink">Unit</legend>
          <div className="grid grid-cols-2 gap-2">
            {(["hectares", "acres"] as FarmSizeUnit[]).map((unit) => {
              const selected = values.areaUnit === unit;
              return (
                <button
                  key={unit}
                  type="button"
                  disabled={busy}
                  onClick={() => updateField("areaUnit", unit)}
                  aria-pressed={selected}
                  className={`min-h-12 rounded-xl px-2 text-sm font-semibold capitalize transition ring-1 ${
                    selected
                      ? "bg-canopy text-white ring-canopy"
                      : "bg-surface text-ink ring-line hover:bg-sky/50"
                  }`}
                >
                  {unit}
                </button>
              );
            })}
          </div>
          <FieldError message={errors.areaUnit} />
        </fieldset>
      </div>

      <label className="block space-y-1.5" htmlFor="plantCount">
        <span className="text-sm font-medium text-ink">
          Number of plants{" "}
          <span className="font-normal text-muted">(optional)</span>
        </span>
        <input
          id="plantCount"
          name="plantCount"
          type="number"
          inputMode="numeric"
          min="1"
          step="1"
          value={values.plantCount}
          onChange={(event) => updateField("plantCount", event.target.value)}
          placeholder="1200"
          disabled={busy}
          className={`${inputClass} ${errors.plantCount ? errorBorder : normalBorder}`}
        />
        <FieldError message={errors.plantCount} />
      </label>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-ink">Growing place</legend>
        <div className="grid grid-cols-1 gap-2">
          {GROWING_ENVIRONMENT_OPTIONS.map((option) => {
            const selected = values.growingEnvironment === option.value;
            return (
              <button
                key={option.value}
                type="button"
                disabled={busy}
                onClick={() =>
                  updateField(
                    "growingEnvironment",
                    option.value as GrowingEnvironment,
                  )
                }
                aria-pressed={selected}
                className={`min-h-12 rounded-xl px-3 text-left text-sm font-semibold transition ring-1 ${
                  selected
                    ? "bg-canopy text-white ring-canopy"
                    : "bg-surface text-ink ring-line hover:bg-sky/50"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <FieldError message={errors.growingEnvironment} />
      </fieldset>

      <label className="block space-y-1.5" htmlFor="previousCrop">
        <span className="text-sm font-medium text-ink">
          Previous crop{" "}
          <span className="font-normal text-muted">(optional)</span>
        </span>
        <input
          id="previousCrop"
          name="previousCrop"
          type="text"
          value={values.previousCrop}
          onChange={(event) => updateField("previousCrop", event.target.value)}
          placeholder="e.g. Maize, fallow"
          disabled={busy}
          className={`${inputClass} ${errors.previousCrop ? errorBorder : normalBorder}`}
        />
        <FieldError message={errors.previousCrop} />
      </label>

      <label className="block space-y-1.5" htmlFor="currentStage">
        <span className="text-sm font-medium text-ink">Current crop stage</span>
        <select
          id="currentStage"
          name="currentStage"
          value={values.currentStage}
          onChange={(event) =>
            updateField(
              "currentStage",
              event.target.value as CropCycleFormInput["currentStage"],
            )
          }
          disabled={busy}
          className={`${inputClass} ${errors.currentStage ? errorBorder : normalBorder}`}
        >
          <option value="">Select stage</option>
          {CROP_STAGE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <FieldError message={errors.currentStage} />
      </label>

      <Button type="submit" disabled={busy}>
        {busy ? "Saving crop cycle…" : "Save crop cycle"}
      </Button>
    </form>
  );
}
