/**
 * Server-owned farmer diagnosis pipeline.
 *
 * farmer text/photo/weather
 *   → structured observations
 *   → allowed cause IDs
 *   → evidence gate / admitted IDs
 *   → model explains only those IDs
 *   → server renders the farmer answer
 *
 * The model is not the authority for which diagnoses may exist.
 */

import type { AgronomicCasePayload } from "./case-schema";
import {
  admitCauseIds,
  allowedCauseIds,
  CAUSE_CATALOG,
  causeIdFromLabel,
  farmerNamedCauseIds,
  type CauseId,
  isCauseId,
  type PipelineObservations,
} from "./cause-catalog";
import type { CauseRankingDebug, GatedCause } from "./evidence-gated-causes";
import {
  CURL_YELLOW_ACTIONS,
  CURL_YELLOW_AVOID,
  CURL_YELLOW_CHECKS,
  HOLD_FERTILIZER,
  OLD_VS_NEW_YELLOW_QUESTION,
  UNDERSIDE_INSECT_QUESTION,
  photoEvidenceNarrative,
  photoFindingsAreUncertain,
  hasLesionEvidence,
  sanitizePhotoFindings,
  farmerReportedLesions,
  setAdmittedCauseContractImpl,
} from "./evidence-gated-causes";
import { extractObservedEvidence, type ObservedEvidence } from "./evidence-hierarchy";
import type { CropHealthCaseState } from "./crop-health-state";
import type { KnownFarmerFacts } from "./tomato-protocol";
import { WHITEFLY_UNDERSIDE_PHOTO } from "./photo-request";

export type { PipelineObservations };

export const CONSERVATIVE_CURL_YELLOW_FALLBACK =
  "The curling and yellowing can come from several causes. I don’t have enough evidence yet to name the problem. First check the underside of the newest curled leaves for insects.";

export const CONSERVATIVE_GENERIC_FALLBACK =
  "I don’t have enough evidence yet to name the problem. First check the underside of the newest affected leaves for insects.";

export const STRUCTURED_REASONING_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "observations",
    "admittedCauseIds",
    "reasoningPerCause",
    "checks",
    "immediateActions",
    "nextQuestion",
    "photoRequest",
  ],
  properties: {
    observations: {
      type: "object",
      additionalProperties: false,
      required: [
        "crop",
        "symptoms",
        "lesionsReported",
        "insectsReported",
        "mosaicReported",
        "wetOrDrainageReported",
      ],
      properties: {
        crop: { type: "string" },
        symptoms: { type: "array", items: { type: "string" } },
        lesionsReported: { type: "boolean" },
        insectsReported: { type: "boolean" },
        mosaicReported: { type: "boolean" },
        wetOrDrainageReported: { type: "boolean" },
      },
    },
    admittedCauseIds: {
      type: "array",
      items: { type: "string" },
    },
    reasoningPerCause: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["causeId", "why"],
        properties: {
          causeId: { type: "string" },
          why: { type: "string" },
        },
      },
    },
    checks: { type: "array", items: { type: "string" } },
    immediateActions: { type: "array", items: { type: "string" } },
    nextQuestion: { type: "string" },
    photoRequest: { type: "boolean" },
  },
} as const;

export type StructuredReasoning = {
  observations?: {
    crop?: string;
    symptoms?: string[];
    lesionsReported?: boolean;
    insectsReported?: boolean;
    mosaicReported?: boolean;
    wetOrDrainageReported?: boolean;
  };
  admittedCauseIds: string[];
  reasoningPerCause: Array<{ causeId: string; why: string }>;
  checks: string[];
  immediateActions: string[];
  nextQuestion: string;
  photoRequest: boolean;
};

export type FarmerPipelineResult = {
  observations: PipelineObservations;
  allowedCauseIds: CauseId[];
  admittedCauseIds: CauseId[];
  discardedCauseIds: string[];
  rawModelCauseIds: string[];
  admitted: GatedCause[];
  usedConservativeFallback: boolean;
  validationFailed: boolean;
};

function cropKey(crop: string | null | undefined, rawText = ""): string | null {
  const raw = `${crop ?? ""} ${rawText}`.trim().toLowerCase();
  if (/\b(sweet\s+|hot\s+|bell\s+)?peppers?\b/.test(raw) || /\bcapsicum\b/.test(raw) || /\bscotch bonnet\b/.test(raw)) {
    return "pepper";
  }
  if (/\btomatoes?\b/.test(raw)) return "tomato";
  if (/\bcelery\b/.test(raw)) return "celery";
  if (/\blettuce\b/.test(raw)) return "lettuce";
  if (/\bcucumbers?\b/.test(raw)) return "cucumber";
  if (/\bcabbage\b/.test(raw)) return "cabbage";
  if (/\b(banana|plantain)\b/.test(raw)) return "banana";
  if (/\bcassava\b/.test(raw)) return "cassava";
  const trimmed = (crop ?? "").trim().toLowerCase();
  return trimmed || null;
}

export function extractPipelineObservations(options: {
  facts: KnownFarmerFacts;
  evidence: ObservedEvidence;
  previousState?: CropHealthCaseState | null;
  hasPhotos?: boolean;
}): PipelineObservations {
  const findings = sanitizePhotoFindings([
    ...(options.previousState?.photoFindings ?? []),
    ...options.evidence.photoEvidence,
  ]);
  const photoUncertain = photoFindingsAreUncertain(findings, options.hasPhotos);
  const lesionEvidence =
    hasLesionEvidence({
      evidence: options.evidence,
      facts: options.facts,
      state: options.previousState,
      photoFindings: findings,
      hasPhotos: options.hasPhotos,
    }) && !photoUncertain;
  const text = options.facts.rawText.toLowerCase();
  const curlReported =
    options.evidence.symptoms.includes("leaf curl") || /\bcurl/.test(text);
  const yellowingReported =
    options.evidence.symptoms.includes("yellowing") || /\byellow/.test(text);
  const mosaicReported = /\b(mosaic|mottle|mottled)\b/.test(text) ||
    findings.some((item) => /\b(mosaic|mottle)\b/i.test(item));
  const wetOrDrainageEvidence =
    options.evidence.wetFromFarmer ||
    options.evidence.weatherSignals.includes("prolonged_wetness") ||
    /\b(waterlog|poor drain|puddle|flood|soggy)\b/.test(text);
  return {
    crop: options.facts.crop,
    cropKey: cropKey(options.facts.crop, options.facts.rawText),
    symptoms: options.evidence.symptoms.filter((item) => item !== "spots" || lesionEvidence),
    lesionsReported: farmerReportedLesions(options.facts.rawText),
    lesionEvidence,
    insectsReported: Boolean(options.evidence.observedPest) || /\b(aphids?|whitefl|mites?|thrips|insects?)\b/.test(text),
    observedPest: options.evidence.observedPest,
    mosaicReported,
    wetOrDrainageEvidence,
    dryEvidence:
      options.evidence.dryFromFarmer || options.evidence.weatherSignals.includes("dry_conditions"),
    heatEvidence:
      options.evidence.heatFromFarmer || options.evidence.weatherSignals.includes("heat_stress"),
    wiltReported: options.evidence.symptoms.includes("wilt") || /\bwilt/.test(text),
    leafBurnReported: options.evidence.symptoms.includes("leaf burn"),
    curlReported,
    yellowingReported,
    sprayMentioned: Boolean(options.facts.recentPesticide) || /\b(herbicide|roundup|spray burn)\b/.test(text),
    farmingArea: options.facts.district,
    country: options.facts.country,
    photoAttached: Boolean(options.hasPhotos),
    photoUncertain,
    photoFindings: findings,
    farmerNamedCauseIds: farmerNamedCauseIds(options.facts.rawText),
  };
}

export function isStructuredReasoningJson(raw: unknown): raw is StructuredReasoning {
  if (!raw || typeof raw !== "object") return false;
  const data = raw as Record<string, unknown>;
  return Array.isArray(data.admittedCauseIds) && Array.isArray(data.reasoningPerCause);
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseStructuredReasoning(raw: unknown): StructuredReasoning | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  if (Array.isArray(data.admittedCauseIds)) {
    const observations =
      data.observations && typeof data.observations === "object"
        ? (data.observations as StructuredReasoning["observations"])
        : undefined;
    return {
      observations,
      admittedCauseIds: asStringArray(data.admittedCauseIds),
      reasoningPerCause: Array.isArray(data.reasoningPerCause)
        ? data.reasoningPerCause.flatMap((item) => {
            if (!item || typeof item !== "object") return [];
            const row = item as Record<string, unknown>;
            const causeId = typeof row.causeId === "string" ? row.causeId.trim() : "";
            const why = typeof row.why === "string" ? row.why.trim() : "";
            if (!causeId) return [];
            return [{ causeId, why }];
          })
        : [],
      checks: asStringArray(data.checks),
      immediateActions: asStringArray(data.immediateActions),
      nextQuestion: typeof data.nextQuestion === "string" ? data.nextQuestion.trim() : "",
      photoRequest: data.photoRequest === true,
    };
  }
  return null;
}

export function collectModelCauseTokens(payload: AgronomicCasePayload, reasoning?: StructuredReasoning | null): string[] {
  const tokens = [
    ...(payload.rawModelCauses ?? []),
    ...(payload.likelyCauses ?? []),
    ...(reasoning?.admittedCauseIds ?? []),
    ...(reasoning?.reasoningPerCause ?? []).map((item) => item.causeId),
  ];
  if (Array.isArray(payload.rankedCauses)) {
    for (const item of payload.rankedCauses) {
      tokens.push(item.label);
    }
  }
  const unique: string[] = [];
  for (const token of tokens) {
    const trimmed = token.trim();
    if (!trimmed) continue;
    if (unique.some((item) => item.toLowerCase() === trimmed.toLowerCase())) continue;
    unique.push(trimmed);
  }
  return unique;
}

const UNALLOWED_NAME =
  /\b(cercospora|frogeye|bacterial leaf spot|fungal leaf spot|septoria|early blight|pale[- ]centr(?:ed|e)?|water[\s-]?soaked|greasy(?:\s+specks?)?|mancozeb|chlorothalonil|copper(?:-based)?\s+(?:spray|protectants?|bactericides?|classes?)|if a spray is needed)\b/i;

function mentionsUnallowedCause(text: string, allowed: CauseId[]): boolean {
  if (!text.trim()) return false;
  const allowedLabels = new Set(allowed.map((id) => CAUSE_CATALOG[id].farmerLabel.toLowerCase()));
  if (UNALLOWED_NAME.test(text)) {
    const lesionAllowed = allowed.some((id) => CAUSE_CATALOG[id].requiresLesionEvidence);
    if (!lesionAllowed) return true;
    if (/\b(mancozeb|chlorothalonil|if a spray is needed)\b/i.test(text)) return true;
  }
  const idHit = causeIdFromLabel(text);
  if (idHit && !allowed.includes(idHit) && !allowedLabels.has(text.toLowerCase())) {
    return true;
  }
  return false;
}

function cleanModelLines(lines: string[], allowed: CauseId[]): string[] {
  return lines
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !mentionsUnallowedCause(item, allowed));
}

function gatedFromIds(ids: CauseId[], obs: PipelineObservations): GatedCause[] {
  return ids.map((id, index) => {
    const def = CAUSE_CATALOG[id];
    const source: GatedCause["evidenceSource"] = obs.photoAttached && obs.photoFindings.length > 0
      ? "photo_finding"
      : obs.wetOrDrainageEvidence && (id === "ROOT_WATER_STRESS" || id === "WATERLOGGING")
        ? "weather_support"
        : "farmer_report";
    const fact =
      id === "APHIDS" || id === "MITES"
        ? "leaf curling can start with sucking insects under new leaves"
        : id === "NUTRIENT_PATTERN"
          ? "yellowing is present; old-versus-new pattern is not yet known"
          : obs.symptoms.join(", ") || "described symptoms";
    return {
      id,
      category: def.category,
      label: def.farmerLabel,
      rank: index + 1,
      why: def.farmerWhy,
      increasesIf: def.increasesIf,
      decreasesIf: def.decreasesIf,
      evidenceSource: source,
      evidenceFact: fact,
    };
  });
}

export function conservativeFallbackText(obs: PipelineObservations): string {
  if (obs.curlReported || obs.yellowingReported) return CONSERVATIVE_CURL_YELLOW_FALLBACK;
  return CONSERVATIVE_GENERIC_FALLBACK;
}

export function runFarmerCausePipeline(options: {
  facts: KnownFarmerFacts;
  evidence: ObservedEvidence;
  previousState?: CropHealthCaseState | null;
  hasPhotos?: boolean;
  payload?: AgronomicCasePayload;
  modelJson?: unknown;
}): FarmerPipelineResult {
  const observations = extractPipelineObservations({
    facts: options.facts,
    evidence: options.evidence,
    previousState: options.previousState,
    hasPhotos: options.hasPhotos,
  });
  const allowed = allowedCauseIds(observations);
  const admitted = admitCauseIds(observations, allowed);
  const reasoning = parseStructuredReasoning(options.modelJson);
  const modelIds = [
    ...(reasoning?.admittedCauseIds ?? []),
    ...collectModelCauseTokens(options.payload ?? ({} as AgronomicCasePayload), reasoning),
  ];
  const discarded: string[] = [];
  const rawModelCauseIds: string[] = [];
  for (const token of modelIds) {
    const id = isCauseId(token) ? token : causeIdFromLabel(token);
    if (id) rawModelCauseIds.push(id);
    else rawModelCauseIds.push(token);
    if (!id || !allowed.includes(id)) {
      discarded.push(token);
    }
  }

  return {
    observations,
    allowedCauseIds: allowed,
    admittedCauseIds: admitted,
    discardedCauseIds: discarded,
    rawModelCauseIds: [...new Set(rawModelCauseIds)],
    admitted: gatedFromIds(admitted.slice(0, 3), observations),
    usedConservativeFallback: false,
    validationFailed: false,
  };
}

function curlYellowCase(obs: PipelineObservations): boolean {
  return obs.cropKey === "pepper" && obs.curlReported;
}

function serverAssessment(options: {
  obs: PipelineObservations;
  admitted: GatedCause[];
  reasoning: StructuredReasoning | null;
  fallback: boolean;
}): string {
  if (options.fallback || options.admitted.length === 0) {
    return conservativeFallbackText(options.obs);
  }
  const photoLine = options.obs.photoAttached
    ? photoEvidenceNarrative({
        findings: options.obs.photoFindings,
        admitted: options.admitted,
        lesionEvidence: options.obs.lesionEvidence,
      })
    : null;
  const parts: string[] = [];
  if (photoLine) parts.push(photoLine);
  if (curlYellowCase(options.obs) && !options.obs.lesionEvidence) {
    parts.push(CONSERVATIVE_CURL_YELLOW_FALLBACK);
  }
  for (const cause of options.admitted) {
    const fromModel = options.reasoning?.reasoningPerCause.find(
      (item) =>
        item.causeId === (cause as GatedCause & { id?: CauseId }).id ||
        causeIdFromLabel(item.causeId) === (cause as GatedCause & { id?: string }).id,
    );
    const why =
      fromModel?.why &&
      !mentionsUnallowedCause(fromModel.why, options.admitted.map((item) => (item as GatedCause & { id?: CauseId }).id).filter((id): id is CauseId => Boolean(id)))
        ? fromModel.why
        : cause.why;
    if (why && !parts.includes(why)) parts.push(why);
  }
  const text = parts.join(" ").replace(/\s+/g, " ").trim();
  return text || conservativeFallbackText(options.obs);
}

function uniqueLines(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

export function renderFarmerPayloadFromPipeline(
  payload: AgronomicCasePayload,
  pipeline: FarmerPipelineResult,
  options: {
    facts: KnownFarmerFacts;
    modelJson?: unknown;
  },
): AgronomicCasePayload {
  const reasoning = parseStructuredReasoning(options.modelJson);
  const allowed = pipeline.allowedCauseIds;
  const validationFailed = Boolean(options.modelJson) && reasoning === null;
  // Model JSON may fail validation; still keep server-admitted IDs. Never revive a
  // disease template. Only the unnamed conservative copy is used when nothing is admitted.
  const fallback = pipeline.admittedCauseIds.length === 0;
  const admitted = fallback ? [] : pipeline.admitted;
  const catalogAssessment = serverAssessment({
    obs: pipeline.observations,
    admitted,
    reasoning,
    fallback,
  });

  const catalogChecks = uniqueLines(admitted.flatMap((cause) => {
    const id = causeIdFromLabel(cause.label);
    return id ? CAUSE_CATALOG[id].checks : [];
  }));
  const catalogActions = uniqueLines(admitted.flatMap((cause) => {
    const id = causeIdFromLabel(cause.label);
    return id ? CAUSE_CATALOG[id].actions : [];
  }));
  const catalogAvoid = uniqueLines(admitted.flatMap((cause) => {
    const id = causeIdFromLabel(cause.label);
    return id ? CAUSE_CATALOG[id].avoid : [];
  }));

  const incomingAssessment = payload.preliminaryAssessment?.trim() ?? "";
  const incomingWhy = payload.diagnosisWhy?.trim() ?? "";
  const incomingUsable =
    incomingAssessment.length >= 40 &&
    !mentionsUnallowedCause(incomingAssessment, allowed) &&
    !/^(farmer reported a crop problem|working assessment for the farmer)\.?$/i.test(
      incomingAssessment,
    );

  const payloadChecks = cleanModelLines(payload.checksToday, allowed);
  const payloadActions = cleanModelLines(payload.safeActionsNow, allowed);
  const payloadAvoid = cleanModelLines(payload.actionsToAvoid, allowed);
  const modelChecks = cleanModelLines(reasoning?.checks ?? [], allowed);
  const modelActions = cleanModelLines(reasoning?.immediateActions ?? [], allowed);
  const modelQuestion =
    reasoning?.nextQuestion && !mentionsUnallowedCause(reasoning.nextQuestion, allowed)
      ? reasoning.nextQuestion.trim()
      : "";
  const payloadQuestion =
    payload.nextQuestion.trim() && !mentionsUnallowedCause(payload.nextQuestion, allowed)
      ? payload.nextQuestion.trim()
      : "";

  let checks =
    payloadChecks.length > 0 ? payloadChecks : modelChecks.length > 0 ? modelChecks : catalogChecks;
  let actions =
    payloadActions.length > 0 ? payloadActions : modelActions.length > 0 ? modelActions : catalogActions;
  let avoid = payloadAvoid.length > 0 ? payloadAvoid : catalogAvoid;
  let nextQuestion = modelQuestion || payloadQuestion;

  const usedFallback = fallback || admitted.length === 0;
  let assessment = usedFallback
    ? incomingUsable
      ? incomingAssessment
      : catalogAssessment
    : incomingUsable
      ? incomingAssessment
      : catalogAssessment;
  if (
    pipeline.observations.crop &&
    !curlYellowCase(pipeline.observations) &&
    !incomingUsable &&
    !new RegExp(`\\b${pipeline.observations.crop}\\b`, "i").test(assessment)
  ) {
    const crop = pipeline.observations.crop;
    assessment = `On ${crop}, ${assessment.charAt(0).toLowerCase()}${assessment.slice(1)}`;
  }

  if (curlYellowCase(pipeline.observations) && !pipeline.observations.lesionEvidence) {
    if (checks.length === 0 || checks.some((item) => mentionsUnallowedCause(item, allowed))) {
      checks = [...CURL_YELLOW_CHECKS];
    }
    if (actions.length === 0 || actions.some((item) => mentionsUnallowedCause(item, allowed))) {
      actions = [...CURL_YELLOW_ACTIONS];
    }
    avoid = [...CURL_YELLOW_AVOID];
    if (!nextQuestion || mentionsUnallowedCause(nextQuestion, allowed) || (nextQuestion.match(/\?/g) ?? []).length !== 1) {
      nextQuestion = UNDERSIDE_INSECT_QUESTION;
    }
    if (!actions.some((item) => /fertilizer/i.test(item))) {
      actions = uniqueLines([...actions, HOLD_FERTILIZER]);
    }
    if (!incomingUsable && !assessment.includes(CONSERVATIVE_CURL_YELLOW_FALLBACK)) {
      assessment = catalogAssessment;
    }
  }

  if (
    admitted.some((cause) => causeIdFromLabel(cause.label) === "WHITEFLY") &&
    !pipeline.observations.photoAttached &&
    (!nextQuestion ||
      ((nextQuestion.match(/\?/g) ?? []).length !== 1 && !/[?]/.test(nextQuestion)) ||
      (/affected leaf/i.test(nextQuestion) && !/underside/i.test(nextQuestion)))
  ) {
    nextQuestion = WHITEFLY_UNDERSIDE_PHOTO;
  }

  if (!nextQuestion) {
    const first = admitted[0];
    const id = first ? causeIdFromLabel(first.label) : null;
    nextQuestion = id ? CAUSE_CATALOG[id].nextQuestion : payloadQuestion;
    if (curlYellowCase(pipeline.observations) && !nextQuestion) {
      nextQuestion = UNDERSIDE_INSECT_QUESTION;
    }
  }

  if ((nextQuestion.match(/\?/g) ?? []).length > 1) {
    nextQuestion = curlYellowCase(pipeline.observations)
      ? UNDERSIDE_INSECT_QUESTION
      : nextQuestion.split("?")[0] + "?";
  }

  const sprayAllowed =
    Boolean(options.facts.asksForProducts) &&
    admitted.some((cause) => {
      const id = causeIdFromLabel(cause.label);
      if (!id) return false;
      const def = CAUSE_CATALOG[id];
      return (
        def.requiresLesionEvidence ||
        id === "WHITEFLY" ||
        ((id === "APHIDS" || id === "MITES" || id === "THRIPS") && pipeline.observations.insectsReported)
      );
    });

  const playbookLabels = (payload.likelyCauses ?? []).filter((label) => {
    const id = causeIdFromLabel(label);
    if (id) return allowed.includes(id);
    return !mentionsUnallowedCause(label, allowed);
  });
  const likelyCauses =
    playbookLabels.length > 0 ? playbookLabels : admitted.map((cause) => cause.label);

  const whatWouldChange = uniqueLines(
    (payload.whatWouldChangeDiagnosis ?? []).filter((item) => !mentionsUnallowedCause(item, allowed))
      .length > 0
      ? (payload.whatWouldChangeDiagnosis ?? []).filter((item) => !mentionsUnallowedCause(item, allowed))
      : admitted.map((cause) => cause.increasesIf),
  );
  const monitor = curlYellowCase(pipeline.observations)
    ? "Watch whether new growth stays curled and whether more plants join in over 2–3 days."
    : payload.monitorNext && !mentionsUnallowedCause(payload.monitorNext, allowed)
      ? payload.monitorNext
    : admitted.length > 0
      ? "Watch whether new growth stays clean over the next 2–3 days."
      : null;

  if (usedFallback && curlYellowCase(pipeline.observations) && !incomingUsable) {
    checks = [...CURL_YELLOW_CHECKS];
    actions = [...CURL_YELLOW_ACTIONS];
    avoid = [...CURL_YELLOW_AVOID];
    nextQuestion = UNDERSIDE_INSECT_QUESTION;
    assessment = catalogAssessment;
  }

  pipeline.usedConservativeFallback = usedFallback && !incomingUsable;
  pipeline.validationFailed = validationFailed;

  const weatherBrief =
    payload.weatherBrief && !mentionsUnallowedCause(payload.weatherBrief, allowed)
      ? payload.weatherBrief
      : pipeline.observations.lesionEvidence
        ? payload.weatherBrief
        : payload.weatherBrief && /\b(cercospora|leaf[- ]spot|fungal|bacterial)\b/i.test(payload.weatherBrief)
          ? null
          : payload.weatherBrief;

  const diagnosisWhy =
    incomingWhy && !mentionsUnallowedCause(incomingWhy, allowed) ? incomingWhy : assessment;

  return {
    ...payload,
    preliminaryAssessment: assessment,
    diagnosisWhy,
    checksToday: checks,
    safeActionsNow: actions,
    actionsToAvoid: avoid,
    nextQuestion,
    photoRecommended: reasoning?.photoRequest === true || payload.photoRecommended || curlYellowCase(pipeline.observations),
    admittedCauses: admitted,
    likelyCauses,
    rankedCauses: admitted.length > 0 ? admitted : payload.rankedCauses?.filter((cause) => {
      const id = causeIdFromLabel(cause.label);
      return id ? allowed.includes(id) : !mentionsUnallowedCause(cause.label, allowed);
    }),
    rawModelCauses: pipeline.admitted.map((cause) => cause.label),
    whatWouldChangeDiagnosis: whatWouldChange,
    monitorNext: monitor,
    sprayGuidanceText: sprayAllowed ? payload.sprayGuidanceText : null,
    verifiedInputOptions: sprayAllowed ? payload.verifiedInputOptions : [],
    weatherBrief,
    weatherRisks: (payload.weatherRisks ?? []).filter(
      (risk) =>
        pipeline.observations.lesionEvidence ||
        !/\b(cercospora|frogeye|leaf[- ]spot|bacterial spot)\b/i.test(risk.diseaseOrPest),
    ),
    allowedCauseIds: pipeline.allowedCauseIds,
    admittedCauseIds: pipeline.admittedCauseIds,
  };
}

export function pipelineDebug(
  pipeline: FarmerPipelineResult,
  extras?: Partial<CauseRankingDebug>,
): CauseRankingDebug {
  return {
    stage: extras?.stage ?? "final",
    extractedSymptoms: pipeline.observations.symptoms,
    rawModelCauses: extras?.rawModelCauses ?? pipeline.rawModelCauseIds,
    playbookSelectedCauses: extras?.playbookSelectedCauses ?? [],
    preGateRankedCauses: extras?.preGateRankedCauses ?? pipeline.allowedCauseIds,
    admittedCauses: pipeline.admitted.map((cause) => cause.label),
    sprayIntent: extras?.sprayIntent,
    pesticideTarget: extras?.pesticideTarget,
    finalVisibleCauses: pipeline.admitted.map((cause) => cause.label),
    lesionEvidence: pipeline.observations.lesionEvidence,
    observedSymptoms: pipeline.observations.symptoms,
    photoFindings: pipeline.observations.photoFindings,
    causes: [
      ...pipeline.admitted.map((cause) => ({
        label: cause.label,
        source: cause.evidenceSource,
        fact: cause.evidenceFact,
        admitted: true,
      })),
      ...pipeline.discardedCauseIds.map((label) => ({
        label,
        source: "farmer_report" as const,
        fact: "discarded: not on the server allowlist",
        admitted: false,
      })),
    ],
    rejected: pipeline.discardedCauseIds.map((label) => ({
      label,
      reason: "not_on_allowlist",
    })),
    observations: pipeline.observations,
    allowedCauseIds: pipeline.allowedCauseIds,
    admittedCauseIds: pipeline.admittedCauseIds,
    discardedCauseIds: pipeline.discardedCauseIds,
    pipeline: "structured_allowlist",
  };
}

export function structuredReasoningInstructions(options: {
  allowedCauseIds: CauseId[];
  admittedCauseIds: CauseId[];
  observations: PipelineObservations;
}): string {
  const allowed = options.allowedCauseIds.join(", ") || "(none)";
  const admitted = options.admittedCauseIds.join(", ") || "(none)";
  const forbidden = options.allowedCauseIds.includes("CERCOSPORA")
    ? ""
    : "Do not name Cercospora, bacterial leaf spot, fungal leaf spot, pale-centred spots, greasy or water-soaked lesions, mancozeb, chlorothalonil, or copper sprays.";
  return `STRUCTURED CROP-HEALTH PIPELINE (server-owned diagnoses):
The server already extracted observations and decided which causes may exist.
You are an explanation assistant, not the authority that invents diagnosis names.

Server observations:
- crop: ${options.observations.crop ?? "unknown"}
- symptoms: ${options.observations.symptoms.join(", ") || "none named"}
- lesionEvidence: ${options.observations.lesionEvidence}
- insectsReported: ${options.observations.insectsReported}
- mosaicReported: ${options.observations.mosaicReported}
- wetOrDrainageEvidence: ${options.observations.wetOrDrainageEvidence}

Allowed cause IDs (you may only use these): ${allowed}
Admitted cause IDs to explain: ${admitted}

Return JSON with observations, admittedCauseIds, reasoningPerCause, checks, immediateActions, nextQuestion, photoRequest.
admittedCauseIds must be a subset of the allowed list. Any other ID will be discarded.
reasoningPerCause.why may only explain an admitted ID. Do not write a farmer essay and do not invent other diseases.
${forbidden}
Do not write "IF A SPRAY IS NEEDED".
Ask exactly one nextQuestion.`;
}

export function shouldUseStructuredCausePipeline(options: {
  intent?: string | null;
  facts: KnownFarmerFacts;
  evidence: ObservedEvidence;
}): boolean {
  const intent = options.intent ?? "";
  if (intent === "market" || options.facts.asksForMarket) return false;
  if (intent === "calculation") return false;
  if (
    options.facts.asksForPesticideRegistration &&
    options.evidence.symptoms.length === 0 &&
    !options.evidence.observedPest
  ) {
    return false;
  }
  const diagnostic =
    intent === "crop_problem" ||
    intent === "pest_disease" ||
    intent === "nutrition" ||
    intent === "irrigation" ||
    intent === "soil";
  if (!diagnostic) return false;
  return Boolean(
    options.facts.crop ||
      options.facts.suspectedIssue ||
      options.evidence.symptoms.length > 0,
  );
}

export function emptyEvidenceForFacts(facts: KnownFarmerFacts): ObservedEvidence {
  return extractObservedEvidence({ facts, text: facts.rawText });
}

export function applyAdmittedCauseContractFromPipeline(
  payload: AgronomicCasePayload,
  options: {
    admitted: GatedCause[];
    rawModelCauses: string[];
    evidence: ObservedEvidence;
    facts: KnownFarmerFacts;
    hasPhotos?: boolean;
    previousState?: CropHealthCaseState | null;
    modelJson?: unknown;
  },
): AgronomicCasePayload {
  const pipeline = runFarmerCausePipeline({
    facts: options.facts,
    evidence: options.evidence,
    previousState: options.previousState,
    hasPhotos: options.hasPhotos,
    payload: {
      ...payload,
      rawModelCauses: options.rawModelCauses,
    },
    modelJson: options.modelJson ?? payload,
  });
  if (
    options.facts.asksForPesticideRegistration &&
    options.evidence.symptoms.length === 0 &&
    !options.evidence.observedPest
  ) {
    return {
      ...payload,
      allowedCauseIds: pipeline.allowedCauseIds,
      admittedCauseIds: pipeline.admittedCauseIds,
    };
  }
  const rendered = renderFarmerPayloadFromPipeline(payload, pipeline, {
    facts: options.facts,
    modelJson: options.modelJson ?? payload,
  });
  return rendered;
}

setAdmittedCauseContractImpl(applyAdmittedCauseContractFromPipeline);

export { OLD_VS_NEW_YELLOW_QUESTION };
