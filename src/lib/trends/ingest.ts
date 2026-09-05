import { isRejectedKnowledge, isTrustedKnowledge } from "@/lib/assistant/knowledge";
import type { CropCaseRecord } from "@/lib/cases/types";
import { listCropCases, listOutcomes } from "@/lib/cases/store";
import { aggregateCluster, canExposeTrend, trendsMatchFarmerQuery } from "./engine";
import { listCaseTrends, upsertCaseTrend } from "./store";
import {
  symptomClusterFrom,
  trendClusterKey,
  type CaseTrendRecord,
  type TrendClusterInput,
} from "./types";

function sessionKeyFor(record: Pick<CropCaseRecord, "userId" | "anonymousSessionId">): string {
  return record.userId ?? record.anonymousSessionId ?? "unknown";
}

function isDiagnosticCase(record: CropCaseRecord): boolean {
  if (record.caseType === "farm_business" || record.caseType === "calculation") {
    return false;
  }
  return Boolean(record.crop || record.symptoms.length > 0 || record.problemCategory);
}

function toClusterInput(
  record: CropCaseRecord,
  outcomePositive: boolean,
): TrendClusterInput {
  return {
    caseId: record.id,
    sessionKey: sessionKeyFor(record),
    country: record.country,
    region: record.district,
    crop: record.crop,
    variety: record.variety,
    symptoms: record.symptoms,
    suspectedIssue: record.problemCategory,
    createdAt: record.createdAt,
    agronomistReviewed: record.agronomistReviewed,
    diagnosisConfirmed: record.diagnosisConfirmed,
    positiveOutcome: outcomePositive,
    rejected:
      isRejectedKnowledge(record) ||
      record.includeInTrendLearning === false ||
      record.excludeFromLearning ||
      record.diagnosisIncorrect,
    excludeFromLearning: record.excludeFromLearning || record.includeInTrendLearning === false,
    diagnosisIncorrect: record.diagnosisIncorrect,
  };
}

export async function ingestCaseForTrends(
  record: CropCaseRecord,
): Promise<CaseTrendRecord | null> {
  if (!isDiagnosticCase(record)) return null;

  const allCases = await listCropCases();
  const outcomes = await listOutcomes();
  const positive = new Set(
    outcomes
      .filter((row) => row.outcome === "improved" || row.outcome === "problem_solved")
      .map((row) => row.caseId),
  );

  const cluster = symptomClusterFrom(record.symptoms, record.problemCategory);
  const members = allCases
    .filter((item) => isDiagnosticCase(item))
    .filter((item) => {
      return (
        (item.crop || "") === (record.crop || "") &&
        (item.country || "") === (record.country || "") &&
        (item.district || "") === (record.district || "") &&
        symptomClusterFrom(item.symptoms, item.problemCategory) === cluster
      );
    })
    .map((item) => toClusterInput(item, positive.has(item.id)));

  const existingId = trendClusterKey({
    country: record.country,
    region: record.district,
    crop: record.crop,
    variety: record.variety,
    symptomCluster: cluster,
    suspectedIssue: record.problemCategory,
  });
  const existingList = await listCaseTrends();
  const existing =
    existingList.find((item) => item.id === existingId) ??
    existingList.find(
      (item) =>
        (item.crop || "") === (record.crop || "") &&
        (item.region || "") === (record.district || "") &&
        item.symptomCluster === cluster,
    ) ??
    null;

  const aggregated = aggregateCluster(members, existing ? { ...existing, id: existingId } : null);
  if (!aggregated) return null;
  return upsertCaseTrend({ ...aggregated, id: existingId });
}

export async function relevantTrendHint(query: {
  crop?: string | null;
  region?: string | null;
  country?: string | null;
  symptoms?: string[];
  suspectedIssue?: string | null;
}): Promise<string | null> {
  const trends = (await listCaseTrends()).filter(canExposeTrend);
  const match = trends.find(
    (trend) =>
      trend.trendStatus !== "rejected" &&
      (trend.trendStatus === "established" ||
        trend.trendStatus === "reviewed" ||
        trend.trendStatus === "recurring" ||
        trend.trendStatus === "emerging") &&
      trendsMatchFarmerQuery(trend, query),
  );
  if (!match) return null;
  if (match.trendStatus === "emerging") {
    return "We have a few similar reports in your area. It is worth checking, but this is not proof of what is happening on your farm.";
  }
  return "We have seen similar reports recently in your area, so this is worth checking.";
}

export function trustedCaseForSimilarity(record: CropCaseRecord, hasPositiveOutcome: boolean): boolean {
  if (isRejectedKnowledge(record)) return false;
  return isTrustedKnowledge({
    agronomistReviewed: record.agronomistReviewed,
    diagnosisConfirmed: record.diagnosisConfirmed,
    knowledgeState: record.knowledgeState,
    outcome: hasPositiveOutcome ? "improved" : null,
  });
}
