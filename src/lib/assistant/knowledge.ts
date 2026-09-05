/**
 * Knowledge trust layers:
 * A. raw conversation data — stored, not used as truth
 * B. candidate trend data — similar cases from multiple unique sessions
 * C. validated knowledge — reviewed, confirmed, or established pattern
 */

import type { CropCaseRecord, FollowUpOutcome, KnowledgeState } from "@/lib/cases/types";
import type { TrendStatus } from "@/lib/trends/types";

export type { KnowledgeState };

export function knowledgeStateFromCase(
  record: Pick<
    CropCaseRecord,
    | "agronomistReviewed"
    | "diagnosisConfirmed"
    | "knowledgeState"
  > & {
    outcome?: FollowUpOutcome | null;
  },
): KnowledgeState {
  if (record.knowledgeState === "rejected") return "rejected";
  if (record.knowledgeState === "validated") return "validated";
  if (record.diagnosisConfirmed || record.agronomistReviewed) return "validated";
  if (
    record.outcome === "problem_solved" ||
    record.outcome === "improved"
  ) {
    return "validated";
  }
  if (record.knowledgeState === "candidate") return "candidate";
  return "raw";
}

export function isTrustedKnowledge(record: {
  agronomistReviewed?: boolean;
  diagnosisConfirmed?: boolean;
  knowledgeState?: KnowledgeState | null;
  outcome?: FollowUpOutcome | null;
}): boolean {
  return knowledgeStateFromCase({
    agronomistReviewed: Boolean(record.agronomistReviewed),
    diagnosisConfirmed: Boolean(record.diagnosisConfirmed),
    knowledgeState: record.knowledgeState ?? "raw",
    outcome: record.outcome ?? null,
  }) === "validated";
}

export function isRejectedKnowledge(record: {
  knowledgeState?: KnowledgeState | null;
  diagnosisIncorrect?: boolean;
  includeInTrendLearning?: boolean;
  excludeFromLearning?: boolean;
}): boolean {
  if (record.knowledgeState === "rejected") return true;
  if (record.diagnosisIncorrect) return true;
  if (record.includeInTrendLearning === false) return true;
  if (record.excludeFromLearning) return true;
  return false;
}

export function trendIsFarmerSafe(status: TrendStatus): boolean {
  return status === "established" || status === "reviewed" || status === "recurring";
}

export const TREND_SUPPORTING_LANGUAGE =
  "We have seen similar reports recently in your area, so this is worth checking.";

export function farmerFacingTrendHint(options: {
  similarEnough: boolean;
  trendStatus: TrendStatus | null;
  staffVerifiedOutbreak?: boolean;
}): string | null {
  if (options.staffVerifiedOutbreak) {
    return "Qualified staff have verified an outbreak risk in this area. Treat this as a serious watch, not an automatic diagnosis of your plants.";
  }
  if (!options.similarEnough || !options.trendStatus) return null;
  if (!trendIsFarmerSafe(options.trendStatus) && options.trendStatus !== "emerging") {
    return null;
  }
  if (options.trendStatus === "emerging") {
    return "We have a few similar reports in your area. It is worth checking, but this is not proof of what is happening on your farm.";
  }
  return TREND_SUPPORTING_LANGUAGE;
}
