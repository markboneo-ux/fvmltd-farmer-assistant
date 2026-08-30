export const CROP_OUTCOMES = [
  "improved",
  "unchanged",
  "worse",
  "solved",
] as const;

export type CropOutcome = (typeof CROP_OUTCOMES)[number];

export const REVIEW_VERDICTS = [
  "correct",
  "partly_correct",
  "incorrect",
] as const;

export type ReviewVerdict = (typeof REVIEW_VERDICTS)[number];

export type AgronomyCaseRecord = {
  id: string;
  farmerId: string | null;
  sessionId: string;
  country: string | null;
  district: string | null;
  farm: string | null;
  crop: string | null;
  variety: string | null;
  plantAge: string | null;
  productionSystem: string | null;
  farmerScale: string | null;
  areaPlanted: string | null;
  problemReported: string | null;
  symptoms: string | null;
  fieldDistribution: string | null;
  photoCount: number;
  soilOrMedium: string | null;
  irrigation: string | null;
  drainage: string | null;
  fertilizerHistory: string | null;
  cropProtectionHistory: string | null;
  weatherConditions: string | null;
  suspectedCauses: string | null;
  confidence: string | null;
  actionsRecommended: string[];
  actionsActuallyTaken: string | null;
  followUpResult: string | null;
  cropOutcome: CropOutcome | null;
  confirmedDiagnosis: string | null;
  yieldImpact: string | null;
  followUpDueAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AgronomyCaseMessage = {
  id: string;
  caseId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type AgronomyCaseOutcome = {
  id: string;
  caseId: string;
  cropOutcome: CropOutcome;
  actionsTaken: string | null;
  daysAfterRecommendation: number | null;
  createdAt: string;
};

export type AgronomyCaseReview = {
  id: string;
  caseId: string;
  staffProfileId: string | null;
  verdict: ReviewVerdict;
  confirmedDiagnosis: string | null;
  recommendedCorrection: string | null;
  requiresLabConfirmation: boolean;
  createdAt: string;
};

export type SimilarCaseQuery = {
  country?: string | null;
  district?: string | null;
  crop?: string | null;
  variety?: string | null;
  symptoms?: string | null;
  productionSystem?: string | null;
  weatherContext?: string | null;
};

/** Anonymized evidence for the model — never includes farmer identity. */
export type SimilarCaseEvidence = {
  pattern: string;
  crop: string | null;
  locationLabel: string | null;
  outcome: CropOutcome | null;
  reviewed: boolean;
  confirmedDiagnosis: string | null;
  score: number;
};

export type FollowUpPrompt = {
  caseId: string;
  question: string;
  options: Array<{ id: CropOutcome; label: string }>;
};
