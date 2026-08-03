"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/Button";
import { FieldError } from "@/components/FieldError";
import {
  COUNTRY_OPTIONS,
  DEFAULT_COUNTRY,
  isOtherCountryOption,
} from "@/data/countries";
import type { FarmSizeUnit, RegisteredFarmer } from "@/lib/farmers/types";
import { useRegisteredFarmer } from "@/lib/farmers/useRegisteredFarmer";
import {
  DRAINAGE_OPTIONS,
  GROWING_SYSTEM_OPTIONS,
  WATER_SOURCE_OPTIONS,
  type FarmFormInput,
  type FarmRecord,
} from "@/lib/farms/types";
import {
  validateFarmForm,
  type FarmFieldErrors,
} from "@/lib/farms/validation";

const inputClass =
  "min-h-12 w-full rounded-xl border bg-surface px-3 text-sm text-ink outline-none ring-canopy/30 transition focus:ring-2";
const errorBorder = "border-danger";
const normalBorder = "border-line";

function buildInitialFarmForm(farmer: RegisteredFarmer): FarmFormInput {
  const knownCountry = COUNTRY_OPTIONS.includes(
    farmer.country as (typeof COUNTRY_OPTIONS)[number],
  );
  const country = knownCountry
    ? farmer.country
    : farmer.country
      ? "Other Country"
      : DEFAULT_COUNTRY;

  return {
    farmerId: farmer.id,
    name: "",
    country,
    countryOther: knownCountry ? "" : farmer.country || "",
    district: farmer.district || "",
    farmSize: farmer.farmSize ? String(farmer.farmSize) : "",
    farmSizeUnit: farmer.farmSizeUnit || "hectares",
    locationDescription: "",
    latitude: "",
    longitude: "",
    waterSource: "",
    drainageCondition: "",
    growingSystem: "",
  };
}

export function AddFarmForm() {
  const farmer = useRegisteredFarmer();

  if (!farmer) {
    return (
      <div className="space-y-4 rounded-2xl bg-surface px-4 py-5 ring-1 ring-line">
        <p className="text-sm text-ink">
          You need a farmer profile before adding a farm.
        </p>
        <Button href="/register">Register as a farmer</Button>
      </div>
    );
  }

  return <AddFarmFormFields key={farmer.id} farmer={farmer} />;
}

function AddFarmFormFields({ farmer }: { farmer: RegisteredFarmer }) {
  const router = useRouter();
  const [values, setValues] = useState<FarmFormInput>(() =>
    buildInitialFarmForm(farmer),
  );
  const [errors, setErrors] = useState<FarmFieldErrors>({});
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isPending, startTransition] = useTransition();
  const busy = submitting || isPending || locating;
  const showOtherCountry = isOtherCountryOption(values.country);

  function updateField<K extends keyof FarmFormInput>(
    key: K,
    value: FarmFormInput[K],
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

  function shareLocation() {
    if (!navigator.geolocation) {
      setErrors((prev) => ({
        ...prev,
        locationDescription:
          "Location sharing is not available on this device. Enter a description or coordinates instead.",
      }));
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        updateField("latitude", position.coords.latitude.toFixed(6));
        updateField("longitude", position.coords.longitude.toFixed(6));
        setLocating(false);
      },
      () => {
        setLocating(false);
        setErrors((prev) => ({
          ...prev,
          locationDescription:
            "Could not read GPS. Allow location access or enter the place name / coordinates.",
        }));
      },
      { enableHighAccuracy: true, timeout: 12000 },
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!farmer?.id) {
      setErrors({
        form: "Register as a farmer first, then add your farm.",
        farmerId: "Register as a farmer first, then add your farm.",
      });
      return;
    }

    const local = validateFarmForm({ ...values, farmerId: farmer.id });
    if (!local.ok) {
      setErrors(local.errors);
      return;
    }

    setSubmitting(true);
    setErrors({});

    try {
      const response = await fetch("/api/farms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, farmerId: farmer.id }),
      });
      const payload = (await response.json()) as {
        farm?: FarmRecord;
        error?: string;
        errors?: FarmFieldErrors;
      };

      if (!response.ok || !payload.farm) {
        setErrors(
          payload.errors ?? {
            form: payload.error ?? "Could not save the farm. Please try again.",
          },
        );
        return;
      }

      startTransition(() => {
        router.push(`/crop-cycles/new?farmId=${payload.farm!.id}`);
      });
    } catch {
      setErrors({
        form: "Network error. Check your connection and try again.",
      });
    } finally {
      setSubmitting(false);
    }
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

      <label className="block space-y-1.5" htmlFor="name">
        <span className="text-sm font-medium text-ink">Farm name</span>
        <input
          id="name"
          name="name"
          type="text"
          value={values.name}
          onChange={(event) => updateField("name", event.target.value)}
          placeholder="Home plot / Block A"
          disabled={busy}
          className={`${inputClass} ${errors.name ? errorBorder : normalBorder}`}
        />
        <FieldError message={errors.name} />
      </label>

      <label className="block space-y-1.5" htmlFor="country">
        <span className="text-sm font-medium text-ink">Country</span>
        <select
          id="country"
          name="country"
          value={values.country}
          onChange={(event) => {
            const next = event.target.value;
            setValues((prev) => ({
              ...prev,
              country: next,
              countryOther: isOtherCountryOption(next) ? prev.countryOther : "",
            }));
            setErrors((prev) => {
              if (!prev.country && !prev.countryOther && !prev.form) return prev;
              const nextErrors = { ...prev };
              delete nextErrors.country;
              delete nextErrors.countryOther;
              delete nextErrors.form;
              return nextErrors;
            });
          }}
          disabled={busy}
          className={`${inputClass} ${errors.country ? errorBorder : normalBorder}`}
        >
          <option value="" disabled>
            Select country
          </option>
          {COUNTRY_OPTIONS.map((country) => (
            <option key={country} value={country}>
              {country}
            </option>
          ))}
        </select>
        <FieldError message={errors.country} />
      </label>

      {showOtherCountry ? (
        <label className="block space-y-1.5" htmlFor="countryOther">
          <span className="text-sm font-medium text-ink">
            Enter the country
          </span>
          <input
            id="countryOther"
            name="countryOther"
            type="text"
            value={values.countryOther}
            onChange={(event) => updateField("countryOther", event.target.value)}
            placeholder="Type the country name"
            disabled={busy}
            className={`${inputClass} ${errors.countryOther ? errorBorder : normalBorder}`}
          />
          <FieldError message={errors.countryOther} />
        </label>
      ) : null}

      <label className="block space-y-1.5" htmlFor="district">
        <span className="text-sm font-medium text-ink">District or region</span>
        <input
          id="district"
          name="district"
          type="text"
          value={values.district}
          onChange={(event) => updateField("district", event.target.value)}
          placeholder="Couva"
          disabled={busy}
          className={`${inputClass} ${errors.district ? errorBorder : normalBorder}`}
        />
        <FieldError message={errors.district} />
      </label>

      <div className="grid grid-cols-[1.4fr_1fr] gap-3">
        <label className="block space-y-1.5" htmlFor="farmSize">
          <span className="text-sm font-medium text-ink">Farm size</span>
          <input
            id="farmSize"
            name="farmSize"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={values.farmSize}
            onChange={(event) => updateField("farmSize", event.target.value)}
            placeholder="1.8"
            disabled={busy}
            className={`${inputClass} ${errors.farmSize ? errorBorder : normalBorder}`}
          />
          <FieldError message={errors.farmSize} />
        </label>

        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium text-ink">Unit</legend>
          <div className="grid grid-cols-2 gap-2">
            {(["hectares", "acres"] as FarmSizeUnit[]).map((unit) => {
              const selected = values.farmSizeUnit === unit;
              return (
                <button
                  key={unit}
                  type="button"
                  disabled={busy}
                  onClick={() => updateField("farmSizeUnit", unit)}
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
          <FieldError message={errors.farmSizeUnit} />
        </fieldset>
      </div>

      <div className="space-y-2 rounded-2xl bg-surface/80 px-3 py-3 ring-1 ring-line">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-ink">Location</p>
          <button
            type="button"
            onClick={shareLocation}
            disabled={busy}
            className="text-xs font-semibold text-leaf underline-offset-2 hover:underline disabled:opacity-60"
          >
            {locating ? "Locating…" : "Share my location"}
          </button>
        </div>
        <label className="block space-y-1.5" htmlFor="locationDescription">
          <span className="text-xs text-muted">Place name or directions</span>
          <input
            id="locationDescription"
            name="locationDescription"
            type="text"
            value={values.locationDescription}
            onChange={(event) =>
              updateField("locationDescription", event.target.value)
            }
            placeholder="Near Couva main road, next to the river"
            disabled={busy}
            className={`${inputClass} ${errors.locationDescription ? errorBorder : normalBorder}`}
          />
          <FieldError message={errors.locationDescription} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1.5" htmlFor="latitude">
            <span className="text-xs text-muted">Latitude</span>
            <input
              id="latitude"
              name="latitude"
              type="text"
              inputMode="decimal"
              value={values.latitude}
              onChange={(event) => updateField("latitude", event.target.value)}
              placeholder="-10.2731"
              disabled={busy}
              className={`${inputClass} ${errors.latitude ? errorBorder : normalBorder}`}
            />
            <FieldError message={errors.latitude} />
          </label>
          <label className="block space-y-1.5" htmlFor="longitude">
            <span className="text-xs text-muted">Longitude</span>
            <input
              id="longitude"
              name="longitude"
              type="text"
              inputMode="decimal"
              value={values.longitude}
              onChange={(event) => updateField("longitude", event.target.value)}
              placeholder="40.1828"
              disabled={busy}
              className={`${inputClass} ${errors.longitude ? errorBorder : normalBorder}`}
            />
            <FieldError message={errors.longitude} />
          </label>
        </div>
      </div>

      <label className="block space-y-1.5" htmlFor="waterSource">
        <span className="text-sm font-medium text-ink">Water source</span>
        <select
          id="waterSource"
          name="waterSource"
          value={values.waterSource}
          onChange={(event) =>
            updateField(
              "waterSource",
              event.target.value as FarmFormInput["waterSource"],
            )
          }
          disabled={busy}
          className={`${inputClass} ${errors.waterSource ? errorBorder : normalBorder}`}
        >
          <option value="">Select water source</option>
          {WATER_SOURCE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <FieldError message={errors.waterSource} />
      </label>

      <label className="block space-y-1.5" htmlFor="drainageCondition">
        <span className="text-sm font-medium text-ink">Drainage condition</span>
        <select
          id="drainageCondition"
          name="drainageCondition"
          value={values.drainageCondition}
          onChange={(event) =>
            updateField(
              "drainageCondition",
              event.target.value as FarmFormInput["drainageCondition"],
            )
          }
          disabled={busy}
          className={`${inputClass} ${errors.drainageCondition ? errorBorder : normalBorder}`}
        >
          <option value="">Select drainage</option>
          {DRAINAGE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <FieldError message={errors.drainageCondition} />
      </label>

      <label className="block space-y-1.5" htmlFor="growingSystem">
        <span className="text-sm font-medium text-ink">Growing system</span>
        <select
          id="growingSystem"
          name="growingSystem"
          value={values.growingSystem}
          onChange={(event) =>
            updateField(
              "growingSystem",
              event.target.value as FarmFormInput["growingSystem"],
            )
          }
          disabled={busy}
          className={`${inputClass} ${errors.growingSystem ? errorBorder : normalBorder}`}
        >
          <option value="">Select growing system</option>
          {GROWING_SYSTEM_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <FieldError message={errors.growingSystem} />
      </label>

      <Button type="submit" disabled={busy}>
        {busy ? "Saving farm…" : "Save farm"}
      </Button>
    </form>
  );
}
