import type { AccessState } from "@/lib/beta/limits";
import { extractStructuredFacts, mergeCaseFacts } from "./extract";
import type {
  CaseActionRecord,
  CaseAssessmentRecord,
  CaseFollowupRecord,
  CaseMessageRecord,
  CaseObservationRecord,
  CaseOutcomeRecord,
  CasePhotoRecord,
  CropCaseRecord,
  FollowUpOutcome,
  StructuredCaseFacts,
} from "./types";

export type CaseUpdateExtras = Partial<StructuredCaseFacts> & {
  caseStatus?: CropCaseRecord["caseStatus"];
  agronomistReviewed?: boolean;
  diagnosisConfirmed?: boolean;
};

export function nowIso() {
  return new Date().toISOString();
}

function emptyFacts(problem = ""): StructuredCaseFacts {
  return extractStructuredFacts(problem);
}

export function factsFromCase(record: CropCaseRecord): StructuredCaseFacts {
  return {
    crop: record.crop,
    variety: record.variety,
    plantAge: record.plantAge,
    productionSystem: record.productionSystem,
    homeOrCommercial: record.homeOrCommercial,
    userLevel: record.userLevel,
    country: record.country,
    district: record.district,
    farm: record.farm,
    area: record.area,
    farmerProblemText: record.farmerProblemText,
    problemCategory: record.problemCategory,
    symptoms: record.symptoms,
    fieldDistribution: record.fieldDistribution,
    soilOrMedium: record.soilOrMedium,
    irrigation: record.irrigation,
    drainage: record.drainage,
    fertilizerHistory: record.fertilizerHistory,
    chemicalHistory: record.chemicalHistory,
    recentWeather: record.recentWeather,
    weatherRisk: record.weatherRisk,
    possibleCauses: record.possibleCauses,
    confidence: record.confidence,
    severity: record.severity,
    recommendedActions: record.recommendedActions,
    productsRequested: record.productsRequested,
    verifiedProductsShown: record.verifiedProductsShown,
    humanEscalation: record.humanEscalation,
  };
}

export function buildNewCropCase(input: {
  userId?: string | null;
  anonymousSessionId?: string | null;
  accessState?: AccessState;
  message: string;
  profile?: { country?: string | null; district?: string | null } | null;
}): CropCaseRecord {
  const facts = extractStructuredFacts(input.message, input.profile);
  const createdAt = nowIso();
  return {
    id: crypto.randomUUID(),
    userId: input.userId ?? null,
    anonymousSessionId: input.anonymousSessionId ?? null,
    accessState: input.accessState ?? "guest",
    country: facts.country,
    district: facts.district,
    farm: facts.farm,
    crop: facts.crop,
    variety: facts.variety,
    plantAge: facts.plantAge,
    productionSystem: facts.productionSystem,
    homeOrCommercial: facts.homeOrCommercial,
    userLevel: facts.userLevel,
    area: facts.area,
    farmerProblemText: facts.farmerProblemText,
    problemCategory: facts.problemCategory,
    symptoms: facts.symptoms,
    fieldDistribution: facts.fieldDistribution,
    soilOrMedium: facts.soilOrMedium,
    irrigation: facts.irrigation,
    drainage: facts.drainage,
    fertilizerHistory: facts.fertilizerHistory,
    chemicalHistory: facts.chemicalHistory,
    recentWeather: facts.recentWeather,
    weatherRisk: facts.weatherRisk,
    possibleCauses: facts.possibleCauses,
    confidence: facts.confidence,
    severity: facts.severity,
    recommendedActions: facts.recommendedActions,
    productsRequested: facts.productsRequested,
    verifiedProductsShown: facts.verifiedProductsShown,
    humanEscalation: facts.humanEscalation,
    agronomistReviewed: false,
    diagnosisConfirmed: false,
    caseStatus: "open",
    createdAt,
    updatedAt: createdAt,
  };
}

export function mergeUpdatedCase(
  current: CropCaseRecord,
  message: string,
  extras?: CaseUpdateExtras,
): CropCaseRecord {
  const incoming = mergeCaseFacts(
    {
      ...emptyFacts(),
      ...factsFromCase(current),
    },
    extractStructuredFacts(message, {
      country: current.country,
      district: current.district,
    }),
  );

  const merged = extras
    ? mergeCaseFacts(incoming, {
        ...incoming,
        ...extras,
        symptoms: extras.symptoms ?? incoming.symptoms,
        possibleCauses: extras.possibleCauses ?? incoming.possibleCauses,
        recommendedActions: extras.recommendedActions ?? incoming.recommendedActions,
        verifiedProductsShown:
          extras.verifiedProductsShown ?? incoming.verifiedProductsShown,
      })
    : incoming;

  return {
    ...current,
    ...merged,
    caseStatus: extras?.caseStatus ?? current.caseStatus,
    agronomistReviewed: extras?.agronomistReviewed ?? current.agronomistReviewed,
    diagnosisConfirmed: extras?.diagnosisConfirmed ?? current.diagnosisConfirmed,
    updatedAt: nowIso(),
  };
}

export function buildCaseMessage(input: {
  caseId: string;
  role: CaseMessageRecord["role"];
  content: string;
  hasImages?: boolean;
}): CaseMessageRecord {
  return {
    id: crypto.randomUUID(),
    caseId: input.caseId,
    role: input.role,
    content: input.content,
    hasImages: Boolean(input.hasImages),
    createdAt: nowIso(),
  };
}

export function buildCaseObservation(input: {
  caseId: string;
  observedFacts: string[];
  possibleCauses: string[];
  confidence: StructuredCaseFacts["confidence"];
  nextCheck?: string | null;
  recommendedAction?: string | null;
}): CaseObservationRecord {
  return {
    id: crypto.randomUUID(),
    caseId: input.caseId,
    observedFacts: input.observedFacts,
    possibleCauses: input.possibleCauses,
    confidence: input.confidence,
    nextCheck: input.nextCheck ?? null,
    recommendedAction: input.recommendedAction ?? null,
    createdAt: nowIso(),
  };
}

export function buildCasePhoto(input: {
  caseId: string;
  ownerUserId?: string | null;
  ownerSessionId?: string | null;
  storagePath: string;
  mimeType: string;
  fileSizeBytes: number;
}): CasePhotoRecord {
  return {
    id: crypto.randomUUID(),
    caseId: input.caseId,
    ownerUserId: input.ownerUserId ?? null,
    ownerSessionId: input.ownerSessionId ?? null,
    storageBucket: "case-photos",
    storagePath: input.storagePath,
    mimeType: input.mimeType,
    fileSizeBytes: input.fileSizeBytes,
    publicUrl: null,
    createdAt: nowIso(),
  };
}

export function buildCaseFollowup(
  input: Omit<CaseFollowupRecord, "id" | "createdAt">,
): CaseFollowupRecord {
  return {
    ...input,
    id: crypto.randomUUID(),
    createdAt: nowIso(),
  };
}

export function buildCaseOutcome(input: {
  caseId: string;
  outcome: FollowUpOutcome;
  notes?: string | null;
}): CaseOutcomeRecord {
  return {
    id: crypto.randomUUID(),
    caseId: input.caseId,
    outcome: input.outcome,
    notes: input.notes ?? null,
    createdAt: nowIso(),
  };
}

export function buildCaseAssessment(input: {
  caseId: string;
  payload: Record<string, unknown>;
}): CaseAssessmentRecord {
  return {
    id: crypto.randomUUID(),
    caseId: input.caseId,
    payload: input.payload,
    createdAt: nowIso(),
  };
}

export function buildCaseAction(input: {
  caseId: string;
  actionText: string;
}): CaseActionRecord {
  return {
    id: crypto.randomUUID(),
    caseId: input.caseId,
    actionText: input.actionText,
    createdAt: nowIso(),
  };
}

export function caseIsOwnedBy(
  record: CropCaseRecord,
  owner: { userId?: string | null; anonymousSessionId?: string | null },
): boolean {
  if (owner.userId && record.userId === owner.userId) return true;
  if (
    owner.anonymousSessionId &&
    record.anonymousSessionId === owner.anonymousSessionId &&
    !record.userId
  ) {
    return true;
  }
  if (
    owner.userId &&
    record.anonymousSessionId &&
    owner.anonymousSessionId &&
    record.anonymousSessionId === owner.anonymousSessionId
  ) {
    return true;
  }
  return false;
}
