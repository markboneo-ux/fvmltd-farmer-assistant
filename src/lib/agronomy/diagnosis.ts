/**
 * Server-side diagnostic shaping for crop problems.
 * Ranks likely causes, keeps one follow-up, and stops weather/products from taking over.
 */

import {
  ASK_COUNTRY_QUESTION,
  ASK_FARMING_AREA_QUESTION,
  shouldAskCountry,
  shouldConfirmCountry,
  type FarmerLevel,
} from "@/lib/assistant/farmer-context";
import { ASK_CROP_QUESTION } from "@/lib/assistant/crops";
import {
  isDiagnosticIntent,
  type IntentCategory,
} from "@/lib/assistant/intents";
import { isGuidanceStage, type AgronomicCasePayload } from "./case-schema";
import { assignDiagnosisConfidence } from "./diagnosis-confidence";
import { questionAsksForKnownFact, type KnownFarmerFacts } from "./tomato-protocol";
import { extractWorkingCase, highestValueMissingQuestion } from "./working-case";
import { specificPhotoRequest, sanitizePhotoQuestion } from "./photo-request";
import { shouldAskFarmingArea } from "@/lib/weather/geocode";
import { extractObservedEvidence, genericCauseList } from "./evidence-hierarchy";
import { cropPlaybookFor, rankCropCauses } from "./crop-differentials";
import { agronomicModeFor } from "./case-modes";
import { isGenericCareQuestion, spotsAreObserved } from "./case-continuity";
import { hasLesionEvidence, isLesionSpecificDisease, containsUngatedLesionLeak, isPepperCurlYellowCase } from "./evidence-gated-causes";

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

function genericDifferentialFor(farmerLevel: FarmerLevel | null): DiagnosticPlaybook {
  if (farmerLevel === "HOME_GARDENER") {
    return {
      ...GENERIC_DIFFERENTIAL,
      id: "generic_home",
      likelyCauses: [
        "Watering or roots under stress",
        "Too much fertilizer or salt around the roots",
        "A leaf disease or pest if you see spots or insects",
      ],
      why: "Several ordinary garden problems can look similar. Separate brown tips or edges from true spots, and check whether old leaves are worse than new ones, before naming one cause.",
      checks: [
        "Does the brown start at the tips, or is it separate spots?",
        "Feel the soil — soggy or bone dry?",
        "Did you feed or spray in the last week?",
      ],
      actionsToday: [
        "Do not add more fertilizer today",
        "Water only if the soil is dry",
        "A close photo of the leaf and the whole plant would help",
      ],
      avoid: [
        "Do not mix homemade chemical sprays",
        "Do not keep adding feed while the plants look burnt",
      ],
    };
  }
  if (farmerLevel === "SMALL_FARMER") {
    return {
      ...GENERIC_DIFFERENTIAL,
      id: "generic_small",
      likelyCauses: [
        "Uneven irrigation, drainage, or salt in the beds",
        "Recent fertilizer or spray injury on the planting",
        "Disease or insects only if separate spots or pests are present",
      ],
      why: "On a small farm planting, separate field-management causes (irrigation, salt, recent spray) from disease before changing the spray programme. Walk the beds and see which patches are worse.",
      checks: [
        "Walk the beds — dry patches, wet patches, or everywhere?",
        "Did you fertigate or spray in the last week?",
        "Are older leaves worse than new growth?",
      ],
      actionsToday: [
        "Hold extra fertilizer and extra pesticide today",
        "Fix obvious dry or waterlogged spots in the beds",
        "Scout new growth over 24–72 hours before changing the spray programme",
      ],
    };
  }
  if (farmerLevel === "COMMERCIAL_FARMER") {
    return {
      ...GENERIC_DIFFERENTIAL,
      id: "generic_commercial",
      likelyCauses: [
        "Irrigation uniformity or root-zone salt/EC affecting marketable quality",
        "Nutrient imbalance with yield or harvest-timing risk",
        "Foliar disease or insects if lesions or pests are present (spray-window and resistance implications)",
      ],
      why: "On a commercial planting this is a production problem first: map the pattern across beds, check irrigation and recent fertigation, then decide whether disease or insects would force extra sprays, harvest delay, or resistance pressure. Do not treat it as a backyard watering tip only.",
      checks: [
        "Map whether damage follows beds, drippers, or spray swaths",
        "Check irrigation uniformity and recent EC/fertigation records",
        "Look for discrete lesions versus uniform margin necrosis before planning sprays",
      ],
      actionsToday: [
        "Hold extra N and extra pesticide until the pattern is mapped",
        "Correct obvious dry or waterlogged zones; do not blanket-leach unless drainage is free and EC is high",
        "Protect harvest quality by scouting new growth over 24–72 hours",
      ],
    };
  }
  if (farmerLevel === "TECHNICAL_USER") {
    return {
      ...GENERIC_DIFFERENTIAL,
      id: "generic_technical",
      likelyCauses: [
        "Root-zone water relations, pH, or EC/nutrient antagonism",
        "Phytotoxicity from a recent spray or foliar feed",
        "Foliar pathogen if discrete lesions, sporulation, or systemic symptoms",
      ],
      why: "Treat this as a physiological/pathological differential. Tip or margin necrosis implicates water, salinity/EC, or nutrient transport. Discrete lesions shift prior toward a pathogen. pH and EC interact with nutrient availability and should be read together, not as isolated numbers.",
      checks: [
        "Tip/margin necrosis vs discrete lesions; older vs younger leaves",
        "Recent fertilizer, foliar feed, or pesticide (product, rate, mix)",
        "Root-zone moisture, drainage, pH, and EC if you can measure them",
      ],
    };
  }
  if (farmerLevel === "AGRONOMIST") {
    return {
      ...GENERIC_DIFFERENTIAL,
      id: "generic_agronomist",
      likelyCauses: [
        "Rhizosphere water potential / osmotic scorch from NaCl or high EC",
        "Nutrient antagonism or transport failure versus xenobiotic injury",
        "Foliar mycosis or bacteriosis if lesion anatomy supports it; consider FRAC/IRAC only after that",
      ],
      why: "Full technical differential: competing aetiologies, lesion architecture, and epidemiology. Do not start a QoI/DMI (FRAC 11/3) or insecticide (IRAC) programme from a vague symptom. Humidity can increase both abiotic scorch and infection risk without proving either.",
      checks: [
        "Lesion architecture, halo, fruiting bodies, or water-soaking",
        "Root-zone moisture, pH, EC, and recent fertigation recipe",
        "Spray log: actives, FRAC/IRAC groups, tank-mix, and weather at application",
      ],
    };
  }
  return GENERIC_DIFFERENTIAL;
}

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

const CELERY_BURN_SMALL: DiagnosticPlaybook = {
  ...CELERY_BURN,
  id: "celery_burn_small",
  likelyCauses: [
    "Uneven watering or salt around the roots",
    "Potassium or calcium imbalance affecting the planting",
    "Spray or fertilizer injury",
  ],
  why: "On a small farm planting, tip or edge burn is usually a field-management problem first: irrigation uniformity, salt around the roots, or a recent spray. Walk the beds and see which patches are worse before changing the spray programme. Disease only rises if you see separate spots rather than a clean margin burn.",
  checks: [
    "Walk the beds — is the burn in dry patches, wet patches, or everywhere?",
    "Did you fertigate or spray in the last week?",
    "Are older leaves worse than new growth?",
  ],
  actionsToday: [
    "Hold extra fertilizer and extra pesticide today",
    "Fix obvious dry or waterlogged spots in the beds",
    "Scout new growth over 24–72 hours before changing the spray programme",
  ],
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

const CELERY_BURN_COMMERCIAL: DiagnosticPlaybook = {
  ...CELERY_BURN,
  id: "celery_burn_commercial",
  likelyCauses: [
    "Irrigation uniformity / root-zone EC concentrating at the margins",
    "K/Ca imbalance affecting marketable petiole quality",
    "Phytotoxicity from a recent spray or foliar feed",
    "Foliar disease only if discrete lesions appear (yield and harvest delay risk)",
  ],
  why: "On a commercial celery planting, tip or margin burn is first a production-quality problem: uneven watering, salt/EC, potassium or calcium supply, or spray injury. Disease matters if lesions are discrete because it can force extra sprays, harvest delays, and resistance pressure. Do not treat this as a home-garden watering tip only.",
  checks: [
    "Map whether burn follows beds, drippers, or spray swaths",
    "Check irrigation uniformity and recent EC/fertigation records",
    "Review the last spray/foliar-feed rate, mix, and interval",
    "Look for discrete lesions versus uniform margin necrosis",
  ],
  actionsToday: [
    "Hold extra N and extra pesticide until the pattern is mapped",
    "Correct obvious dry or waterlogged zones; do not blanket-leach unless drainage is free and EC is high",
    "Protect harvest quality by scouting new growth over 24–72 hours",
  ],
};

const CELERY_BURN_AGRONOMIST: DiagnosticPlaybook = {
  ...CELERY_BURN,
  id: "celery_burn_agronomist",
  likelyCauses: [
    "Root-zone water potential / NaCl or high EC osmotic scorch",
    "Ca/K antagonism or Ca transport failure (tip burn) vs Cl phytotoxicity",
    "Xenobiotic injury (tank-mix incompatibility, surfactant, or high-temperature application)",
    "Foliar mycosis (Cercospora apii / Septoria apiicola) if discrete lesions, halos, or pycnidia; consider bacterial blight if water-soaked",
  ],
  why: "Treat this as an epidemiological differential, not a single diagnosis. Marginal necrosis implicates rhizosphere water relations, salinity/EC, Ca/K physiology, or xenobiotic injury. Discrete lesions shift prior toward Cercospora/Septoria; confirm with lesion anatomy before invoking a QoI/DMI (FRAC 11/3) programme. Humidity can increase both abiotic scorch and infection risk without proving either.",
  checks: [
    "Lesion architecture: tip/margin necrosis vs discrete lesions, halo, pycnidia, or water-soaking",
    "Root-zone moisture, drainage, pH, and EC; recent fertigation recipe",
    "Spray log: products, rates, FRAC/IRAC groups, tank-mix, and weather at application",
    "Spatial pattern: row, irrigation zone, or random foci",
  ],
  actionsToday: [
    "Do not start a fungicide programme until lesion type supports a pathogen",
    "If a QoI or DMI becomes justified later, plan FRAC rotation; do not invent a rate",
    "Hold further N until root-zone status is clearer; photograph lesion margin, whole plant, and root zone",
  ],
  whatWouldChange: [
    "Pycnidia, chlorotic halo, or lab isolation would elevate Cercospora/Septoria to likely",
    "A documented high-EC reading or incompatible tank-mix would elevate abiotic injury",
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
  // Empty ranked-cause slots are filled from the playbook. A long, specific
  // assessment is not thin just because those arrays were left empty.
  return false;
}

export function playbookFor(
  facts: KnownFarmerFacts,
  farmerLevel: FarmerLevel | null,
): DiagnosticPlaybook | null {
  if (isCeleryBurn(facts)) {
    if (farmerLevel === "HOME_GARDENER") return CELERY_BURN_HOME;
    if (farmerLevel === "SMALL_FARMER") return CELERY_BURN_SMALL;
    if (farmerLevel === "COMMERCIAL_FARMER") return CELERY_BURN_COMMERCIAL;
    if (farmerLevel === "AGRONOMIST") return CELERY_BURN_AGRONOMIST;
    if (farmerLevel === "TECHNICAL_USER") return CELERY_BURN_TECHNICAL;
    return CELERY_BURN;
  }

  const evidence = extractObservedEvidence({ facts, text: facts.rawText });
  const ranked = rankCropCauses({
    text: facts.rawText,
    crop: facts.crop,
    evidence,
    facts,
  });
  const cropSpecific = cropPlaybookFor({
    crop: facts.crop,
    facts,
    evidence,
    farmerLevel,
    ranked,
  });
  if (cropSpecific) return cropSpecific;

  const text = facts.rawText.toLowerCase();
  const hasNamedProblem =
    /\b(burn|burning|yellowing|spots?|stunt|wilt|holes?|leaf\s+spot|scorch|necrosis|brown(ing)?|leaf\s+edges?|tip\s*burn|cercospora|septoria|alternaria|mildew|anthracnose|blight|rot|lesion|chloros)\b/.test(
      text,
    );
  // Generic root/nutrient/foliar cards are last resort only — never for a
  // named pest, discrete spots, or sudden wilt on a known crop.
  if (
    hasNamedProblem &&
    facts.crop &&
    !evidence.observedPest &&
    !evidence.symptoms.includes("spots") &&
    !facts.suddenWilt &&
    !/\bwilt/.test(text)
  ) {
    return genericDifferentialFor(farmerLevel);
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

  if (
    shouldConfirmCountry({
      country: facts.country,
      confidence: facts.locationConfidence,
      asksForProducts: facts.asksForProducts,
      researchNeed: options.researchNeed,
      farmingArea: facts.district,
    })
  ) {
    return `Just to confirm, are you farming in ${facts.country}?`;
  }

  const working = extractWorkingCase(facts);
  const evidence = extractObservedEvidence({ facts, text: facts.rawText });
  const playbook = playbookFor(facts, options.farmerLevel ?? null);
  if (playbook?.id.startsWith("celery") && playbook.oneQuestion) {
    if (
      !working.symptomLocation &&
      !questionAsksForKnownFact(playbook.oneQuestion, facts)
    ) {
      return playbook.oneQuestion;
    }
  }

  const existing = payload.nextQuestion.trim();
  const spotsObserved = spotsAreObserved(evidence, null, facts);
  const staleSpotQuestion =
    !spotsObserved &&
    /\b(pale centre|water-soaked|separate spots|true (leaf )?spots|greasy)\b/i.test(existing) &&
    !/\b(photo|photograph|image)\b/i.test(existing);
  if (
    existing &&
    !questionAsksForKnownFact(existing, facts) &&
    !/\bcountry\b/i.test(existing) &&
    !/just to confirm, are you farming in/i.test(existing) &&
    !isGenericCareQuestion(existing) &&
    !staleSpotQuestion
  ) {
    return existing;
  }

  if (
    playbook?.oneQuestion &&
    !working.symptomLocation &&
    !questionAsksForKnownFact(playbook.oneQuestion, facts)
  ) {
    return playbook.oneQuestion;
  }

  const missing = highestValueMissingQuestion({
    working,
    locationConfidence: facts.locationConfidence,
    asksForProducts: facts.asksForProducts,
    photoRecommended: payload.photoRecommended,
    diagnostic: Boolean(facts.crop),
    weatherNeeded: payload.weatherRelevance === "supporting" || payload.weatherRelevance === "important" || payload.weatherRelevance === "central",
    weatherIsCentral: payload.weatherRelevance === "central",
  });
  if (missing && !questionAsksForKnownFact(missing, facts)) {
    return missing;
  }

  if (
    shouldAskFarmingArea({
      farmingArea: facts.district,
      district: facts.district,
      country: facts.country,
      weatherNeeded:
        payload.weatherRelevance === "supporting" ||
        payload.weatherRelevance === "important" ||
        payload.weatherRelevance === "central",
      weatherIsCentral: payload.weatherRelevance === "central",
    })
  ) {
    return ASK_FARMING_AREA_QUESTION;
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
    const photoAsk =
      specificPhotoRequest({
        facts,
        alreadyRequested: false,
      })?.farmerQuestion ??
      "Can you send a close photo of the affected leaf plus a whole plant?";
    return sanitizePhotoQuestion(photoAsk, facts);
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
      locationConfidence: facts.locationConfidence,
    };
  }

  if (!playbook) {
    return withDiagnosisConfidence(
      {
        ...payload,
        preliminaryAssessment: weatherMustNotLead(payload.preliminaryAssessment),
      },
      facts,
    );
  }

  let next = { ...payload };
  next.preliminaryAssessment = weatherMustNotLead(next.preliminaryAssessment);
  const likelyCauses = next.likelyCauses ?? [];
  const disconfirmers = next.whatWouldChangeDiagnosis ?? [];
  const evidence = extractObservedEvidence({ facts, text: facts.rawText });
  const mode = agronomicModeFor({ evidence, facts });

  const celerySpecific = playbook.id.startsWith("celery");
  const cropSpecific = !playbook.id.startsWith("generic");
  const incomingGeneric = genericCauseList(likelyCauses);
  const lesion = hasLesionEvidence({ evidence, facts });
  const incomingLesionWithoutEvidence =
    likelyCauses.some((label) => isLesionSpecificDisease(label)) && !lesion;
  const curlYellow = isPepperCurlYellowCase({ facts, evidence, crop: facts.crop }) && !lesion;
  const incomingLeaky =
    curlYellow &&
    (containsUngatedLesionLeak(next.preliminaryAssessment) ||
      next.checksToday.some((item) => containsUngatedLesionLeak(item)) ||
      next.safeActionsNow.some((item) => containsUngatedLesionLeak(item)) ||
      next.actionsToAvoid.some((item) => containsUngatedLesionLeak(item)));
  const usePlaybookCauses =
    likelyCauses.length === 0 ||
    incomingGeneric ||
    (cropSpecific && incomingGeneric) ||
    incomingLesionWithoutEvidence ||
    curlYellow;

  next = {
    ...next,
    likelyCauses: usePlaybookCauses ? playbook.likelyCauses : likelyCauses,
    diagnosisWhy:
      curlYellow ||
      (!lesion && /\b(cercospora|frogeye|bacterial leaf spot|pale[- ]centr|water[\s-]?soaked|greasy)\b/i.test(
        next.diagnosisWhy || "",
      ))
        ? playbook.why
        : next.diagnosisWhy || playbook.why,
    whatWouldChangeDiagnosis:
      curlYellow ||
      (!lesion &&
        (payload.whatWouldChangeDiagnosis ?? []).some((item) =>
          /\b(pale[- ]centr|greasy|water[\s-]?soaked|cercospora)\b/i.test(item),
        ))
        ? playbook.whatWouldChange
        : disconfirmers.length > 0
          ? disconfirmers
          : playbook.whatWouldChange,
    monitorNext: next.monitorNext || playbook.monitor,
    checksToday:
      curlYellow && (next.checksToday.length === 0 || incomingLeaky || next.checksToday.some((item) => containsUngatedLesionLeak(item)))
        ? playbook.checks
        : next.checksToday.length > 0
          ? next.checksToday
          : playbook.checks,
    safeActionsNow:
      curlYellow && (next.safeActionsNow.length === 0 || incomingLeaky || next.safeActionsNow.some((item) => containsUngatedLesionLeak(item)))
        ? playbook.actionsToday
        : next.safeActionsNow.length > 0
          ? next.safeActionsNow
          : playbook.actionsToday,
    actionsToAvoid:
      curlYellow && (next.actionsToAvoid.length === 0 || incomingLeaky || next.actionsToAvoid.some((item) => containsUngatedLesionLeak(item)))
        ? playbook.avoid
        : next.actionsToAvoid.length > 0
          ? next.actionsToAvoid
          : playbook.avoid,
    photoRecommended: next.photoRecommended || playbook.photoHelpful,
    agronomicMode: mode,
  };
  if (
    (celerySpecific || cropSpecific || isThinAssessment(payload) || curlYellow || incomingLeaky) &&
    playbook.why &&
    (isThinAssessment(payload) ||
      incomingGeneric ||
      incomingLeaky ||
      curlYellow ||
      next.preliminaryAssessment.length < 80)
  ) {
    next.preliminaryAssessment = playbook.why;
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

  if (
    facts.asksForProducts &&
    /\b(cercospora|septoria|alternaria|leaf\s+spot|spots?|white\s*fl|spray)\b/i.test(facts.rawText)
  ) {
    const general =
      "Active ingredients normally used against this kind of problem are listed only as general agronomy, not proof of local registration.";
    if (!/haven't verified registration|active ingredients normally used|could not verify a current/i.test(next.preliminaryAssessment)) {
      next.preliminaryAssessment = `${next.preliminaryAssessment} ${general}`.trim();
    }
  }

  return withDiagnosisConfidence(next, facts);
}

function withDiagnosisConfidence(
  payload: AgronomicCasePayload,
  facts: KnownFarmerFacts,
): AgronomicCasePayload {
  const evidenceCount = [
    facts.distributionHint,
    facts.plantAge,
    facts.irrigationType,
    facts.recentFertilizer,
    facts.recentPesticide,
    facts.variety,
  ].filter(Boolean).length;
  return {
    ...payload,
    locationConfidence: facts.locationConfidence,
    diagnosisConfidence: assignDiagnosisConfidence({
      claimed: payload.diagnosisConfidence,
      farmerReportedLab: /\b(lab(oratory)? (said|confirmed|result)|agronomist confirmed)\b/i.test(
        facts.rawText,
      ),
      causeCount: (payload.likelyCauses ?? []).length,
      evidenceCount,
    }),
  };
}
