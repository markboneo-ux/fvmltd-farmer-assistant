"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/Button";
import { RegistrationSuccess } from "@/components/RegistrationSuccess";
import {
  COUNTRY_OPTIONS,
  DEFAULT_COUNTRY,
  isOtherCountryOption,
} from "@/data/countries";
import {
  FARMER_DASHBOARD_PATH,
  markJustRegistered,
  navigateInternal,
} from "@/lib/farmers/paths";
import { saveRegisteredFarmer } from "@/lib/farmers/session";
import {
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
  country: DEFAULT_COUNTRY,
  countryOther: "",
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

async function readErrorPayload(response: Response): Promise<{
  farmer?: RegisteredFarmer;
  error?: string;
  errors?: FieldErrors;
}> {
  const text = await response.text();
  if (!text) {
    return {
      error: `Registration failed (HTTP ${response.status}).`,
    };
  }

  try {
    return JSON.parse(text) as {
      farmer?: RegisteredFarmer;
      error?: string;
      errors?: FieldErrors;
    };
  } catch {
    return {
      error: text.slice(0, 280) || `Registration failed (HTTP ${response.status}).`,
    };
  }
}

type RegisterFormProps = {
  onSuccessChange?: (succeeded: boolean) => void;
};

export function RegisterForm({ onSuccessChange }: RegisterFormProps = {}) {
  const router = useRouter();
  const [values, setValues] = useState<FarmerRegistrationInput>(initialValues);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [registered, setRegistered] = useState<RegisteredFarmer | null>(null);
  const [navigating, setNavigating] = useState(false);
  const inFlight = useRef(false);

  const busy = submitting || Boolean(registered);
  const showOtherCountry = isOtherCountryOption(values.country);

  function goToDashboard() {
    if (navigating) return;
    setNavigating(true);
    markJustRegistered();
    // Relative App Router route only — never absolute deploy/preview URLs.
    navigateInternal(router, FARMER_DASHBOARD_PATH, "replace");
  }

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
    if (inFlight.current || busy) return;

    const local = validateFarmerRegistration(values);
    if (!local.ok) {
      setErrors(local.errors);
      return;
    }

    inFlight.current = true;
    setSubmitting(true);
    setErrors({});

    try {
      const response = await fetch("/api/farmers/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      const payload = await readErrorPayload(response);

      if (!response.ok || !payload.farmer) {
        setErrors(
          payload.errors ?? {
            form:
              payload.error ??
              `Registration failed (HTTP ${response.status}). Please try again.`,
          },
        );
        return;
      }

      // Persist via the existing localStorage session pattern (no secrets in the URL).
      saveRegisteredFarmer(payload.farmer);
      markJustRegistered();
      setRegistered(payload.farmer);
      onSuccessChange?.(true);
      // Stay on the success screen — navigate when the farmer taps Continue.
      // Immediate soft-nav after a long POST is what produced "page couldn't load".
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Network error. Check your connection and try again.";
      setErrors({ form: message });
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  if (registered) {
    return (
      <div className="space-y-3">
        <RegistrationSuccess
          farmerCode={registered.farmerCode}
          fullName={registered.fullName}
          onContinue={goToDashboard}
          continueLabel={
            navigating ? "Opening dashboard…" : "Continue to dashboard"
          }
        />
        {navigating ? (
          <p className="text-center text-xs text-muted">
            If the dashboard does not open, tap Continue again.
          </p>
        ) : null}
      </div>
    );
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
          placeholder="Maria Persad"
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
          placeholder="+1 868 555 0142"
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

      {showOtherCountry ? (
        <label className="block space-y-1.5" htmlFor="countryOther">
          <span className="text-sm font-medium text-ink">
            Enter your country
          </span>
          <input
            id="countryOther"
            name="countryOther"
            type="text"
            value={values.countryOther}
            onChange={(event) => updateField("countryOther", event.target.value)}
            placeholder="Type your country name"
            aria-invalid={Boolean(errors.countryOther)}
            aria-describedby={
              errors.countryOther ? "countryOther-error" : undefined
            }
            className={`${inputClass} ${errors.countryOther ? errorBorder : normalBorder}`}
            disabled={busy}
          />
          <span id="countryOther-error">
            <FieldError message={errors.countryOther} />
          </span>
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
