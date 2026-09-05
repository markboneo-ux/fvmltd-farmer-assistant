export const DIAGNOSIS_CONFIDENCE = [
  "possible",
  "likely",
  "highly_likely",
  "confirmed",
] as const;

export type DiagnosisConfidence = (typeof DIAGNOSIS_CONFIDENCE)[number];

export function isDiagnosisConfidence(value: unknown): value is DiagnosisConfidence {
  return (
    typeof value === "string" &&
    (DIAGNOSIS_CONFIDENCE as readonly string[]).includes(value)
  );
}

/**
 * AI or photo inference alone is never "confirmed".
 */
export function assignDiagnosisConfidence(options: {
  claimed?: string | null;
  labResult?: boolean;
  staffConfirmed?: boolean;
  farmerReportedLab?: boolean;
  photoOnly?: boolean;
  causeCount?: number;
  evidenceCount?: number;
}): DiagnosisConfidence {
  const confirmedEvidence =
    Boolean(options.labResult) ||
    Boolean(options.staffConfirmed) ||
    Boolean(options.farmerReportedLab);

  if (confirmedEvidence) return "confirmed";

  if (options.claimed === "confirmed") {
    if ((options.evidenceCount ?? 0) >= 3 && (options.causeCount ?? 0) <= 1) {
      return "highly_likely";
    }
    return "likely";
  }

  if (options.photoOnly && (options.causeCount ?? 0) > 1) return "possible";
  if ((options.causeCount ?? 0) >= 3) return "possible";
  if ((options.evidenceCount ?? 0) >= 3 && (options.causeCount ?? 0) <= 2) {
    return "likely";
  }
  if ((options.evidenceCount ?? 0) >= 2) return "likely";
  return "possible";
}

export function diagnosisConfidenceLabel(value: DiagnosisConfidence): string {
  switch (value) {
    case "confirmed":
      return "Confirmed from laboratory or specialist evidence.";
    case "highly_likely":
      return "Highly likely working diagnosis — still not laboratory-confirmed.";
    case "likely":
      return "Likely working diagnosis — not confirmed.";
    default:
      return "Possible causes only — not a confirmed diagnosis.";
  }
}
