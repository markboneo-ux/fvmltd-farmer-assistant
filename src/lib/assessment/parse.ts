import type {
  AssessmentSafetySignals,
  PreliminaryAssessmentJson,
  UrgencyLevel,
} from "./types";

const URGENCY: UrgencyLevel[] = ["low", "moderate", "high", "critical"];

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function parseSafetySignals(raw: unknown): AssessmentSafetySignals {
  const data =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  return {
    plants_dying_quickly: asBoolean(data.plants_dying_quickly),
    unknown_products_mixed: asBoolean(data.unknown_products_mixed),
    herbicide_damage_suspected: asBoolean(data.herbicide_damage_suspected),
    multiple_unsuccessful_treatments: asBoolean(
      data.multiple_unsuccessful_treatments,
    ),
    severe_bacterial_or_viral_suspected: asBoolean(
      data.severe_bacterial_or_viral_suspected,
    ),
    // Default true only when the model omitted the field; false means no protocol.
    approved_protocol_exists: asBoolean(data.approved_protocol_exists, true),
  };
}

/**
 * Validates and normalizes model JSON. Forces product_recommendation_allowed
 * to false — AI must not invent products or give unrestricted pesticide rates.
 */
export function parseAssessmentJson(raw: unknown): PreliminaryAssessmentJson {
  if (!raw || typeof raw !== "object") {
    throw new Error("Assessment response was not a JSON object.");
  }

  const data = raw as Record<string, unknown>;
  const caseSummary =
    typeof data.case_summary === "string" ? data.case_summary.trim() : "";
  if (!caseSummary) {
    throw new Error("Assessment missing case_summary.");
  }

  const likelyCauses = asStringArray(data.likely_causes);
  if (likelyCauses.length === 0) {
    throw new Error("Assessment missing likely_causes.");
  }

  const confidence = Number(data.confidence_score);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 100) {
    throw new Error("Assessment confidence_score must be between 0 and 100.");
  }

  const urgency = data.urgency_level;
  if (typeof urgency !== "string" || !URGENCY.includes(urgency as UrgencyLevel)) {
    throw new Error("Assessment urgency_level is invalid.");
  }

  const immediateSafeActions = asStringArray(data.immediate_safe_actions).map(
    sanitizeActionText,
  );

  return {
    case_summary: caseSummary,
    likely_causes: likelyCauses,
    confidence_score: Number(confidence.toFixed(2)),
    missing_information: asStringArray(data.missing_information),
    immediate_safe_actions:
      immediateSafeActions.length > 0
        ? immediateSafeActions
        : [
            "Monitor the crop closely and wait for FVMLTD staff review before applying any pesticide.",
          ],
    human_review_required: Boolean(data.human_review_required ?? true),
    laboratory_test_needed: Boolean(data.laboratory_test_needed),
    // Hard safety gate — never allow invented product recommendations from the model.
    product_recommendation_allowed: false,
    urgency_level: urgency as UrgencyLevel,
    safety_signals: parseSafetySignals(data.safety_signals),
  };
}

function sanitizeActionText(text: string): string {
  return text
    .replace(
      /\b\d+(\.\d+)?\s?(ml|mL|L|l|g|kg|oz|lb)\s*\/\s*(ha|acre|L|l|plant|litre|liter)\b/gi,
      "[rate removed — staff must confirm]",
    )
    .replace(
      /\b(apply|spray)\s+[A-Z][A-Za-z0-9-]{2,}(\s+[A-Z][A-Za-z0-9-]{2,})?\s+\d+/g,
      "seek staff-approved product guidance",
    )
    .trim();
}
