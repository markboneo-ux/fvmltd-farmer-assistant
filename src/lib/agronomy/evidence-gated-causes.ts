/**
 * Evidence-gated crop-health causes.
 * A lesion-specific disease cannot enter case state without lesion evidence.
 */

import type { RankedCause } from "./causes";
import type { AgronomicCasePayload } from "./case-schema";
import type { CropHealthCaseState, SuspectedCauseEntry } from "./crop-health-state";
import type { ObservedEvidence } from "./evidence-hierarchy";
import type { KnownFarmerFacts } from "./tomato-protocol";

export const CAUSE_EVIDENCE_SOURCES = [
  "farmer_report",
  "photo_finding",
  "weather_support",
  "prior_confirmed_case_fact",
] as const;

export type CauseEvidenceSource = (typeof CAUSE_EVIDENCE_SOURCES)[number];

export type GatedCause = RankedCause & {
  evidenceSource: CauseEvidenceSource;
  evidenceFact: string;
};

export type CauseAdmission = {
  label: string;
  source: CauseEvidenceSource;
  fact: string;
  admitted: boolean;
};

export type CauseRankingDebug = {
  stage?: "prompt" | "final";
  lesionEvidence: boolean;
  observedSymptoms: string[];
  photoFindings: string[];
  causes: CauseAdmission[];
  rejected: Array<{ label: string; reason: string }>;
  rawModelCauses: string[];
  admittedCauses: string[];
};

export const HOLD_FERTILIZER =
  "Do not add extra fertilizer yet until we know whether older or newer leaves are affected.";

export const UNDERSIDE_INSECT_QUESTION =
  "Can you check the underside of the curled new leaves for tiny insects or mites?";

export const OLD_VS_NEW_YELLOW_QUESTION =
  "Is the yellowing mainly on the newest curled leaves or the older lower leaves?";

const LESION_DISEASE =
  /\b(cercospora|frogeye|bacterial leaf spot|bacterial spot|septoria|early blight|late blight|anthracnose|sigatoka|fungal leaf spot|leaf[- ]spot)\b/i;

const LESION_POSITIVE =
  /\b(spots?|lesions?|leaf[- ]spot|pale[- ]centr|water-?soaked specks?|greasy specks?)\b/i;

const LESION_UNCERTAIN =
  /\bcannot determine whether lesions\b|\blesions?, insects, or a nutrient pattern\b|\blesions cannot be determined\b|\bnot (a )?reliable close view\b/i;

const LESION_DENIED =
  /\bno (discrete )?(leaf[- ]?)?(spots?|lesions?)\b|\b(spots?|lesions?) (are )?(not |not yet )visible\b|\bnot visible\b.{0,20}\b(spots?|lesions?)\b/i;

export const FORBIDDEN_UNGATED_LESION =
  /\b(cercospora|frogeye|bacterial leaf spot|fungal leaf spot|bacterial spot|pale[- ]centr(?:ed|e)?|water-?soaked|greasy specks?|mancozeb|chlorothalonil)\b/i;

const COPPER_SPRAY_CLASS =
  /\bcopper(?:-based)? (?:spray|protectants?|bactericides?|classes?)\b|\bcopper spray classes\b/i;

const DESTRUCTION_COPY =
  /\b(remove whole plants|destroy (the )?(plants?|crop)|pull (up|out) (the )?(plants?|crop)|plant removal|rogue(?:ing)? (out )?(affected )?plants|do not remove whole plants)\b/i;

const CONFIRMED_LESION_DISEASE =
  /\b(diagnosed|confirmed|lab(?:oratory)? (?:said|confirmed|result)|spray for)\b.{0,40}\b(cercospora|frogeye|septoria|bacterial (?:leaf )?spot|fungal leaf spot)\b/i;

const HYPOTHETICAL_FINDING = /\bif they are (actually )?visible\b/i;

export function isLesionSpecificDisease(label: string): boolean {
  return LESION_DISEASE.test(label);
}

export function sanitizePhotoFindings(raw: string[] | null | undefined): string[] {
  const unique: string[] = [];
  for (const item of raw ?? []) {
    const trimmed = item.trim();
    if (!trimmed || trimmed === "photo_attached") continue;
    if (HYPOTHETICAL_FINDING.test(trimmed)) continue;
    if (isLesionSpecificDisease(trimmed) && !/\bvisible\b/i.test(trimmed)) continue;
    if (unique.some((existing) => existing.toLowerCase() === trimmed.toLowerCase())) continue;
    unique.push(trimmed);
  }
  return unique;
}

export function photoShowsLesions(findings: string[]): boolean {
  const blob = findings.join(" ").toLowerCase();
  if (!blob.trim()) return false;
  if (LESION_DENIED.test(blob)) return false;
  return (
    /\b(discrete )?(spots?|lesions?) (are )?visible\b/.test(blob) ||
    /\bvisible (discrete )?(spots?|lesions?)\b/.test(blob) ||
    /\bpale[- ]centr/.test(blob) ||
    /\bwater-?soaked specks?\b/.test(blob)
  );
}

export function photoShowsInsects(findings: string[]): boolean {
  const blob = findings.join(" ").toLowerCase();
  if (/\bno insects?\b|\binsects? (are )?(not |not yet )?visible\b/.test(blob)) return false;
  return /\b(insects?|mites?|aphids?|whitefl|cast skins?|sticky residue) (are )?visible\b/.test(blob);
}

export function findingClaimsLesions(item: string): boolean {
  return LESION_POSITIVE.test(item) && !LESION_DENIED.test(item);
}

export function trustedPhotoFindings(options: {
  raw?: string[] | null;
  farmerReportedLesions: boolean;
}): string[] {
  const cleaned = sanitizePhotoFindings(options.raw);
  if (options.farmerReportedLesions) return cleaned;
  return cleaned.filter((item) => !findingClaimsLesions(item) || LESION_DENIED.test(item));
}

export function farmerReportedLesions(text: string): boolean {
  const lower = text.toLowerCase();
  if (!lower.trim()) return false;
  if (LESION_UNCERTAIN.test(lower) && !/\b(spots?|lesions?) (are )?visible\b/.test(lower)) {
    return false;
  }
  if (LESION_DENIED.test(lower)) return false;
  if (HYPOTHETICAL_FINDING.test(lower) && !/\b(spots?|lesions?) (are )?visible\b/.test(lower)) {
    return false;
  }
  if (CONFIRMED_LESION_DISEASE.test(lower)) return true;
  const withoutDiseaseNames = lower.replace(
    /\b(cercospora|frogeye|bacterial leaf spot|bacterial spot|septoria|early blight|late blight|anthracnose|sigatoka|fungal leaf spot|leaf[- ]spot)\b/gi,
    " ",
  );
  return /\b(spots?|lesions?|pale[- ]centr|water-?soaked specks?|greasy specks?)\b/.test(
    withoutDiseaseNames,
  );
}

export function photoFindingsAreUncertain(
  findings: string[] | null | undefined,
  hasPhotos?: boolean,
): boolean {
  if (!hasPhotos) return false;
  const cleaned = sanitizePhotoFindings(findings);
  if (cleaned.length === 0) return true;
  const blob = cleaned.join(" ").toLowerCase();
  if (photoShowsLesions(cleaned)) return false;
  return LESION_UNCERTAIN.test(blob);
}

export function hasLesionEvidence(options: {
  evidence: ObservedEvidence;
  facts?: KnownFarmerFacts | null;
  state?: CropHealthCaseState | null;
  photoFindings?: string[];
  hasPhotos?: boolean;
}): boolean {
  const findings = sanitizePhotoFindings([
    ...(options.photoFindings ?? []),
    ...(options.state?.photoFindings ?? []),
    ...options.evidence.photoEvidence,
  ]);
  const farmerBlob = [options.facts?.rawText ?? "", options.facts?.suspectedIssue ?? ""]
    .join(" ")
    .toLowerCase();
  const farmerLesions = farmerReportedLesions(farmerBlob);
  const photoUncertain = photoFindingsAreUncertain(
    findings,
    options.hasPhotos || Boolean(options.evidence.photoEvidence.length),
  );
  if (photoUncertain && !farmerLesions) return false;
  if (photoShowsLesions(findings)) return true;
  if (farmerLesions) return true;
  if (
    !options.facts &&
    options.evidence.symptoms.includes("spots") &&
    !LESION_DENIED.test(findings.join(" ")) &&
    !LESION_UNCERTAIN.test(findings.join(" "))
  ) {
    return true;
  }
  if (options.state?.confirmedDiagnosis && isLesionSpecificDisease(options.state.confirmedDiagnosis)) {
    return true;
  }
  return false;
}

function sourceForCause(
  label: string,
  options: {
    evidence: ObservedEvidence;
    facts?: KnownFarmerFacts | null;
    findings: string[];
  },
): { source: CauseEvidenceSource; fact: string } | null {
  const lower = label.toLowerCase();
  const farmer = (options.facts?.rawText ?? "").toLowerCase();
  const findingsBlob = options.findings.join("; ");

  if (/\b(aphids?|sucking insects?|mites?|whitefl(?:y|ies)?)\b/.test(lower)) {
    if (photoShowsInsects(options.findings)) {
      return { source: "photo_finding", fact: findingsBlob };
    }
    if (options.evidence.observedPest || /\b(aphids?|whitefl(?:y|ies)?|mites?|insects?)\b/.test(farmer)) {
      return { source: "farmer_report", fact: "farmer reported the pest" };
    }
    if (/\bcurl/.test(farmer) || options.evidence.symptoms.includes("leaf curl")) {
      return { source: "farmer_report", fact: "leaf curling can start with sucking insects under new leaves" };
    }
    return null;
  }

  if (/\bvirus\b/.test(lower)) {
    if (/\b(mosaic|mottle|stunt)\b/.test(findingsBlob) || /\b(mosaic|mottle|stunt)\b/.test(farmer)) {
      return {
        source: /\b(mosaic|mottle)\b/.test(findingsBlob) ? "photo_finding" : "farmer_report",
        fact: "new-growth distortion or mosaic pattern",
      };
    }
    if (options.evidence.observedPest === "whiteflies" || /\bwhitefl/.test(farmer)) {
      return { source: "farmer_report", fact: "whiteflies can spread viruses; virus is a follow-on risk" };
    }
    return null;
  }

  if (/\b(nutrient|feeding|fertilizer|nitrogen|potassium|calcium|\bec\b)\b/.test(lower)) {
    if (/\b(old|older|lower) leaves\b/.test(farmer) || /\bolder leaves\b/.test(findingsBlob)) {
      return { source: "farmer_report", fact: "yellowing worse on older leaves" };
    }
    if (
      options.evidence.symptoms.includes("yellowing") ||
      options.evidence.symptoms.includes("leaf burn") ||
      /\b(yellow|burn(?:ing|t)?|scorch|tip)\b/.test(farmer)
    ) {
      return {
        source: "farmer_report",
        fact: options.evidence.symptoms.includes("leaf burn")
          ? "leaf burn or tip scorch is present; fertilizer injury is a hypothesis, not a diagnosis"
          : "yellowing is present; old-versus-new pattern is not yet known",
      };
    }
    return null;
  }

  const primarilyWaterlog =
    /\b(waterlog(?:ging)?|drain(?:age)?|wet soil|puddle|flood)\b/.test(lower) &&
    !/\b(root-zone|uneven watering|salt|watering or roots)\b/.test(lower);
  if (primarilyWaterlog) {
    if (options.evidence.wetFromFarmer || options.evidence.weatherSignals.includes("prolonged_wetness")) {
      return {
        source: options.evidence.wetFromFarmer ? "farmer_report" : "weather_support",
        fact: options.evidence.wetFromFarmer
          ? "farmer reported wet or poorly drained conditions"
          : "retrieved weather indicates prolonged wetness",
      };
    }
    return null;
  }

  if (/\b(root-zone|roots? (?:under )?stress|watering|salt buildup|high ec)\b/.test(lower)) {
    if (options.evidence.wetFromFarmer || options.evidence.weatherSignals.includes("prolonged_wetness")) {
      return {
        source: options.evidence.wetFromFarmer ? "farmer_report" : "weather_support",
        fact: "wet or poorly drained conditions support a root-zone hypothesis",
      };
    }
    if (
      options.evidence.symptoms.includes("leaf burn") ||
      options.evidence.symptoms.includes("yellowing") ||
      options.evidence.symptoms.includes("wilt") ||
      /\b(burn(?:ing|t)?|yellow|wilt|scorch)\b/.test(farmer)
    ) {
      return {
        source: "farmer_report",
        fact: "described leaf burn, yellowing, or wilt can start in the root zone",
      };
    }
    return null;
  }

  if (/\b(herbicide|spray injury|phytotoxic(?:ity)?|xenobiotic)\b/.test(lower)) {
    if (options.facts?.recentPesticide || /\b(spray|herbicide|roundup|foliar feed)\b/.test(farmer)) {
      return { source: "farmer_report", fact: "recent spray or herbicide was mentioned" };
    }
    if (options.evidence.symptoms.includes("leaf burn") || /\b(burn(?:ing|t)?|scorch|necrosis)\b/.test(farmer)) {
      return {
        source: "farmer_report",
        fact: "leaf burn can follow spray or foliar feed injury; no recent application has been confirmed yet",
      };
    }
    return null;
  }

  if (/\b(wilt|root or stem|stem-base rot|root rot)\b/.test(lower)) {
    if (options.evidence.symptoms.includes("wilt") || /\bwilt/.test(farmer)) {
      return { source: "farmer_report", fact: "farmer reported wilting" };
    }
    return null;
  }

  if (isLesionSpecificDisease(label)) {
    if (photoShowsLesions(options.findings)) {
      return { source: "photo_finding", fact: findingsBlob };
    }
    if (hasLesionEvidence({ evidence: options.evidence, facts: options.facts, photoFindings: options.findings })) {
      return { source: "farmer_report", fact: "farmer reported spots or lesions" };
    }
    return null;
  }

  if (
    options.evidence.observedPest &&
    (lower.includes(options.evidence.observedPest) || /\b(insect|pest|whitefl|aphid)\b/.test(lower))
  ) {
    return { source: "farmer_report", fact: `observed pest: ${options.evidence.observedPestLabel}` };
  }

  if (options.evidence.symptoms.length > 0 || options.facts?.suspectedIssue) {
    return {
      source: "farmer_report",
      fact: options.facts?.suspectedIssue || options.evidence.symptoms.join(", ") || "described symptoms",
    };
  }

  return null;
}

const CURL_YELLOW_HYPOTHESES: RankedCause[] = [
  {
    category: "insects",
    label: "Aphids or other sucking insects",
    rank: 1,
    why: "Curling of new pepper leaves can start with sucking insects. That is a hypothesis until the undersides are checked.",
    increasesIf: "Tiny insects, mites, cast skins, or sticky residue under curled new leaves.",
    decreasesIf: "Undersides of several curled leaves are clean.",
  },
  {
    category: "nutrition",
    label: "Nutrient shortage or uneven feeding",
    rank: 2,
    why: "Yellowing may be nutrition if older leaves are worse. Do not add extra fertilizer until that pattern is known.",
    increasesIf: "Yellowing is mainly on older lower leaves and new growth is otherwise normal.",
    decreasesIf: "Only the newest curled leaves are yellow or mottled.",
  },
];

export function admitEvidenceGatedCauses(options: {
  incoming?: Array<string | RankedCause>;
  evidence: ObservedEvidence;
  facts?: KnownFarmerFacts | null;
  state?: CropHealthCaseState | null;
  crop?: string | null;
}): { admitted: GatedCause[]; rejected: Array<{ label: string; reason: string }>; debug: CauseRankingDebug } {
  const findings = sanitizePhotoFindings([
    ...(options.state?.photoFindings ?? []),
    ...options.evidence.photoEvidence,
  ]);
  const lesion =
    hasLesionEvidence({
      evidence: options.evidence,
      facts: options.facts,
      state: options.state,
      photoFindings: findings,
      hasPhotos: findings.length > 0 || options.evidence.photoEvidence.length > 0,
    }) && !photoFindingsAreUncertain(findings, options.evidence.photoEvidence.length > 0);
  const rejected: Array<{ label: string; reason: string }> = [];
  const incoming = options.incoming ?? [];
  const labels = incoming.map((item) => (typeof item === "string" ? item : item.label));
  const rankedIncoming = incoming.filter((item): item is RankedCause => typeof item !== "string");

  const considered: RankedCause[] = rankedIncoming.length
    ? rankedIncoming
    : labels.map((label, index) => ({
        category: "environmental stress" as const,
        label,
        rank: index + 1,
        why: "",
        increasesIf: "",
        decreasesIf: "",
      }));

  const crop = (options.crop ?? options.facts?.crop ?? "").toLowerCase();
  const curlYellow =
    crop.includes("pepper") &&
    (options.evidence.symptoms.includes("leaf curl") || /\bcurl/.test(options.facts?.rawText ?? "")) &&
    !lesion;

  const pool: RankedCause[] = considered.length > 0 ? considered : curlYellow ? CURL_YELLOW_HYPOTHESES : [];
  if (curlYellow) {
    for (const hypothesis of CURL_YELLOW_HYPOTHESES) {
      const existing = pool.find((item) => item.label === hypothesis.label);
      if (!existing) pool.push(hypothesis);
      else if (!existing.why) {
        existing.why = hypothesis.why;
        existing.increasesIf = existing.increasesIf || hypothesis.increasesIf;
        existing.decreasesIf = existing.decreasesIf || hypothesis.decreasesIf;
        existing.category = hypothesis.category;
      }
    }
  }

  const admitted: GatedCause[] = [];
  const admissions: CauseAdmission[] = [];

  for (const cause of pool) {
    if (isLesionSpecificDisease(cause.label) && !lesion) {
      rejected.push({
        label: cause.label,
        reason: "no_lesion_evidence",
      });
      admissions.push({
        label: cause.label,
        source: "farmer_report",
        fact: "rejected: no spots or lesions reported or visible",
        admitted: false,
      });
      continue;
    }
    const sourced = sourceForCause(cause.label, {
      evidence: options.evidence,
      facts: options.facts,
      findings,
    });
    if (!sourced) {
      rejected.push({ label: cause.label, reason: "no_supporting_evidence" });
      admissions.push({
        label: cause.label,
        source: "farmer_report",
        fact: "rejected: no supporting evidence",
        admitted: false,
      });
      continue;
    }
    admitted.push({
      ...cause,
      rank: admitted.length + 1,
      evidenceSource: sourced.source,
      evidenceFact: sourced.fact,
    });
    admissions.push({
      label: cause.label,
      source: sourced.source,
      fact: sourced.fact,
      admitted: true,
    });
  }

  const unique: GatedCause[] = [];
  for (const cause of admitted) {
    if (unique.some((item) => item.label === cause.label)) continue;
    unique.push({ ...cause, rank: unique.length + 1 });
  }

  const debug: CauseRankingDebug = {
    lesionEvidence: lesion,
    observedSymptoms: options.evidence.symptoms,
    photoFindings: findings,
    causes: admissions,
    rejected,
    rawModelCauses: labels,
    admittedCauses: unique.slice(0, 3).map((cause) => cause.label),
  };

  return { admitted: unique.slice(0, 3), rejected, debug };
}

export function gatedCausesToEntries(causes: GatedCause[]): SuspectedCauseEntry[] {
  return causes.map((cause) => ({
    label: cause.label,
    category: cause.category,
    evidenceFor: [`${cause.evidenceSource}: ${cause.evidenceFact}`],
    evidenceAgainst: cause.decreasesIf ? [cause.decreasesIf] : [],
    rank: cause.rank,
    evidenceSource: cause.evidenceSource,
    evidenceFact: cause.evidenceFact,
  }));
}

export function logCauseDebug(debug: CauseRankingDebug, stage?: CauseRankingDebug["stage"]) {
  const payload = stage ? { ...debug, stage } : debug;
  console.info("[fvm-cause-debug]", JSON.stringify(payload));
}

export function photoEvidenceNarrative(options: {
  findings: string[];
  admitted: GatedCause[];
  lesionEvidence: boolean;
}): string {
  const findings = sanitizePhotoFindings(options.findings);
  if (findings.length === 0) {
    return "The photo does not give a reliable close view. I cannot determine whether lesions, insects, or a nutrient pattern are present.";
  }
  const shown = findings.slice(0, 3).join("; ");
  const supported = options.admitted[0];
  const supportLine = supported
    ? `Visible ${shown} is consistent with ${supported.label} as a possibility because ${supported.evidenceFact}. It does not prove that cause.`
    : `The photo shows: ${shown}. That is not enough to name a cause.`;
  const lesionLine = options.lesionEvidence
    ? "Discrete lesions are visible, so a leaf-spot disease stays on the list."
    : "I do not see discrete lesions in this photo, so a leaf-spot disease is not supported.";
  return `${supportLine} ${lesionLine} A still photo cannot prove a virus or name an insect that is not clearly in the frame.`;
}

export function curlYellowFollowUp(options: {
  hasPhotos?: boolean;
  findings?: string[];
  answered?: string[];
  last?: string | null;
}): string {
  const answered = new Set((options.answered ?? []).map((item) => item.toLowerCase()));
  const last = (options.last ?? "").toLowerCase();
  const insectsAsked =
    answered.has(UNDERSIDE_INSECT_QUESTION.toLowerCase()) ||
    last.includes("underside") ||
    last.includes("insects present");
  if (options.hasPhotos && !photoShowsInsects(options.findings ?? []) && !insectsAsked) {
    return UNDERSIDE_INSECT_QUESTION;
  }
  if (!insectsAsked) return UNDERSIDE_INSECT_QUESTION;
  return OLD_VS_NEW_YELLOW_QUESTION;
}

export function collectRawModelCauses(payload: AgronomicCasePayload): string[] {
  const fromPayload = [
    ...(payload.rawModelCauses ?? []),
    ...(payload.likelyCauses ?? []),
    ...(payload.rankedCauses ?? []).map((cause) => cause.label),
  ];
  const unique: string[] = [];
  for (const label of fromPayload) {
    const trimmed = label.trim();
    if (!trimmed) continue;
    if (unique.some((item) => item.toLowerCase() === trimmed.toLowerCase())) continue;
    unique.push(trimmed);
  }
  return unique;
}

export function admittedHasPesticideTarget(admitted: GatedCause[]): boolean {
  return admitted.some((cause) => {
    if (isLesionSpecificDisease(cause.label)) return true;
    const observed =
      cause.evidenceSource === "photo_finding" ||
      cause.evidenceSource === "prior_confirmed_case_fact" ||
      /observed pest|farmer reported the pest|visible/.test(cause.evidenceFact.toLowerCase());
    return (
      observed &&
      (cause.category === "insects" ||
        cause.category === "mites" ||
        cause.category === "fungal disease" ||
        cause.category === "bacterial disease")
    );
  });
}

export function farmerConsideringDestruction(text: string): boolean {
  return /\b(pull (up|out|the whole)|destroy|dump the (crop|plants)|rogue|remove (the )?(whole |affected |infected |all )?plants?)\b/i.test(
    text,
  );
}

function stripForbiddenVisibleLanguage(
  text: string,
  options: { lesionEvidence: boolean; allowSpray: boolean; allowDestruction: boolean },
): string {
  if (!text.trim()) return text;
  let next = text;
  if (!options.lesionEvidence) {
    next = next
      .replace(FORBIDDEN_UNGATED_LESION, "")
      .replace(COPPER_SPRAY_CLASS, "")
      .replace(/\b(fungal vs bacterial|fungal and bacterial leaf spots)\b/gi, "")
      .replace(/\bIF THE SPOTS FIT A (FUNGAL|BACTERIAL) LEAF SPOT\b/gi, "");
  }
  if (!options.allowSpray) {
    next = next
      .replace(/\n*(?:if a spray is needed)[:\s-]*[\s\S]*?(?=\n[A-Z]|$)/gi, "\n")
      .replace(/\bif a spray is needed\b/gi, "");
  }
  if (!options.allowDestruction) {
    next = next.replace(
      /[^.!?\n]{0,80}\b(remove whole plants|destroy (the )?(plants?|crop)|do not remove whole plants unless[^.!?]*)[^.!?]*[.!?]?/gi,
      "",
    );
    next = next.replace(DESTRUCTION_COPY, "");
  }
  return next.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function enforceAdmittedInvariants(
  admitted: GatedCause[],
  options: { lesionEvidence: boolean },
): GatedCause[] {
  let next = admitted;
  if (!options.lesionEvidence) {
    const dropped = next.filter((cause) => isLesionSpecificDisease(cause.label));
    if (dropped.length > 0) {
      console.info(
        "[fvm-cause-debug]",
        JSON.stringify({
          invariant: "no_lesion_admitted_causes",
          dropped: dropped.map((cause) => cause.label),
        }),
      );
    }
    next = next.filter((cause) => !isLesionSpecificDisease(cause.label));
  }
  return next.map((cause, index) => ({ ...cause, rank: index + 1 }));
}

function diagnosisFromAdmitted(options: {
  admitted: GatedCause[];
  photoLine?: string | null;
  curlYellow: boolean;
  fallbackWhy?: string | null;
  photoUncertain?: boolean;
}): string {
  const conservativeCurl =
    "The curling and yellowing you described is still unconfirmed. Sucking insects under new leaves are the first thing to check. A nutrient pattern would rise only if older leaves are worse than new ones.";
  const causeWhy = options.admitted
    .map((cause) => cause.why)
    .filter(Boolean)
    .filter((item, index, all) => all.indexOf(item) === index);
  let body = causeWhy.join(" ");
  if (!body) {
    if (options.curlYellow) body = conservativeCurl;
    else body = options.fallbackWhy?.trim() || "There is not enough evidence yet to name a cause.";
  }
  if (options.photoUncertain && options.curlYellow) {
    body = conservativeCurl;
  }
  if (options.photoLine?.trim()) {
    return `${options.photoLine.trim()}\n\n${body}`.trim();
  }
  return body;
}

/**
 * Last farmer-visible contract: only admittedCauses may be rendered or passed
 * into playbooks, spray logic, disconfirmers, and cause cards.
 */
export function applyAdmittedCauseContract(
  payload: AgronomicCasePayload,
  options: {
    admitted: GatedCause[];
    rawModelCauses: string[];
    evidence: ObservedEvidence;
    facts: KnownFarmerFacts;
    hasPhotos?: boolean;
    previousState?: CropHealthCaseState | null;
  },
): AgronomicCasePayload {
  const findings = sanitizePhotoFindings([
    ...(options.previousState?.photoFindings ?? []),
    ...options.evidence.photoEvidence,
  ]);
  const photoUncertain = photoFindingsAreUncertain(findings, options.hasPhotos);
  let lesion = hasLesionEvidence({
    evidence: options.evidence,
    facts: options.facts,
    state: options.previousState,
    photoFindings: findings,
    hasPhotos: options.hasPhotos,
  });
  if (photoUncertain) lesion = false;

  const admitted = enforceAdmittedInvariants(options.admitted, { lesionEvidence: lesion });
  const pesticideTarget = admittedHasPesticideTarget(admitted);
  const allowSpray = Boolean(options.facts.asksForProducts) && pesticideTarget;
  const allowDestruction = farmerConsideringDestruction(options.facts.rawText);
  const curlYellow =
    (options.facts.crop ?? "").toLowerCase().includes("pepper") &&
    (options.evidence.symptoms.includes("leaf curl") || /\bcurl/.test(options.facts.rawText));

  const clean = (value: string) =>
    stripForbiddenVisibleLanguage(value, {
      lesionEvidence: lesion,
      allowSpray,
      allowDestruction,
    });

  const photoLine = options.hasPhotos
    ? photoEvidenceNarrative({
        findings,
        admitted,
        lesionEvidence: lesion,
      })
    : null;

  const diagnosisWhy = clean(
    diagnosisFromAdmitted({
      admitted,
      photoLine,
      curlYellow,
      fallbackWhy: payload.diagnosisWhy || payload.preliminaryAssessment,
      photoUncertain,
    }),
  );

  let preliminaryAssessment = clean(payload.preliminaryAssessment);
  if (
    curlYellow ||
    photoUncertain ||
    (!lesion && FORBIDDEN_UNGATED_LESION.test(payload.preliminaryAssessment || ""))
  ) {
    preliminaryAssessment = diagnosisWhy;
  }

  const checks = payload.checksToday.map(clean).filter(Boolean);
  const defaultChecks = [
    "Turn over curled new leaves and look for insects, mites, cast skins, or sticky residue",
    "Compare whether yellowing is worse on the newest curled leaves or the older lower leaves",
  ];

  const avoid = payload.actionsToAvoid
    .map(clean)
    .filter((item) => item && (allowDestruction || !DESTRUCTION_COPY.test(item)));

  const safeActions = payload.safeActionsNow
    .map(clean)
    .filter((item) => item && (allowDestruction || !DESTRUCTION_COPY.test(item)))
    .filter((item) => lesion || !/\b(remove|pick off|strip)\b[\s\S]{0,50}\b(leaves?|leaf)\b/i.test(item));
  if (curlYellow && !safeActions.some((item) => /fertilizer/i.test(item))) {
    safeActions.push(HOLD_FERTILIZER);
  }

  const whatWouldChange = admitted
    .map((cause) => cause.increasesIf)
    .map(clean)
    .filter(Boolean);

  let nextQuestion = payload.nextQuestion.trim();
  if (curlYellow && (!nextQuestion || FORBIDDEN_UNGATED_LESION.test(nextQuestion))) {
    nextQuestion = curlYellowFollowUp({
      hasPhotos: options.hasPhotos,
      findings,
      answered: options.previousState?.answeredDiagnosticQuestions,
      last: options.previousState?.lastDiagnosticQuestion,
    });
  }
  nextQuestion = clean(nextQuestion);

  const next: AgronomicCasePayload = {
    ...payload,
    rawModelCauses: options.rawModelCauses,
    admittedCauses: admitted,
    likelyCauses: admitted.map((cause) => cause.label),
    rankedCauses: admitted,
    diagnosisWhy,
    preliminaryAssessment,
    whatWouldChangeDiagnosis: whatWouldChange,
    checksToday:
      curlYellow && (checks.length === 0 || checks.some((item) => FORBIDDEN_UNGATED_LESION.test(item)))
        ? defaultChecks
        : checks,
    safeActionsNow: safeActions,
    actionsToAvoid: avoid,
    monitorNext: payload.monitorNext ? clean(payload.monitorNext) : payload.monitorNext,
    nextQuestion,
    sprayGuidanceText: allowSpray && payload.sprayGuidanceText ? clean(payload.sprayGuidanceText) : null,
    verifiedInputOptions: allowSpray ? payload.verifiedInputOptions : [],
  };

  if (!allowSpray) {
    next.sprayGuidanceText = null;
  }

  return next;
}
