import type { AccessState } from "@/lib/beta/limits";
import type {
  CaseFollowupRecord,
  CaseMessageRecord,
  CaseObservationRecord,
  CaseOutcomeRecord,
  CasePhotoRecord,
  CropCaseRecord,
  FollowUpOutcome,
  StructuredCaseFacts,
} from "./types";
import { extractStructuredFacts, mergeCaseFacts } from "./extract";

const cases = new Map<string, CropCaseRecord>();
const messages = new Map<string, CaseMessageRecord[]>();
const observations = new Map<string, CaseObservationRecord[]>();
const photos = new Map<string, CasePhotoRecord[]>();
const followups = new Map<string, CaseFollowupRecord[]>();
const outcomes = new Map<string, CaseOutcomeRecord[]>();

function emptyFacts(problem = ""): StructuredCaseFacts {
  return extractStructuredFacts(problem);
}

function nowIso() {
  return new Date().toISOString();
}

export function resetCaseStore() {
  cases.clear();
  messages.clear();
  observations.clear();
  photos.clear();
  followups.clear();
  outcomes.clear();
}

export function createCropCase(input: {
  userId?: string | null;
  anonymousSessionId?: string | null;
  accessState?: AccessState;
  message: string;
  profile?: { country?: string | null; district?: string | null } | null;
}): CropCaseRecord {
  const facts = extractStructuredFacts(input.message, input.profile);
  const createdAt = nowIso();
  const record: CropCaseRecord = {
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
  cases.set(record.id, record);
  messages.set(record.id, []);
  observations.set(record.id, []);
  photos.set(record.id, []);
  followups.set(record.id, []);
  outcomes.set(record.id, []);
  return record;
}

export function getCropCase(id: string): CropCaseRecord | null {
  return cases.get(id) ?? null;
}

export function listCropCases(): CropCaseRecord[] {
  return [...cases.values()];
}

export function casesForOwner(owner: {
  userId?: string | null;
  anonymousSessionId?: string | null;
}): CropCaseRecord[] {
  return listCropCases().filter((item) => {
    if (owner.userId && item.userId === owner.userId) return true;
    if (owner.anonymousSessionId && item.anonymousSessionId === owner.anonymousSessionId) {
      return true;
    }
    return false;
  });
}

export function assertCaseOwned(
  caseId: string,
  owner: { userId?: string | null; anonymousSessionId?: string | null },
): CropCaseRecord | null {
  const record = getCropCase(caseId);
  if (!record) return null;
  if (owner.userId && record.userId === owner.userId) return record;
  if (
    owner.anonymousSessionId &&
    record.anonymousSessionId === owner.anonymousSessionId &&
    !record.userId
  ) {
    return record;
  }
  if (
    owner.userId &&
    record.anonymousSessionId &&
    owner.anonymousSessionId &&
    record.anonymousSessionId === owner.anonymousSessionId
  ) {
    return record;
  }
  return null;
}

export function updateCaseFromConversation(
  caseId: string,
  message: string,
  extras?: Partial<StructuredCaseFacts> & {
    caseStatus?: CropCaseRecord["caseStatus"];
    agronomistReviewed?: boolean;
    diagnosisConfirmed?: boolean;
  },
): CropCaseRecord | null {
  const current = getCropCase(caseId);
  if (!current) return null;
  const incoming = mergeCaseFacts(
    {
      ...emptyFacts(),
      crop: current.crop,
      variety: current.variety,
      plantAge: current.plantAge,
      productionSystem: current.productionSystem,
      homeOrCommercial: current.homeOrCommercial,
      userLevel: current.userLevel,
      country: current.country,
      district: current.district,
      farm: current.farm,
      area: current.area,
      farmerProblemText: current.farmerProblemText,
      problemCategory: current.problemCategory,
      symptoms: current.symptoms,
      fieldDistribution: current.fieldDistribution,
      soilOrMedium: current.soilOrMedium,
      irrigation: current.irrigation,
      drainage: current.drainage,
      fertilizerHistory: current.fertilizerHistory,
      chemicalHistory: current.chemicalHistory,
      recentWeather: current.recentWeather,
      weatherRisk: current.weatherRisk,
      possibleCauses: current.possibleCauses,
      confidence: current.confidence,
      severity: current.severity,
      recommendedActions: current.recommendedActions,
      productsRequested: current.productsRequested,
      verifiedProductsShown: current.verifiedProductsShown,
      humanEscalation: current.humanEscalation,
    },
    extractStructuredFacts(message, {
      country: current.country,
      district: current.district,
    }),
  );

  const merged = extras ? mergeCaseFacts(incoming, extras as StructuredCaseFacts) : incoming;
  const next: CropCaseRecord = {
    ...current,
    ...merged,
    caseStatus: extras?.caseStatus ?? current.caseStatus,
    agronomistReviewed: extras?.agronomistReviewed ?? current.agronomistReviewed,
    diagnosisConfirmed: extras?.diagnosisConfirmed ?? current.diagnosisConfirmed,
    updatedAt: nowIso(),
  };
  cases.set(caseId, next);
  return next;
}

export function addCaseMessage(input: {
  caseId: string;
  role: CaseMessageRecord["role"];
  content: string;
  hasImages?: boolean;
}): CaseMessageRecord {
  const row: CaseMessageRecord = {
    id: crypto.randomUUID(),
    caseId: input.caseId,
    role: input.role,
    content: input.content,
    hasImages: Boolean(input.hasImages),
    createdAt: nowIso(),
  };
  const list = messages.get(input.caseId) ?? [];
  list.push(row);
  messages.set(input.caseId, list);
  return row;
}

export function listCaseMessages(caseId: string): CaseMessageRecord[] {
  return [...(messages.get(caseId) ?? [])];
}

export function addCaseObservation(input: {
  caseId: string;
  observedFacts: string[];
  possibleCauses: string[];
  confidence: StructuredCaseFacts["confidence"];
  nextCheck?: string | null;
  recommendedAction?: string | null;
}): CaseObservationRecord {
  const row: CaseObservationRecord = {
    id: crypto.randomUUID(),
    caseId: input.caseId,
    observedFacts: input.observedFacts,
    possibleCauses: input.possibleCauses,
    confidence: input.confidence,
    nextCheck: input.nextCheck ?? null,
    recommendedAction: input.recommendedAction ?? null,
    createdAt: nowIso(),
  };
  const list = observations.get(input.caseId) ?? [];
  list.push(row);
  observations.set(input.caseId, list);
  return row;
}

export function addCasePhoto(input: {
  caseId: string;
  ownerUserId?: string | null;
  ownerSessionId?: string | null;
  storagePath: string;
  mimeType: string;
  fileSizeBytes: number;
}): CasePhotoRecord {
  const row: CasePhotoRecord = {
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
  const list = photos.get(input.caseId) ?? [];
  list.push(row);
  photos.set(input.caseId, list);
  return row;
}

export function listCasePhotos(caseId: string): CasePhotoRecord[] {
  return [...(photos.get(caseId) ?? [])];
}

export function canAccessPhoto(
  photo: CasePhotoRecord,
  owner: { userId?: string | null; anonymousSessionId?: string | null },
): boolean {
  if (owner.userId && photo.ownerUserId === owner.userId) return true;
  if (owner.anonymousSessionId && photo.ownerSessionId === owner.anonymousSessionId) {
    return true;
  }
  return false;
}

export function linkGuestCasesToUser(anonymousSessionId: string, userId: string): number {
  let linked = 0;
  for (const record of cases.values()) {
    if (record.anonymousSessionId === anonymousSessionId && !record.userId) {
      record.userId = userId;
      record.updatedAt = nowIso();
      cases.set(record.id, record);
      linked += 1;
    }
    const casePhotos = photos.get(record.id) ?? [];
    for (const photo of casePhotos) {
      if (photo.ownerSessionId === anonymousSessionId && !photo.ownerUserId) {
        photo.ownerUserId = userId;
      }
    }
  }
  return linked;
}

export function addCaseFollowup(input: Omit<CaseFollowupRecord, "id" | "createdAt">): CaseFollowupRecord {
  const row: CaseFollowupRecord = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: nowIso(),
  };
  const list = followups.get(input.caseId) ?? [];
  list.push(row);
  followups.set(input.caseId, list);
  return row;
}

export function recordFollowupOutcome(input: {
  followupId: string;
  outcome: FollowUpOutcome;
  actionTaken?: string | null;
  notes?: string | null;
  newSeverity?: StructuredCaseFacts["severity"] | null;
}): CaseFollowupRecord | null {
  for (const list of followups.values()) {
    const row = list.find((item) => item.id === input.followupId);
    if (!row) continue;
    row.outcome = input.outcome;
    row.actionTaken = input.actionTaken ?? row.actionTaken;
    row.notes = input.notes ?? row.notes;
    row.newSeverity = input.newSeverity ?? row.newSeverity;
    row.askedAt = nowIso();
    const outcome: CaseOutcomeRecord = {
      id: crypto.randomUUID(),
      caseId: row.caseId,
      outcome: input.outcome,
      notes: input.notes ?? null,
      createdAt: nowIso(),
    };
    const existing = outcomes.get(row.caseId) ?? [];
    existing.push(outcome);
    outcomes.set(row.caseId, existing);
    const cropCase = cases.get(row.caseId);
    if (cropCase && input.outcome === "problem_solved") {
      cropCase.caseStatus = "resolved";
      cropCase.updatedAt = nowIso();
    }
    return row;
  }
  return null;
}

export function optOutFollowups(caseId: string) {
  const list = followups.get(caseId) ?? [];
  for (const row of list) row.optedOut = true;
}

export function listFollowups(caseId?: string): CaseFollowupRecord[] {
  if (caseId) return [...(followups.get(caseId) ?? [])];
  return [...followups.values()].flat();
}

export function listOutcomes(caseId?: string): CaseOutcomeRecord[] {
  if (caseId) return [...(outcomes.get(caseId) ?? [])];
  return [...outcomes.values()].flat();
}

export function listObservations(caseId: string): CaseObservationRecord[] {
  return [...(observations.get(caseId) ?? [])];
}

export function hasActiveCase(owner: {
  userId?: string | null;
  anonymousSessionId?: string | null;
}): boolean {
  return casesForOwner(owner).some(
    (item) => item.caseStatus === "open" || item.caseStatus === "in_progress",
  );
}
