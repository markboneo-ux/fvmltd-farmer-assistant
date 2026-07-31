import { nextGuidedStep } from "./steps";
import {
  CROP_CHECK_CROPS,
  CROP_CHECK_DRAINAGE_OPTIONS,
  IRRIGATION_FREQUENCY_OPTIONS,
  SYMPTOM_LOCATION_OPTIONS,
  type CropCheckCrop,
  type CropCheckDrainage,
  type GuidedQuestionStep,
  type IrrigationFrequency,
  type SymptomLocation,
} from "./types";

export type AnswerValidation =
  | {
      ok: true;
      patch: Record<string, unknown>;
      nextStep: GuidedQuestionStep;
      displayValue: string | boolean | number;
    }
  | { ok: false; error: string };

const symptomSet = new Set(SYMPTOM_LOCATION_OPTIONS.map((o) => o.value));
const irrigationSet = new Set(IRRIGATION_FREQUENCY_OPTIONS.map((o) => o.value));
const drainageSet = new Set(CROP_CHECK_DRAINAGE_OPTIONS.map((o) => o.value));

export function isCropCheckCrop(value: string): value is CropCheckCrop {
  return (CROP_CHECK_CROPS as readonly string[]).includes(value);
}

export function validateGuidedAnswer(
  step: GuidedQuestionStep,
  raw: unknown,
): AnswerValidation {
  if (step === "completed") {
    return { ok: false, error: "This crop check is already complete." };
  }

  const nextStep = nextGuidedStep(step);

  switch (step) {
    case "problem_description": {
      const text = typeof raw === "string" ? raw.trim() : "";
      if (!text) {
        return { ok: false, error: "Please describe the problem you are seeing." };
      }
      if (text.length > 2000) {
        return { ok: false, error: "Keep the description under 2000 characters." };
      }
      return {
        ok: true,
        patch: {
          description: text,
          title: text.slice(0, 80),
          guided_step: nextStep,
        },
        nextStep,
        displayValue: text,
      };
    }
    case "first_observed_on": {
      const date = typeof raw === "string" ? raw.trim() : "";
      if (!date || Number.isNaN(Date.parse(date))) {
        return { ok: false, error: "Enter a valid date." };
      }
      return {
        ok: true,
        patch: { first_observed_on: date, guided_step: nextStep },
        nextStep,
        displayValue: date,
      };
    }
    case "symptom_location": {
      const value = typeof raw === "string" ? raw.trim() : "";
      if (!symptomSet.has(value as SymptomLocation)) {
        return {
          ok: false,
          error: "Choose where the symptoms began.",
        };
      }
      return {
        ok: true,
        patch: { symptom_location: value, guided_step: nextStep },
        nextStep,
        displayValue: value,
      };
    }
    case "is_spreading": {
      if (typeof raw !== "boolean") {
        return { ok: false, error: "Choose Yes or No." };
      }
      return {
        ok: true,
        patch: { is_spreading: raw, guided_step: nextStep },
        nextStep,
        displayValue: raw,
      };
    }
    case "percent_affected": {
      const num =
        typeof raw === "number"
          ? raw
          : typeof raw === "string"
            ? Number(raw.trim())
            : NaN;
      if (!Number.isFinite(num) || num < 0 || num > 100) {
        return {
          ok: false,
          error: "Enter a percentage between 0 and 100.",
        };
      }
      return {
        ok: true,
        patch: {
          percent_affected: Number(num.toFixed(2)),
          guided_step: nextStep,
        },
        nextStep,
        displayValue: Number(num.toFixed(2)),
      };
    }
    case "recent_fertilizer": {
      const text = typeof raw === "string" ? raw.trim() : "";
      if (!text) {
        return {
          ok: false,
          error: "Describe recent fertilizer use, or write “None”.",
        };
      }
      return {
        ok: true,
        patch: { recent_fertilizer: text, guided_step: nextStep },
        nextStep,
        displayValue: text,
      };
    }
    case "recent_spray": {
      const text = typeof raw === "string" ? raw.trim() : "";
      if (!text) {
        return {
          ok: false,
          error: "Describe recent sprays, or write “None”.",
        };
      }
      return {
        ok: true,
        patch: { recent_spray: text, guided_step: nextStep },
        nextStep,
        displayValue: text,
      };
    }
    case "irrigation_frequency": {
      const value = typeof raw === "string" ? raw.trim() : "";
      if (!irrigationSet.has(value as IrrigationFrequency)) {
        return { ok: false, error: "Choose an irrigation frequency." };
      }
      return {
        ok: true,
        patch: { irrigation_frequency: value, guided_step: nextStep },
        nextStep,
        displayValue: value,
      };
    }
    case "drainage_condition": {
      const value = typeof raw === "string" ? raw.trim() : "";
      if (!drainageSet.has(value as CropCheckDrainage)) {
        return { ok: false, error: "Choose a drainage condition." };
      }
      return {
        ok: true,
        patch: { drainage_condition: value, guided_step: nextStep },
        nextStep,
        displayValue: value,
      };
    }
    case "recent_heavy_rainfall": {
      if (typeof raw !== "boolean") {
        return { ok: false, error: "Choose Yes or No." };
      }
      return {
        ok: true,
        patch: {
          recent_heavy_rainfall: raw,
          guided_step: "photos",
          status: "draft",
        },
        nextStep: "photos",
        displayValue: raw,
      };
    }
    case "photos":
      return {
        ok: false,
        error: "Use the photograph uploader to continue this step.",
      };
  }
}
