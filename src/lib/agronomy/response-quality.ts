import { isDiagnosticIntent, type IntentCategory } from "@/lib/assistant/intents";
import { isGuidanceStage, isInterviewStage, type AgronomicCasePayload } from "./case-schema";
import type { KnownFarmerFacts } from "./tomato-protocol";

const GENERIC_DIAGNOSIS =
  /\b(could be heat|heat, nutrient|heat, watering|may be a disease|monitor it|check your plants|could be many things|looks like stress)\b/i;

const DESCRIBED_PROBLEM =
  /\b(burn|burning|scorch|wilt|yellow|spot|lesion|hole|stunt|disease|pest|whitefl|blight|rot|mould|mold|chloros|necrosis|tip\s*burn|leaf\s+edges?|crispy)\b/i;

const PHOTO_INSUFFICIENT =
  /\b(photo is (a bit )?distant|blurry|too far|insufficient|first look only|cannot see|image is (unclear|too distant))\b/i;

export type DiagnosisQuality = {
  adequate: boolean;
  reasons: string[];
};

function hasUncertainty(payload: AgronomicCasePayload): boolean {
  const text = `${payload.preliminaryAssessment} ${(payload.likelyCauses ?? []).join(" ")}`;
  return (
    (payload.likelyCauses ?? []).length !== 1 ||
    /\b(could|may|might|possible|several|differential|or)\b/i.test(text)
  );
}

function farmerDescribedCropProblem(
  payload: AgronomicCasePayload,
  facts?: KnownFarmerFacts,
): boolean {
  if (facts?.suspectedIssue) return true;
  if (facts?.rawText && DESCRIBED_PROBLEM.test(facts.rawText)) return true;
  return GENERIC_DIAGNOSIS.test(payload.preliminaryAssessment);
}

/**
 * Structure/content check for a serious crop diagnosis.
 * Not a character-count gate. Interview turns and insufficient photos are not
 * forced through a full differential.
 */
export function evaluateDiagnosisQuality(
  payload: AgronomicCasePayload,
  options: {
    intent?: IntentCategory | null;
    facts?: KnownFarmerFacts;
  } = {},
): DiagnosisQuality {
  const intent = options.intent ?? (payload.intent as IntentCategory | undefined) ?? null;
  if (intent && !isDiagnosticIntent(intent)) {
    return { adequate: true, reasons: [] };
  }

  const reasons: string[] = [];
  const assessment = payload.preliminaryAssessment.trim();
  const causes = payload.likelyCauses ?? [];
  const disconfirm = payload.whatWouldChangeDiagnosis ?? [];
  const generic = GENERIC_DIAGNOSIS.test(assessment) && causes.length < 2;

  if (generic) {
    reasons.push("generic_diagnosis");
  }

  if (isInterviewStage(payload.stage)) {
    return { adequate: reasons.length === 0, reasons };
  }

  if (PHOTO_INSUFFICIENT.test(assessment)) {
    return { adequate: reasons.length === 0, reasons };
  }

  if (
    options.facts?.suspectedIssue === "whiteflies" ||
    options.facts?.suddenWilt
  ) {
    return { adequate: reasons.length === 0, reasons };
  }

  if (!farmerDescribedCropProblem(payload, options.facts) && !generic) {
    return { adequate: true, reasons: [] };
  }

  if (!isGuidanceStage(payload.stage) && !generic) {
    return { adequate: reasons.length === 0, reasons };
  }

  if (hasUncertainty(payload) && causes.length < 2) {
    reasons.push("missing_ranked_causes");
  }
  if (payload.checksToday.length < 2) {
    reasons.push("missing_field_checks");
  }
  if (payload.safeActionsNow.length < 1) {
    reasons.push("missing_safe_actions");
  }
  if (payload.actionsToAvoid.length < 1) {
    reasons.push("missing_what_not_to_do");
  }
  if (disconfirm.length < 1) {
    reasons.push("missing_what_would_change");
  }
  if (!payload.monitorNext) {
    reasons.push("missing_monitor_window");
  }

  return { adequate: reasons.length === 0, reasons };
}

export function needsDiagnosisRewrite(
  payload: AgronomicCasePayload,
  options: {
    intent?: IntentCategory | null;
    facts?: KnownFarmerFacts;
  } = {},
): boolean {
  return !evaluateDiagnosisQuality(payload, options).adequate;
}

export const THIN_REWRITE_INSTRUCTION = `The previous JSON was too thin for a serious crop problem.
Rewrite the SAME case as a stronger extension answer.
Preserve known facts and uncertainty. Do not invent a confirmed diagnosis. Do not manufacture pests or diseases that were not suggested by the symptoms.
Include: a direct assessment; 2–4 ranked plausible causes when uncertainty exists; brief reasoning; 2–4 field checks; immediate safe actions; what NOT to do; what would change the diagnosis; what to monitor over 24–72 hours; and ONE highest-value follow-up if needed.
Do not lead with weather. Do not add product sales language. Return JSON only.`;
