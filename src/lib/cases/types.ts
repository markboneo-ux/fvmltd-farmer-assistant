import type { UserLevel } from "@/lib/beta/identity";
import type { AccessState } from "@/lib/beta/limits";

export type HomeOrCommercial = "home" | "commercial" | "unknown";

export type CaseStatus =
  | "open"
  | "in_progress"
  | "awaiting_followup"
  | "resolved"
  | "human_review"
  | "closed";

export type FollowUpOutcome = "improved" | "about_the_same" | "worse" | "problem_solved";

export type TrendClass =
  | "emerging_pattern"
  | "elevated_reports"
  | "possible_outbreak"
  | "verified_outbreak";

export type StructuredCaseFacts = {
  crop: string | null;
  variety: string | null;
  plantAge: string | null;
  productionSystem: string | null;
  homeOrCommercial: HomeOrCommercial;
  userLevel: UserLevel | null;
  country: string | null;
  district: string | null;
  farm: string | null;
  area: string | null;
  farmerProblemText: string;
  problemCategory: string | null;
  symptoms: string[];
  fieldDistribution: string | null;
  soilOrMedium: string | null;
  irrigation: string | null;
  drainage: string | null;
  fertilizerHistory: string | null;
  chemicalHistory: string | null;
  recentWeather: string | null;
  weatherRisk: string | null;
  possibleCauses: string[];
  confidence: "low" | "medium" | "high" | "unknown";
  severity: "low" | "medium" | "high" | "unknown";
  recommendedActions: string[];
  productsRequested: boolean;
  verifiedProductsShown: string[];
  humanEscalation: boolean;
};

export type CropCaseRecord = {
  id: string;
  userId: string | null;
  anonymousSessionId: string | null;
  accessState: AccessState;
  country: string | null;
  district: string | null;
  farm: string | null;
  crop: string | null;
  variety: string | null;
  plantAge: string | null;
  productionSystem: string | null;
  homeOrCommercial: HomeOrCommercial;
  userLevel: UserLevel | null;
  area: string | null;
  farmerProblemText: string;
  problemCategory: string | null;
  symptoms: string[];
  fieldDistribution: string | null;
  soilOrMedium: string | null;
  irrigation: string | null;
  drainage: string | null;
  fertilizerHistory: string | null;
  chemicalHistory: string | null;
  recentWeather: string | null;
  weatherRisk: string | null;
  possibleCauses: string[];
  confidence: StructuredCaseFacts["confidence"];
  severity: StructuredCaseFacts["severity"];
  recommendedActions: string[];
  productsRequested: boolean;
  verifiedProductsShown: string[];
  humanEscalation: boolean;
  agronomistReviewed: boolean;
  diagnosisConfirmed: boolean;
  caseStatus: CaseStatus;
  createdAt: string;
  updatedAt: string;
};

export type CaseMessageRecord = {
  id: string;
  caseId: string;
  role: "user" | "assistant" | "system";
  content: string;
  hasImages: boolean;
  createdAt: string;
};

export type CaseObservationRecord = {
  id: string;
  caseId: string;
  observedFacts: string[];
  possibleCauses: string[];
  confidence: StructuredCaseFacts["confidence"];
  nextCheck: string | null;
  recommendedAction: string | null;
  createdAt: string;
};

export type CasePhotoRecord = {
  id: string;
  caseId: string;
  ownerUserId: string | null;
  ownerSessionId: string | null;
  storageBucket: string;
  storagePath: string;
  mimeType: string;
  fileSizeBytes: number;
  publicUrl: null;
  createdAt: string;
};

export type CaseFollowupRecord = {
  id: string;
  caseId: string;
  userId: string | null;
  anonymousSessionId: string | null;
  followUpDate: string;
  askedAt: string | null;
  outcome: FollowUpOutcome | null;
  actionTaken: string | null;
  notes: string | null;
  followUpPhotoId: string | null;
  newSeverity: StructuredCaseFacts["severity"] | null;
  optedOut: boolean;
  createdAt: string;
};

export type CaseOutcomeRecord = {
  id: string;
  caseId: string;
  outcome: FollowUpOutcome;
  notes: string | null;
  createdAt: string;
};

export type SimilarCaseQuery = {
  country?: string | null;
  district?: string | null;
  crop?: string | null;
  variety?: string | null;
  symptoms?: string[];
  problemCategory?: string | null;
  productionSystem?: string | null;
  weatherContext?: string | null;
};

export type SimilarCaseMatch = {
  caseId: string;
  score: number;
  reasons: string[];
  farmerFacingSummary: string;
};
