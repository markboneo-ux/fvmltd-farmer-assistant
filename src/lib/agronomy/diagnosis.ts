/**
 * Server-side diagnostic shaping for crop problems.
 * Ranks likely causes, keeps one follow-up, and stops weather/products from taking over.
 */

import {
  ASK_COUNTRY_QUESTION,
  shouldAskCountry,
  type FarmerLevel,
} from "@/lib/assistant/farmer-context";
import { ASK_CROP_QUESTION } from "@/lib/assistant/crops";
import {
  isDiagnosticIntent,
  type IntentCategory,
} from "@/lib/assistant/intents";
import { isGuidanceStage, type AgronomicCasePayload } from "./case-schema";
import { questionAsksForKnownFact, type KnownFarmerFacts } from "./tomato-protocol";

export type DiagnosticPlaybook = {
  id: string;
  likelyCauses: string[];
  why: string;
  checks: string[];
  actionsToday: string[];
  avoid: string[];
  whatWouldChange: string[];
  monitor: string;
  oneQuestion: string;
  photoHelpful: boolean;
};

const GENERIC_DIFFERENTIAL: DiagnosticPlaybook = {
  id: "generic_crop_problem",
  likelyCauses: [
    "Root-zone stress (water, drainage, or salt buildup)",
    "Nutrient imbalance or fertilizer injury",
    "Foliar disease or insect damage",
  ],
  why: "Several different problems can look similar on a crop. Separate leaf-tip or edge burn from true spots, and check whether older or newer leaves are worse, before naming one cause.",
  checks: [
    "Is the damage starting at the leaf tips or edges, or as separate spots?",
    "Are older leaves worse than new growth?",
    "Is the soil soggy, dry, or uneven from plant to plant?",
  ],
  actionsToday: [
    "Hold extra fertilizer and extra pesticide until the pattern is clearer",
    "Check soil moisture and drainage around a few plants",
    "If you can, send a close photo of the damaged leaf plus a whole plant",
  ],
  avoid: [
    "Do not increase fertilizer yet",
    "Do not apply another pesticide until we know whether this is burn, disease, or insects",
  ],
  whatWouldChange: [
    "Separate brown spots or lesions would move disease higher on the list",
    "A spray or fertilizer applied in the last 5–7 days would raise spray injury",
  ],
  monitor: "Watch new growth and whether the damage spreads over the next 24–72 hours.",
  oneQuestion: "Are the brown or yellow areas starting at the leaf tips, edges, or as separate spots?",
  photoHelpful: true,
};

const CELERY_BURN: DiagnosticPlaybook = {
  id: "celery_burn",
  likelyCauses: [
    "Root-zone stress (uneven watering, waterlogging, or salt buildup/EC)",
    "Potassium or calcium imbalance / leaf-tip burn",
    "Spray or fertilizer injury",
  ],
  why: "What you are describing could come from several different problems, but I would first separate leaf-tip or edge burn from true leaf spots. If the browning starts at the tips or edges, I would first look at root-zone stress, salt buildup, uneven watering, potassium/calcium balance, or spray injury. If you are seeing separate brown lesions or spots, disease moves higher on the list.",
  checks: [
    "Is the burn starting at the tip or edge, or as separate spots?",
    "Are older leaves worse than new growth?",
    "Has fertilizer or pesticide been applied in the last 5–7 days?",
    "Check soil moisture and drainage around the roots",
  ],
  actionsToday: [
    "Avoid increasing fertilizer or applying another pesticide until we narrow it down",
    "Check soil moisture and drainage",
    "If possible, send a close photo of the affected leaf plus a whole plant",
  ],
  avoid: [
    "Do not add more fertilizer today",
    "Do not spray another pesticide until we know whether this is burn or disease",
  ],
  whatWouldChange: [
    "Separate spots or lesions would raise foliar disease",
    "A recent spray or strong fertilizer would raise chemical injury",
  ],
  monitor: "Check new leaves over the next 24–72 hours. If spotting or lesions appear, disease becomes more likely.",
  oneQuestion: "Are the brown areas starting at the leaf tips, edges, or as separate spots?",
  photoHelpful: true,
};

const CELERY_BURN_HOME: DiagnosticPlaybook = {
  ...CELERY_BURN,
  id: "celery_burn_home",
  likelyCauses: [
    "Watering or roots under stress",
    "Too much fertilizer or salt around the roots",
    "Leaf burn from a spray",
  ],
  why: "Celery can look burnt for a few different reasons. If the brown starts at the leaf tips or edges, it is often watering, salt around the roots, or a spray. If you see separate spots, it may be a leaf disease instead.",
  checks: [
    "Does the brown start at the tips, or is it separate spots?",
    "Are the old leaves worse than the new ones?",
    "Did you feed or spray in the last week?",
  ],
  actionsToday: [
    "Do not add more fertilizer today",
    "Feel the soil — is it soggy or bone dry?",
    "A close photo of the leaf and the whole plant would help",
  ],
  avoid: [
    "Do not mix homemade chemical sprays",
    "Do not keep adding feed while the plants look burnt",
  ],
};

const CELERY_BURN_TECHNICAL: DiagnosticPlaybook = {
  ...CELERY_BURN,
  id: "celery_burn_technical",
  likelyCauses: [
    "Root-zone stress / high EC / uneven irrigation",
    "K or Ca imbalance (tip burn) versus Cl/Na injury",
    "Phytotoxicity from recent spray or foliar feed",
    "Foliar pathogen (Cercospora / Septoria / bacterial blight) if discrete lesions",
  ],
  why: "Treat this as a differential, not a single diagnosis. Tip/margin necrosis points to root-zone, salinity/EC, K/Ca, or phytotoxicity. Discrete lesions, halos, or fruiting bodies shift toward foliar disease. Heat and humidity can worsen either class but do not prove the cause.",
  checks: [
    "Tip/margin necrosis vs discrete lesions; older vs younger leaves",
    "Recent fertilizer, foliar feed, or pesticide (product, rate, timing, mix)",
    "Root-zone moisture, drainage, and EC/pH if you can measure them",
    "Lesion type, sporulation, and whether new growth is clean",
  ],
  actionsToday: [
    "Hold further N and pesticide until the pattern is clearer",
    "Correct obvious waterlogging or drought; leach only if EC is high and drainage is free",
    "Photograph lesion margin, whole plant, and root zone if possible",
  ],
  whatWouldChange: [
    "Discrete lesions with chlorotic halo or pycnidia would elevate Cercospora/Septoria",
    "A tank-mix or high EC reading in the last week would elevate phytotoxicity/salt",
  ],
};

function isCeleryBurn(facts: KnownFarmerFacts): boolean {
  const crop = (facts.crop ?? "").toLowerCase();
  if (crop && crop !== "celery") return false;
  const text = facts.rawText.toLowerCase();
  if (crop !== "celery" && !/\bcelery\b/.test(text)) return false;
  return /\b(burn|burning|burnt|scorch|tip\s*burn|leaf\s+burn|crispy|brown(ing)?\s+(up|tips?|edges?))\b/.test(
    text,
  );
}

function isThinAssessment(payload: AgronomicCasePayload): boolean {
  const text = payload.preliminaryAssessment.trim();
  if (text.length < 120) return true;
  if (
    /could be heat, nutrient|heat, nutrient imbalance or watering|could be many things/i.test(
      text,
    )
  ) {
    return true;
  }
  return (payload.likelyCauses ?? []).length === 0 && payload.checksToday.length === 0;
}

export function playbookFor(
  facts: KnownFarmerFacts,
  farmerLevel: FarmerLevel | null,
): DiagnosticPlaybook | null {
  if (isCeleryBurn(facts)) {
    if (farmerLevel === "HOME_GARDENER") return CELERY_BURN_HOME;
    if (farmerLevel === "TECHNICAL_USER" || farmerLevel === "AGRONOMIST") {
      return CELERY_BURN_TECHNICAL;
    }
    return CELERY_BURN;
  }
  if (facts.suspectedIssue === "whiteflies" || facts.suddenWilt) {
    return null;
  }
  const text = facts.rawText.toLowerCase();
  if (
    /\b(burn|burning|yellowing|spots?|stunt|wilt|holes?|leaf\s+spot)\b/.test(text) &&
    facts.crop
  ) {
    return GENERIC_DIFFERENTIAL;
  }
  return null;
}

export function weatherMustNotLead(assessment: string): string {
  return assessment
    .replace(
      /^\s*(over the next 72 hours|72-hour|disease[- ]pressure alert|weather alert)[:.\s-]*/i,
      "",
    )
    .trim();
}

export function pickHighestValueFollowUp(options: {
  facts: KnownFarmerFacts;
  payload: AgronomicCasePayload;
  farmerLevel?: FarmerLevel | null;
  intent?: IntentCategory | null;
  askForCrop?: boolean;
  researchNeed?: string | null;
}): string {
  const { facts, payload } = options;
  if (options.askForCrop || !facts.crop) {
    return ASK_CROP_QUESTION;
  }

  const playbook = playbookFor(facts, options.farmerLevel ?? null);
  if (playbook?.id.startsWith("celery") && playbook.oneQuestion) {
    if (!questionAsksForKnownFact(playbook.oneQuestion, facts)) {
      return playbook.oneQuestion;
    }
  }

  const existing = payload.nextQuestion.trim();
  if (
    existing &&
    !questionAsksForKnownFact(existing, facts) &&
    !/\bcountry\b/i.test(existing)
  ) {
    return existing;
  }

  if (
    playbook?.oneQuestion &&
    !questionAsksForKnownFact(playbook.oneQuestion, facts)
  ) {
    return playbook.oneQuestion;
  }

  if (
    shouldAskCountry({
      country: facts.country,
      intent: options.intent,
      asksForProducts: facts.asksForProducts,
      asksAboutWeather: facts.asksAboutWeather,
      researchNeed: options.researchNeed,
    })
  ) {
    return ASK_COUNTRY_QUESTION;
  }

  if (payload.photoRecommended) {
    return "Can you send a close photo of the affected leaf plus a whole plant?";
  }

  return "";
}

export function applyDiagnosticPlaybook(
  payload: AgronomicCasePayload,
  options: {
    facts: KnownFarmerFacts;
    farmerLevel?: FarmerLevel | null;
    intent?: IntentCategory | null;
    askForCrop?: boolean;
    researchNeed?: string | null;
  },
): AgronomicCasePayload {
  const intent = options.intent ?? (payload.intent as IntentCategory | undefined) ?? null;
  const facts = options.facts;
  const level = options.farmerLevel ?? null;
  const playbook = playbookFor(facts, level);
  if (intent && !isDiagnosticIntent(intent) && !playbook) {
    return {
      ...payload,
      likelyCauses: [],
      diagnosisWhy: null,
      whatWouldChangeDiagnosis: [],
      monitorNext: null,
    };
  }

  if (!playbook) {
    return {
      ...payload,
      preliminaryAssessment: weatherMustNotLead(payload.preliminaryAssessment),
    };
  }

  let next = { ...payload };
  next.preliminaryAssessment = weatherMustNotLead(next.preliminaryAssessment);
  const likelyCauses = next.likelyCauses ?? [];
  const disconfirmers = next.whatWouldChangeDiagnosis ?? [];

  const celerySpecific = playbook.id.startsWith("celery");
  const missingStructure =
    celerySpecific ||
    isThinAssessment(next) ||
    next.checksToday.length === 0;

  if (missingStructure) {
    next = {
      ...next,
      likelyCauses: likelyCauses.length > 0 ? likelyCauses : playbook.likelyCauses,
      diagnosisWhy:
        next.diagnosisWhy ||
        (celerySpecific || isThinAssessment(payload) ? playbook.why : null),
      whatWouldChangeDiagnosis:
        disconfirmers.length > 0 ? disconfirmers : playbook.whatWouldChange,
      monitorNext: next.monitorNext || playbook.monitor,
      checksToday: next.checksToday.length > 0 ? next.checksToday : playbook.checks,
      safeActionsNow:
        next.safeActionsNow.length > 0 ? next.safeActionsNow : playbook.actionsToday,
      actionsToAvoid: next.actionsToAvoid.length > 0 ? next.actionsToAvoid : playbook.avoid,
      photoRecommended: next.photoRecommended || playbook.photoHelpful,
    };
    if (
      (celerySpecific || isThinAssessment(payload)) &&
      playbook.why &&
      (isThinAssessment(payload) || next.preliminaryAssessment.length < 80)
    ) {
      next.preliminaryAssessment = playbook.why;
    }
  } else {
    next = {
      ...next,
      likelyCauses: likelyCauses.length > 0 ? likelyCauses : [],
      diagnosisWhy: next.diagnosisWhy || null,
      whatWouldChangeDiagnosis: disconfirmers,
      monitorNext: next.monitorNext || null,
    };
  }

  if (isGuidanceStage(next.stage) || next.stage === "questioning") {
    const followUp = pickHighestValueFollowUp({
      facts,
      payload: next,
      farmerLevel: level,
      intent,
      askForCrop: options.askForCrop,
      researchNeed: options.researchNeed,
    });
    if (followUp && !questionAsksForKnownFact(followUp, facts)) {
      next.nextQuestion = followUp;
    }
  }

  return next;
}
