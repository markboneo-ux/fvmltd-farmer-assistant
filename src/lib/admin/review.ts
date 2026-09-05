import type { CropCaseRecord } from "@/lib/cases/types";

export type StaffReviewPatch = {
  diagnosisConfirmed?: boolean;
  diagnosisIncorrect?: boolean;
  needsReview?: boolean;
  includeInTrendLearning?: boolean;
  resolved?: boolean;
  unresolved?: boolean;
};

export type AppliedStaffReview = {
  agronomistReviewed: true;
  diagnosisConfirmed: boolean;
  diagnosisIncorrect: boolean;
  needsReview: boolean;
  includeInTrendLearning: boolean;
  knowledgeState: CropCaseRecord["knowledgeState"];
  caseStatus: CropCaseRecord["caseStatus"];
};

/**
 * Merge a staff review click into existing case flags.
 * Unspecified fields stay as they are.
 */
export function applyStaffReview(
  current: Pick<
    CropCaseRecord,
    | "diagnosisConfirmed"
    | "diagnosisIncorrect"
    | "needsReview"
    | "includeInTrendLearning"
    | "knowledgeState"
    | "caseStatus"
  >,
  patch: StaffReviewPatch,
): AppliedStaffReview {
  let diagnosisConfirmed = current.diagnosisConfirmed;
  let diagnosisIncorrect = current.diagnosisIncorrect;
  let needsReview = current.needsReview;
  let includeInTrendLearning = current.includeInTrendLearning;
  let knowledgeState = current.knowledgeState;
  let caseStatus = current.caseStatus;

  if (patch.diagnosisConfirmed === true) {
    diagnosisConfirmed = true;
    diagnosisIncorrect = false;
    needsReview = false;
    knowledgeState = "validated";
  }
  if (patch.diagnosisIncorrect === true) {
    diagnosisIncorrect = true;
    diagnosisConfirmed = false;
    knowledgeState = "rejected";
    includeInTrendLearning = false;
  }
  if (patch.needsReview === true) {
    needsReview = true;
    caseStatus = "human_review";
  }
  if (patch.includeInTrendLearning === true) {
    includeInTrendLearning = true;
    if (knowledgeState === "rejected" && !diagnosisIncorrect) {
      knowledgeState = "candidate";
    }
  }
  if (patch.includeInTrendLearning === false) {
    includeInTrendLearning = false;
    knowledgeState = "rejected";
  }
  if (patch.resolved === true) {
    caseStatus = "resolved";
    needsReview = false;
  }
  if (patch.unresolved === true && caseStatus === "resolved") {
    caseStatus = "in_progress";
  }

  return {
    agronomistReviewed: true,
    diagnosisConfirmed,
    diagnosisIncorrect,
    needsReview,
    includeInTrendLearning,
    knowledgeState,
    caseStatus,
  };
}
