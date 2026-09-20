/**
 * Keep one authoritative crop-health case across turns.
 * Generated sections must match observed symptoms, not leftover templates.
 */

import { farmingAreaUniquelyImpliesCountry } from "@/lib/weather/geocode";
import type { LocationConfidence } from "@/lib/assistant/farmer-context";
import type { AgronomicCasePayload } from "./case-schema";
import type { CropHealthCaseState } from "./crop-health-state";
import type { ObservedEvidence } from "./evidence-hierarchy";
import type { KnownFarmerFacts } from "./tomato-protocol";
import { SPRAY_NEEDED_HEADING } from "./chemical-guidance";

export const SPOT_LEAKAGE =
  /\b(pale centre|pale center|greasy water-?soaked|water-?soaked spots|fungal vs bacterial|cercospora|frogeye|separate spots|true leaf spots|leaf spots)\b/i;

export const SPRAY_HEADING_RE = /if a spray is needed/gi;

export const DIAGNOSTIC_CONTINUITY =
  /\b((make sure|want) .{0,40}(survive|live|ok|okay)|save (the |my )?(plants?|crop|peppers?)|what should i do|is this serious|i('m| am) worried|help (them|the plants)|how (do i|can i) (save|keep|protect))\b/i;

export const VIRUS_ROGUE_CAUTION =
  "Do not remove whole plants for an unconfirmed virus. First inspect vectors, the symptom pattern, how plants are distributed, and whether new growth is still curling. Staff review may be appropriate before any destructive action.";

const SPOT_TOKENS = /\b(spots?|lesions?|pale centre|pale center|water-?soaked|greasy specks?|frogeye|cercospora)\b/i;

export function isDiagnosticContinuityFollowUp(message: string): boolean {
  const text = message.trim();
  if (!text) return false;
  if (DIAGNOSTIC_CONTINUITY.test(text)) return true;
  return /^(what should i do\??|is this serious\??|please help\.?|help them\.?)$/i.test(text);
}

export function uniqueAreaConfirmsCountry(options: {
  farmingArea?: string | null;
  country?: string | null;
}): boolean {
  const implied = farmingAreaUniquelyImpliesCountry(options.farmingArea);
  if (!implied || !options.country) return false;
  return implied.toLowerCase() === options.country.trim().toLowerCase();
}

export function shouldSkipCountryConfirmation(options: {
  country?: string | null;
  farmingArea?: string | null;
  confidence?: LocationConfidence | null;
}): boolean {
  if (!options.country?.trim()) return false;
  if (options.confidence === "explicit" || options.confidence === "profile_confirmed") {
    return true;
  }
  return uniqueAreaConfirmsCountry({
    farmingArea: options.farmingArea,
    country: options.country,
  });
}

export function observedSymptomSet(
  evidence: ObservedEvidence,
  state?: CropHealthCaseState | null,
): Set<string> {
  const items = [
    ...evidence.symptoms,
    ...(state?.observedSymptoms ?? []),
    ...(state?.symptoms ?? []),
    ...(state?.photoFindings ?? []),
  ]
    .map((item) => item.toLowerCase())
    .filter(Boolean);
  return new Set(items);
}

export function spotsAreObserved(
  evidence: ObservedEvidence,
  state?: CropHealthCaseState | null,
  facts?: KnownFarmerFacts | null,
): boolean {
  const blob = [
    ...evidence.symptoms,
    ...(state?.observedSymptoms ?? []),
    ...(state?.symptoms ?? []),
    ...(state?.photoFindings ?? []),
    facts?.suspectedIssue ?? "",
    facts?.rawText ?? "",
  ]
    .join(" ")
    .toLowerCase();
  if (/\bno (discrete )?(leaf[- ]?)?spots?\b/.test(blob)) return false;
  return (
    evidence.symptoms.includes("spots") ||
    (/\b(spots?|lesions?|leaf spot|cercospora|septoria|frogeye)\b/.test(blob) &&
      !/\bno discrete spots\b/.test(blob))
  );
}

export function sprayDiscussionJustified(options: {
  asksForSpray: boolean;
  evidence: ObservedEvidence;
  diagnosisConfidence?: string | null;
  mode?: string | null;
  state?: CropHealthCaseState | null;
}): boolean {
  if (options.asksForSpray) return true;
  const confidence = options.diagnosisConfidence ?? options.state?.diagnosticConfidence;
  const high =
    confidence === "highly_likely" ||
    confidence === "confirmed" ||
    confidence === "likely";
  if (!high) return false;
  if (options.evidence.observedPest && options.mode === "OBSERVED_PEST_MANAGEMENT") {
    return true;
  }
  return spotsAreObserved(options.evidence, options.state);
}

export function stripSpraySections(text: string): string {
  if (!text.trim()) return text;
  return text
    .replace(
      /\n*(?:if a spray is needed|if a spray is needed —)[:\s]*[\s\S]*?(?=\n(?:what would change|what to watch|check this now|what to do now)|$)/gi,
      "\n",
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function countSpraySections(text: string): number {
  return (text.match(SPRAY_HEADING_RE) ?? []).length;
}

export function referencesUnobservedSpots(text: string, spotsObserved: boolean): boolean {
  if (spotsObserved) return false;
  return SPOT_TOKENS.test(text) || SPOT_LEAKAGE.test(text);
}

const ABSENT_SPOT_REPLACEMENTS: Array<[RegExp, string]> = [
  [
    /\bI need a closer look at the spots[^.]*\./gi,
    "I need a closer look at the curled and yellowing leaves — insects underneath versus an even nutrient pattern — before naming a cause.",
  ],
  [
    /\bpale centre versus greasy water-soaked[^.]*\./gi,
    "whether insects are under the curled new leaves, and whether yellowing is worse on old or new growth.",
  ],
  [
    /\b(round spots with a pale centre|greasy and water-soaked|fungal vs bacterial|leaf spots on pepper)\b/gi,
    "the curling and yellowing you described",
  ],
];

export function stripUnobservedSpotLanguage(text: string, spotsObserved: boolean): string {
  if (!text.trim() || spotsObserved) return text;
  let next = text;
  for (const [pattern, replacement] of ABSENT_SPOT_REPLACEMENTS) {
    next = next.replace(pattern, replacement);
  }
  next = next
    .replace(/\btrue leaf spots\b/gi, "the curling and yellowing")
    .replace(/\bleaf[- ]spots?\b/gi, "leaf symptoms")
    .replace(/\bseparate spots\b/gi, "a different pattern")
    .replace(/\b(fungal|bacterial) leaf spot\b/gi, "a leaf disease")
    .replace(/\bpale-centred spots\b/gi, "a spotted pattern, which has not been reported")
    .replace(/\bwater-soaked spots\b/gi, "water-soaked lesions, which have not been reported")
    .replace(/\bunless spots are visible\b/gi, "unless a spotted pattern is later seen")
    .replace(/\bI need a closer look at the spots\b/gi, "I need a closer look at the curled and yellowing leaves");
  if (SPOT_LEAKAGE.test(next) && !/\bno (leaf )?spots\b/i.test(next) && !/\bnot been reported\b/i.test(next)) {
    next = next.replace(SPOT_LEAKAGE, "the curling and yellowing already described");
  }
  return next;
}

export function photoChangedRankingLine(options: {
  photoFindings: string[];
  causes: string[];
}): string {
  const findings = options.photoFindings.map((item) => item.trim()).filter(Boolean);
  const causeList = options.causes.slice(0, 3);
  const supported = causeList[0] ?? "the leading possibility";
  const weakened =
    causeList.find((label) => /waterlog|drain|blight|fungal/i.test(label)) ??
    "a drainage problem that was not described";
  const seen = findings.length
    ? findings.slice(0, 2).join("; ")
    : "cupping, uneven yellowing, or insects if they are visible";
  return `The photo makes ${supported} more likely because it shows ${seen}. It makes ${weakened} less likely unless those signs are actually visible. A still photo cannot prove a virus or name an insect that is not in the frame.`;
}

export function photoUnknownLine(): string {
  return "What remains unknown: whether insects are under the curled new leaves, whether yellowing is worse on old or new growth, and whether affected plants are scattered or grouped.";
}

export function highestValueCurlYellowQuestion(state?: CropHealthCaseState | null): string {
  const answered = new Set(
    (state?.answeredDiagnosticQuestions ?? []).map((item) => item.toLowerCase()),
  );
  const last = (state?.lastDiagnosticQuestion ?? "").toLowerCase();
  const candidates = [
    "Are insects present under the curled new leaves?",
    "Is yellowing worse on old leaves or new growth?",
    "Are affected plants scattered, in patches or field-wide?",
  ];
  for (const question of candidates) {
    const key = question.toLowerCase();
    if (answered.has(key) || last.includes(key.slice(0, 24))) continue;
    return question;
  }
  return candidates[0];
}

export function oneFollowUpQuestion(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const parts = trimmed.split(/(?<=[?])/).map((item) => item.trim()).filter(Boolean);
  const questions = parts.filter((item) => item.endsWith("?"));
  return questions[0] ?? trimmed;
}

export function isGenericCareQuestion(question: string): boolean {
  return /\b(pots or in the ground|water regularly|balanced fertilizer|prune for airflow|keep (sweet )?peppers healthy|generic pepper care)\b/i.test(
    question,
  );
}

export function isCurlYellowCase(
  evidence: ObservedEvidence,
  facts?: KnownFarmerFacts | null,
  state?: CropHealthCaseState | null,
): boolean {
  const blob = [
    ...evidence.symptoms,
    ...(state?.observedSymptoms ?? []),
    facts?.suspectedIssue ?? "",
    facts?.rawText ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return (
    evidence.symptoms.includes("leaf curl") ||
    /\bcurl/.test(blob) ||
    facts?.suspectedIssue === "leaf curl" ||
    facts?.suspectedIssue === "leaf curl and yellowing"
  );
}

export function applyAuthoritativeCaseValidation(
  payload: AgronomicCasePayload,
  options: {
    facts: KnownFarmerFacts;
    evidence: ObservedEvidence;
    state?: CropHealthCaseState | null;
    hasPhotos?: boolean;
  },
): AgronomicCasePayload {
  const spotsObserved = spotsAreObserved(options.evidence, options.state, options.facts);
  const asksForSpray = options.facts.asksForProducts;
  const justified = sprayDiscussionJustified({
    asksForSpray,
    evidence: options.evidence,
    diagnosisConfidence: payload.diagnosisConfidence,
    mode: payload.agronomicMode,
    state: options.state,
  });

  const clean = (value: string) =>
    stripUnobservedSpotLanguage(justified ? stripSpraySections(value) : stripSpraySections(value), spotsObserved);

  let next: AgronomicCasePayload = {
    ...payload,
    preliminaryAssessment: clean(payload.preliminaryAssessment),
    diagnosisWhy: payload.diagnosisWhy ? clean(payload.diagnosisWhy) : payload.diagnosisWhy,
    checksToday: payload.checksToday.map(clean).filter(Boolean),
    safeActionsNow: payload.safeActionsNow.map(clean).filter(Boolean),
    actionsToAvoid: payload.actionsToAvoid.map(clean).filter(Boolean),
    likelyCauses: (payload.likelyCauses ?? [])
      .filter((label) => spotsObserved || !/\b(cercospora|frogeye|bacterial leaf spot|septoria|early blight)\b/i.test(label))
      .map(clean),
    whatWouldChangeDiagnosis: (payload.whatWouldChangeDiagnosis ?? []).map(clean),
    monitorNext: payload.monitorNext ? clean(payload.monitorNext) : payload.monitorNext,
    nextQuestion: oneFollowUpQuestion(clean(payload.nextQuestion)),
  };

  if (!spotsObserved) {
    next.rankedCauses = (next.rankedCauses ?? []).filter(
      (cause) => !/\b(cercospora|frogeye|bacterial leaf spot|septoria|leaf spot)\b/i.test(cause.label),
    );
    if (
      isCurlYellowCase(options.evidence, options.facts, options.state) &&
      referencesUnobservedSpots(next.nextQuestion, false) &&
      !/\b(photo|photograph|image)\b/i.test(next.nextQuestion)
    ) {
      next = {
        ...next,
        nextQuestion: highestValueCurlYellowQuestion(options.state),
      };
    }
  }

  if (!justified) {
    next = { ...next, sprayGuidanceText: null, verifiedInputOptions: [] };
  } else if (next.sprayGuidanceText) {
    next = {
      ...next,
      sprayGuidanceText: stripUnobservedSpotLanguage(next.sprayGuidanceText, spotsObserved),
      preliminaryAssessment: stripSpraySections(next.preliminaryAssessment),
      diagnosisWhy: next.diagnosisWhy ? stripSpraySections(next.diagnosisWhy) : next.diagnosisWhy,
    };
  }

  if (options.hasPhotos) {
    const photoLine = photoChangedRankingLine({
      photoFindings: options.state?.photoFindings?.length
        ? options.state.photoFindings
        : options.evidence.photoEvidence,
      causes: next.likelyCauses ?? [],
    });
    const unknown = photoUnknownLine();
    const assessment = next.diagnosisWhy || next.preliminaryAssessment;
    if (!/the photo makes\b/i.test(assessment)) {
      next = {
        ...next,
        diagnosisWhy: `${assessment}\n\n${photoLine} ${unknown}`.trim(),
        preliminaryAssessment: `${next.preliminaryAssessment}\n\n${photoLine}`.trim(),
      };
    }
  }

  if (
    isCurlYellowCase(options.evidence, options.facts, options.state) &&
    (isGenericCareQuestion(next.nextQuestion) ||
      (!spotsObserved &&
        referencesUnobservedSpots(next.nextQuestion, false) &&
        !/\b(photo|photograph|image)\b/i.test(next.nextQuestion)))
  ) {
    next = {
      ...next,
      nextQuestion: highestValueCurlYellowQuestion(options.state),
    };
  }

  next = {
    ...next,
    nextQuestion: oneFollowUpQuestion(next.nextQuestion),
  };

  return next;
}

export function farmerIntentFromMessage(message: string, asksForProducts: boolean): string {
  if (asksForProducts) return "spray_or_treatment";
  if (isDiagnosticContinuityFollowUp(message)) return "reassurance_same_case";
  if (/\bphoto|image|picture|upload\b/i.test(message)) return "photo_update";
  return "diagnosis";
}
