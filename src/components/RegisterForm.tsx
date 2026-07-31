"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/Button";
import { saveRegisteredFarmer } from "@/lib/farmers/session";
import {
  COUNTRY_OPTIONS,
  CROP_OPTIONS,
  type FarmSizeUnit,
  type FarmerRegistrationInput,
  type RegisteredFarmer,
} from "@/lib/farmers/types";
import {
  validateFarmerRegistration,
  type FieldErrors,
} from "@/lib/farmers/validation";

const initialValues: FarmerRegistrationInput = {
  fullName: "",
  whatsappNumber: "",
  country: "Tanzania",
  district: "",
  farmSize: "",
  farmSizeUnit: "hectares",
  mainCrops: [],
  consent: false,
};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="text-xs font-medium text-danger" role="alert">
      {message}
    </p>
  );
}

export function RegisterForm() {
  const router = useRouter();
  const [values, setValues] = useState<FarmerRegistrationInput>(initialValues);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isPending, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);

  const busy = isPending || submitting;

  function updateField<K extends keyof FarmerRegistrationInput>(
    key: K,
    value: FarmerRegistrationInput[K],
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

  function toggleCrop(crop: string) {
    setValues((prev) => {
      const selected = prev.mainCrops.includes(crop)
        ? prev.mainCrops.filter((item) => item !== crop)
        : [...prev.mainCrops, crop];
      return { ...prev, mainCrops: selected };
    });
    setErrors((prev) => {
      if (!prev.mainCrops && !prev.form) return prev;
      const next = { ...prev };
      delete next.mainCrops;
      delete next.form;
      return next;
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const local = validateFarmerRegistration(values);
    if (!local.ok) {
      setErrors(local.errors);
      return;
    }

    setSubmitting(true);
    setErrors({});

    try {
      const response = await fetch("/api/farmers/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      const payload = (await response.json()) as {
        farmer?: RegisteredFarmer;
        error?: string;
        errors?: FieldErrors;
      };

      if (!response.ok || !payload.farmer) {
        setErrors(
          payload.errors ?? {
            form: payload.error ?? "Registration failed. Please try again.",
          },
        );
        return;
      }

      saveRegisteredFarmer(payload.farmer);

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

  const inputClass =
    "min-h-12 w-full rounded-xl border bg-surface px-3 text-sm text-ink outline-none ring-canopy/30 transition focus:ring-2";
  const errorBorder = "border-danger";
  const normalBorder = "border-line";

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

      <label className="block space-y-1.5" htmlFor="fullName">
        <span className="text-sm font-medium text-ink">Full name</span>
        <input
          id="fullName"
          name="fullName"
          type="text"
          autoComplete="name"
          value={values.fullName}
          onChange={(event) => updateField("fullName", event.target.value)}
          placeholder="Amina Okello"
          aria-invalid={Boolean(errors.fullName)}
          aria-describedby={errors.fullName ? "fullName-error" : undefined}
          className={`${inputClass} ${errors.fullName ? errorBorder : normalBorder}`}
          disabled={busy}
        />
        <span id="fullName-error">
          <FieldError message={errors.fullName} />
        </span>
      </label>

      <label className="block space-y-1.5" htmlFor="whatsappNumber">
        <span className="text-sm font-medium text-ink">WhatsApp number</span>
        <input
          id="whatsappNumber"
          name="whatsappNumber"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={values.whatsappNumber}
          onChange={(event) => updateField("whatsappNumber", event.target.value)}
          placeholder="+255 712 555 014"
          aria-invalid={Boolean(errors.whatsappNumber)}
          aria-describedby={
            errors.whatsappNumber ? "whatsappNumber-error" : undefined
          }
          className={`${inputClass} ${errors.whatsappNumber ? errorBorder : normalBorder}`}
          disabled={busy}
        />
        <span id="whatsappNumber-error">
          <FieldError message={errors.whatsappNumber} />
        </span>
      </label>

      <label className="block space-y-1.5" htmlFor="country">
        <span className="text-sm font-medium text-ink">Country</span>
        <select
          id="country"
          name="country"
          value={values.country}
          onChange={(event) => updateField("country", event.target.value)}
          aria-invalid={Boolean(errors.country)}
          aria-describedby={errors.country ? "country-error" : undefined}
          className={`${inputClass} ${errors.country ? errorBorder : normalBorder}`}
          disabled={busy}
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
        <span id="country-error">
          <FieldError message={errors.country} />
        </span>
      </label>

      <label className="block space-y-1.5" htmlFor="district">
        <span className="text-sm font-medium text-ink">District or region</span>
        <input
          id="district"
          name="district"
          type="text"
          value={values.district}
          onChange={(event) => updateField("district", event.target.value)}
          placeholder="Mtwara"
          aria-invalid={Boolean(errors.district)}
          aria-describedby={errors.district ? "district-error" : undefined}
          className={`${inputClass} ${errors.district ? errorBorder : normalBorder}`}
          disabled={busy}
        />
        <span id="district-error">
          <FieldError message={errors.district} />
        </span>
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
            aria-invalid={Boolean(errors.farmSize)}
            aria-describedby={errors.farmSize ? "farmSize-error" : undefined}
            className={`${inputClass} ${errors.farmSize ? errorBorder : normalBorder}`}
            disabled={busy}
          />
          <span id="farmSize-error">
            <FieldError message={errors.farmSize} />
          </span>
        </label>

        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium text-ink">Preferred unit</legend>
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

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-ink">Main crops</legend>
        <p className="text-xs text-muted">Select all that apply.</p>
        <div className="flex flex-wrap gap-2">
          {CROP_OPTIONS.map((crop) => {
            const selected = values.mainCrops.includes(crop);
            return (
              <button
                key={crop}
                type="button"
                disabled={busy}
                onClick={() => toggleCrop(crop)}
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
        <FieldError message={errors.mainCrops} />
      </fieldset>

      <label
        htmlFor="consent"
        className={`flex gap-3 rounded-xl px-3 py-3 ring-1 ${
          errors.consent ? "bg-danger/5 ring-danger/40" : "bg-surface/80 ring-line"
        }`}
      >
        <input
          id="consent"
          name="consent"
          type="checkbox"
          checked={values.consent}
          onChange={(event) => updateField("consent", event.target.checked)}
          disabled={busy}
          className="mt-1 size-5 shrink-0 accent-[var(--canopy)]"
          aria-invalid={Boolean(errors.consent)}
          aria-describedby={errors.consent ? "consent-error" : undefined}
        />
        <span className="space-y-1">
          <span className="block text-sm font-medium text-ink">
            I consent to FVMLTD storing my farm information and crop photographs
            to provide crop guidance.
          </span>
          <span id="consent-error">
            <FieldError message={errors.consent} />
          </span>
        </span>
      </label>

      <div className="pt-1">
        <Button type="submit" disabled={busy}>
          {busy ? "Registering…" : "Create farmer profile"}
        </Button>
      </div>
    </form>
  );
}
