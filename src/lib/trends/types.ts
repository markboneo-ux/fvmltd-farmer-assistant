export const TREND_STATUSES = [
  "emerging",
  "recurring",
  "established",
  "reviewed",
  "rejected",
] as const;

export type TrendStatus = (typeof TREND_STATUSES)[number];

export type CaseTrendRecord = {
  id: string;
  country: string | null;
  region: string | null;
  crop: string | null;
  variety: string | null;
  symptomCluster: string;
  suspectedIssue: string | null;
  caseCount: number;
  uniqueSessionCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  confidenceScore: number;
  reviewedCaseCount: number;
  confirmedCaseCount: number;
  positiveOutcomeCount: number;
  trendStatus: TrendStatus;
  staffReviewed: boolean;
  notes: string | null;
  contributingCaseIds: string[];
  contributingSessionKeys: string[];
};

export type TrendClusterInput = {
  caseId: string;
  sessionKey: string;
  country: string | null;
  region: string | null;
  crop: string | null;
  variety: string | null;
  symptoms: string[];
  suspectedIssue: string | null;
  createdAt: string;
  agronomistReviewed: boolean;
  diagnosisConfirmed: boolean;
  positiveOutcome: boolean;
  rejected: boolean;
  excludeFromLearning?: boolean;
  diagnosisIncorrect?: boolean;
  staffVerifiedOutbreak?: boolean;
};

export function symptomClusterFrom(symptoms: string[], suspectedIssue: string | null): string {
  const parts = [...symptoms.map((item) => item.toLowerCase().trim()).filter(Boolean)];
  if (suspectedIssue) parts.push(suspectedIssue.toLowerCase().trim());
  const unique = [...new Set(parts)].sort();
  return unique.join("|") || "unspecified";
}

export function trendClusterKey(input: {
  country: string | null;
  region: string | null;
  crop: string | null;
  variety: string | null;
  symptomCluster: string;
  suspectedIssue: string | null;
}): string {
  return [
    (input.country || "unknown").toLowerCase(),
    (input.region || "unknown").toLowerCase(),
    (input.crop || "unknown").toLowerCase(),
    (input.variety || "any").toLowerCase(),
    input.symptomCluster,
    (input.suspectedIssue || "").toLowerCase(),
  ].join("::");
}
