import type { AgronomicCasePayload } from "@/lib/agronomy/case-schema";
import { simplifyFarmerLanguage } from "./language";

const DESTROY_OR_REMOVE =
  /\b(destroy|remove|pull\s+up|rogue\s+out|abandon|isolate|cut\s+out|throw\s+away)\b.{0,50}\b(plant|plants|crop|field|stand)\b|\b(plant|plants|crop)\b.{0,30}\b(destroy|remove|abandon|isolate)\b/i;

const CHEMICAL_TREAT =
  /\b(apply|spray|use|treat)\b.{0,40}\b(insecticide|fungicide|herbicide|pesticide|chemical)\b/i;

const MAJOR_FERTILIZER =
  /\b(major|heavy|correct(ive)?|apply|add)\b.{0,40}\b(fertilizer|fertiliser|npk|urea)\b/i;

const WILT_CHECK =
  "Bacterial wilt is one possibility, but wilting can also come from root damage, waterlogging and other diseases. Before removing plants, check whether the wilting is permanent, whether the stem shows internal browning, and whether nearby plants are developing the same symptoms.";

export function mentionsPrematureDestruction(text: string): boolean {
  const withoutCaution = text.replace(/before removing plants?[^.?!]*/gi, "");
  return DESTROY_OR_REMOVE.test(withoutCaution);
}

export function applyIrreversibleActionGuards(
  payload: AgronomicCasePayload,
  options: {
    confirmedDiagnosis?: boolean;
    agronomistReviewed?: boolean;
    containmentDefined?: boolean;
    vagueSymptom?: boolean;
    wiltReported?: boolean;
  } = {},
): AgronomicCasePayload {
  const allowedDestroy =
    options.confirmedDiagnosis ||
    options.agronomistReviewed ||
    options.containmentDefined;

  const vague = options.vagueSymptom === true;

  let preliminaryAssessment = simplifyFarmerLanguage(
    payload.preliminaryAssessment,
  );
  let nextQuestion = simplifyFarmerLanguage(payload.nextQuestion);
  let checksToday = payload.checksToday.map(simplifyFarmerLanguage);
  let safeActionsNow = payload.safeActionsNow.map(simplifyFarmerLanguage);
  const actionsToAvoid = [...payload.actionsToAvoid];

  const ensureAvoid = (text: string) => {
    if (!actionsToAvoid.some((item) => item.toLowerCase() === text.toLowerCase())) {
      actionsToAvoid.push(text);
    }
  };

  safeActionsNow = safeActionsNow.filter((action) => {
    if (!allowedDestroy && DESTROY_OR_REMOVE.test(action)) {
      ensureAvoid(
        "Do not destroy or remove plants until the cause is clearer.",
      );
      return false;
    }
    if (vague && CHEMICAL_TREAT.test(action)) {
      ensureAvoid(
        "Do not spray a chemical from a vague symptom alone.",
      );
      return false;
    }
    if (vague && MAJOR_FERTILIZER.test(action)) {
      ensureAvoid(
        "Do not make a major fertilizer change until water and roots are checked.",
      );
      return false;
    }
    return true;
  });

  const looksLikeWilt =
    options.wiltReported === true ||
    /\b(wilt|dropping down|falling over)\b/i.test(
      `${preliminaryAssessment} ${nextQuestion} ${payload.internalMissingInformation.join(" ")} ${safeActionsNow.join(" ")}`,
    );

  if (
    !allowedDestroy &&
    (DESTROY_OR_REMOVE.test(preliminaryAssessment) ||
      DESTROY_OR_REMOVE.test(nextQuestion) ||
      DESTROY_OR_REMOVE.test(payload.preliminaryAssessment))
  ) {
    preliminaryAssessment = looksLikeWilt
      ? WILT_CHECK
      : "Hold off on removing plants. First check how many plants are affected and what the stems and roots look like.";
    nextQuestion =
      "Cut one badly wilted stem and look inside. Tell me if the inside is brown.";
  }

  if (looksLikeWilt && !allowedDestroy) {
    if (!checksToday.some((item) => /stem|brown|soil|wet/i.test(item))) {
      checksToday = [
        "Cut one badly wilted stem and look inside for brown streaks",
        "Check whether the soil is staying wet for a long time after watering",
        ...checksToday,
      ].slice(0, 4);
    }
    if (!nextQuestion) {
      nextQuestion =
        "Cut one badly wilted stem and look inside. Tell me if the inside is brown.";
    }
  }

  return {
    ...payload,
    preliminaryAssessment,
    nextQuestion,
    checksToday,
    safeActionsNow,
    actionsToAvoid,
  };
}

export function wiltCheckCopy(): string {
  return WILT_CHECK;
}
