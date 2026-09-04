import {
  symptomClusterFrom,
  trendClusterKey,
  type CaseTrendRecord,
  type TrendClusterInput,
  type TrendStatus,
} from "./types";

const EMERGING_MIN_UNIQUE_SESSIONS = 3;
const RECURRING_MIN_UNIQUE_SESSIONS = 4;
const ESTABLISHED_MIN_UNIQUE_SESSIONS = 8;
const ESTABLISHED_CONFIRMED_ALT = 2;
const ESTABLISHED_ALT_SESSIONS = 4;

export { EMERGING_MIN_UNIQUE_SESSIONS };

export function scoreTrend(options: {
  uniqueSessionCount: number;
  caseCount: number;
  reviewedCaseCount: number;
  confirmedCaseCount: number;
  positiveOutcomeCount: number;
  staffReviewed: boolean;
  rejected: boolean;
}): { status: TrendStatus; confidenceScore: number } {
  if (options.rejected) {
    return { status: "rejected", confidenceScore: 0 };
  }
  if (options.staffReviewed) {
    return {
      status: "reviewed",
      confidenceScore: Math.min(
        100,
        70 + options.confirmedCaseCount * 8 + options.reviewedCaseCount * 4,
      ),
    };
  }

  const unique = options.uniqueSessionCount;
  const confirmedWeight =
    options.confirmedCaseCount * 18 +
    options.reviewedCaseCount * 12 +
    options.positiveOutcomeCount * 10;
  const volume = unique * 8 + Math.max(0, options.caseCount - unique) * 2;
  const confidenceScore = Math.min(100, volume + confirmedWeight);

  if (unique < EMERGING_MIN_UNIQUE_SESSIONS) {
    return { status: "emerging", confidenceScore: 0 };
  }

  const established =
    unique >= ESTABLISHED_MIN_UNIQUE_SESSIONS ||
    (unique >= ESTABLISHED_ALT_SESSIONS &&
      options.confirmedCaseCount >= ESTABLISHED_CONFIRMED_ALT);

  if (established) {
    return { status: "established", confidenceScore: Math.max(confidenceScore, 60) };
  }
  if (unique >= RECURRING_MIN_UNIQUE_SESSIONS) {
    return { status: "recurring", confidenceScore: Math.max(confidenceScore, 40) };
  }
  return { status: "emerging", confidenceScore: Math.max(confidenceScore, 20) };
}

export function canExposeTrend(record: Pick<CaseTrendRecord, "trendStatus" | "uniqueSessionCount">): boolean {
  if (record.trendStatus === "rejected") return false;
  return record.uniqueSessionCount >= EMERGING_MIN_UNIQUE_SESSIONS;
}

export function isEstablishedTrend(record: Pick<CaseTrendRecord, "trendStatus" | "uniqueSessionCount">): boolean {
  return record.trendStatus === "established" || record.trendStatus === "reviewed";
}

export function trendsMatchFarmerQuery(
  trend: Pick<CaseTrendRecord, "crop" | "region" | "country" | "symptomCluster" | "suspectedIssue">,
  query: {
    crop?: string | null;
    region?: string | null;
    country?: string | null;
    symptoms?: string[];
    suspectedIssue?: string | null;
  },
): boolean {
  if (query.crop && trend.crop && query.crop.toLowerCase() !== trend.crop.toLowerCase()) {
    return false;
  }
  if (
    query.country &&
    trend.country &&
    query.country.toLowerCase() !== trend.country.toLowerCase()
  ) {
    return false;
  }
  if (
    query.region &&
    trend.region &&
    query.region.toLowerCase() !== trend.region.toLowerCase()
  ) {
    return false;
  }
  const queryCluster = symptomClusterFrom(query.symptoms ?? [], query.suspectedIssue ?? null);
  if (queryCluster === "unspecified" || trend.symptomCluster === "unspecified") {
    return Boolean(query.crop && trend.crop);
  }
  const queryParts = new Set(queryCluster.split("|").filter(Boolean));
  const trendParts = trend.symptomCluster.split("|").filter(Boolean);
  return trendParts.some((part) => queryParts.has(part));
}

export function aggregateCluster(
  members: TrendClusterInput[],
  existing?: CaseTrendRecord | null,
): CaseTrendRecord | null {
  const eligible = members.filter(
    (item) => !item.rejected && !item.excludeFromLearning && !item.diagnosisIncorrect,
  );
  const sessions = new Set(eligible.map((item) => item.sessionKey));
  const caseIds = [...new Set(eligible.map((item) => item.caseId))];
  if (caseIds.length === 0) {
    if (existing) {
      return {
        ...existing,
        trendStatus: "rejected",
        confidenceScore: 0,
        caseCount: 0,
        uniqueSessionCount: 0,
      };
    }
    return null;
  }

  const prototype = eligible[0];
  const symptomCluster = symptomClusterFrom(
    prototype.symptoms,
    prototype.suspectedIssue,
  );
  const reviewedCaseCount = eligible.filter((item) => item.agronomistReviewed).length;
  const confirmedCaseCount = eligible.filter((item) => item.diagnosisConfirmed).length;
  const positiveOutcomeCount = eligible.filter((item) => item.positiveOutcome).length;
  const staffReviewed = Boolean(existing?.staffReviewed);
  const rejected = existing?.trendStatus === "rejected";
  const scored = scoreTrend({
    uniqueSessionCount: sessions.size,
    caseCount: caseIds.length,
    reviewedCaseCount,
    confirmedCaseCount,
    positiveOutcomeCount,
    staffReviewed,
    rejected,
  });

  const timestamps = eligible.map((item) => item.createdAt).sort();
  const id =
    existing?.id ??
    trendClusterKey({
      country: prototype.country,
      region: prototype.region,
      crop: prototype.crop,
      variety: prototype.variety,
      symptomCluster,
      suspectedIssue: prototype.suspectedIssue,
    });

  if (sessions.size < EMERGING_MIN_UNIQUE_SESSIONS && !staffReviewed) {
    if (existing) {
      return {
        ...existing,
        caseCount: caseIds.length,
        uniqueSessionCount: sessions.size,
        confidenceScore: 0,
        reviewedCaseCount,
        confirmedCaseCount,
        positiveOutcomeCount,
        trendStatus: "rejected",
        contributingCaseIds: caseIds,
        contributingSessionKeys: [...sessions],
      };
    }
    return null;
  }

  return {
    id,
    country: prototype.country,
    region: prototype.region,
    crop: prototype.crop,
    variety: prototype.variety,
    symptomCluster,
    suspectedIssue: prototype.suspectedIssue,
    caseCount: caseIds.length,
    uniqueSessionCount: sessions.size,
    firstSeenAt: existing?.firstSeenAt ?? timestamps[0],
    lastSeenAt: timestamps[timestamps.length - 1],
    confidenceScore: scored.confidenceScore,
    reviewedCaseCount,
    confirmedCaseCount,
    positiveOutcomeCount,
    trendStatus: scored.status,
    staffReviewed,
    notes: existing?.notes ?? null,
    contributingCaseIds: caseIds,
    contributingSessionKeys: [...sessions],
  };
}

export function oneCaseCannotEstablish(record: CaseTrendRecord | null): boolean {
  if (!record) return true;
  return record.uniqueSessionCount < ESTABLISHED_MIN_UNIQUE_SESSIONS &&
    !(
      record.uniqueSessionCount >= ESTABLISHED_ALT_SESSIONS &&
      record.confirmedCaseCount >= ESTABLISHED_CONFIRMED_ALT
    );
}
