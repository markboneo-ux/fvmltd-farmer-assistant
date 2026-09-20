/**
 * Internal 1–3 cause differential. Not a confirmed diagnosis.
 */

import { rankDiagnosticCauses, type RankedCause } from "./causes";
import {
  assignDiagnosisConfidence,
  type DiagnosisConfidence,
} from "./diagnosis-confidence";
import type { KnownFarmerFacts } from "./tomato-protocol";
import { specificPhotoRequest } from "./photo-request";
import type { SuspectedCauseEntry } from "./crop-health-state";

export type DifferentialDiagnosis = {
  hypotheses: SuspectedCauseEntry[];
  diagnosticConfidence: DiagnosisConfidence;
  nextObservation: string;
  nextPhotoQuestion: string | null;
  suspectedPest: string | null;
  suspectedDiseaseOrDisorder: string | null;
  suspectedCause: string | null;
  confirmedDiagnosis: null;
};

const PEST_CATEGORIES = new Set(["insects", "mites"]);
const DISEASE_CATEGORIES = new Set(["fungal disease", "bacterial disease", "viral disease"]);

export function buildDifferentialDiagnosis(options: {
  text: string;
  facts?: KnownFarmerFacts | null;
  ranked?: RankedCause[];
  hasPhotos?: boolean;
  photoAlreadyRequested?: boolean;
  staffConfirmed?: boolean;
  labResult?: boolean;
}): DifferentialDiagnosis {
  const ranked = (options.ranked?.length
    ? options.ranked
    : rankDiagnosticCauses(options.text)
  ).slice(0, 3);

  const hypotheses: SuspectedCauseEntry[] = ranked.map((cause) => ({
    label: cause.label,
    category: cause.category,
    evidenceFor: [cause.why, cause.increasesIf].filter(Boolean),
    evidenceAgainst: cause.decreasesIf ? [cause.decreasesIf] : [],
    rank: cause.rank,
  }));

  const evidenceCount = [
    options.facts?.distributionHint,
    options.facts?.plantAge,
    options.facts?.irrigationType,
    options.facts?.recentFertilizer,
    options.facts?.recentPesticide,
    options.facts?.variety,
    options.hasPhotos,
  ].filter(Boolean).length;

  const diagnosticConfidence = assignDiagnosisConfidence({
    staffConfirmed: options.staffConfirmed,
    labResult: options.labResult,
    photoOnly: Boolean(options.hasPhotos) && evidenceCount <= 1,
    causeCount: hypotheses.length,
    evidenceCount,
  });

  const photo = specificPhotoRequest({
    facts: options.facts ?? {
      rawText: options.text,
      suspectedIssue: null,
      distributionHint: null,
      suddenWilt: false,
    },
    hasPhotos: options.hasPhotos,
    alreadyRequested: options.photoAlreadyRequested,
  });

  const nextObservation =
    hypotheses.length > 0
      ? distinguishingQuestion(hypotheses, options.facts ?? null)
      : photo?.farmerQuestion ||
        "Are a few plants, patches, or most of the crop affected?";

  const top = hypotheses[0] ?? null;
  return {
    hypotheses,
    diagnosticConfidence,
    nextObservation,
    nextPhotoQuestion: photo?.farmerQuestion ?? null,
    suspectedPest: hypotheses.find((item) => PEST_CATEGORIES.has(item.category))?.label ?? null,
    suspectedDiseaseOrDisorder:
      hypotheses.find((item) => DISEASE_CATEGORIES.has(item.category))?.label ?? null,
    suspectedCause: top?.label ?? null,
    confirmedDiagnosis: null,
  };
}

function distinguishingQuestion(
  hypotheses: SuspectedCauseEntry[],
  facts: KnownFarmerFacts | null,
): string {
  if (facts?.distributionHint) {
    if (hypotheses.some((item) => /wilt|root/i.test(item.label))) {
      return "If you cut a wilted stem, is the inside brown, and do the roots look rotten or healthy?";
    }
  }
  if (hypotheses.length >= 2) {
    const first = hypotheses[0];
    const second = hypotheses[1];
    if (/spot|fungal|disease/i.test(second.label) || /spot|fungal|disease/i.test(first.label)) {
      return "Are the brown or yellow areas starting at the leaf tips, edges, or as separate spots?";
    }
    if (/insect|whitefly|mite/i.test(first.label + second.label)) {
      return "Can you check the underside of a few leaves for insects, sticky residue, or fine webbing?";
    }
  }
  return "Are the brown or yellow areas starting at the leaf tips, edges, or as separate spots?";
}

export function isLowDiagnosticConfidence(value: DiagnosisConfidence | "unknown" | null | undefined): boolean {
  return value === "possible" || value === "unknown" || !value;
}
