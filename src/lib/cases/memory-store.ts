import type { AccessState } from "@/lib/beta/limits";
import {
  buildCaseAction,
  buildCaseAssessment,
  buildCaseFollowup,
  buildCaseMessage,
  buildCaseObservation,
  buildCaseOutcome,
  buildCasePhoto,
  buildNewCropCase,
  caseIsOwnedBy,
  mergeUpdatedCase,
  nowIso,
  applyCaseReview,
  type CaseUpdateExtras,
} from "./records";
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

const cases = new Map<string, CropCaseRecord>();
const messages = new Map<string, CaseMessageRecord[]>();
const observations = new Map<string, CaseObservationRecord[]>();
const photos = new Map<string, CasePhotoRecord[]>();
const followups = new Map<string, CaseFollowupRecord[]>();
const outcomes = new Map<string, CaseOutcomeRecord[]>();
const assessments = new Map<string, CaseAssessmentRecord[]>();
const actions = new Map<string, CaseActionRecord[]>();

export function resetMemoryCaseStore() {
  cases.clear();
  messages.clear();
  observations.clear();
  photos.clear();
  followups.clear();
  outcomes.clear();
  assessments.clear();
  actions.clear();
}

export function memoryCreateCropCase(input: {
  userId?: string | null;
  anonymousSessionId?: string | null;
  accessState?: AccessState;
  message: string;
  profile?: { country?: string | null; district?: string | null } | null;
}): CropCaseRecord {
  const record = buildNewCropCase(input);
  cases.set(record.id, record);
  messages.set(record.id, []);
  observations.set(record.id, []);
  photos.set(record.id, []);
  followups.set(record.id, []);
  outcomes.set(record.id, []);
  assessments.set(record.id, []);
  actions.set(record.id, []);
  return record;
}

export function memoryGetCropCase(id: string): CropCaseRecord | null {
  return cases.get(id) ?? null;
}

export function memoryListCropCases(): CropCaseRecord[] {
  return [...cases.values()];
}

export function memoryCasesForOwner(owner: {
  userId?: string | null;
  anonymousSessionId?: string | null;
}): CropCaseRecord[] {
  return memoryListCropCases().filter((item) => caseIsOwnedBy(item, owner));
}

export function memoryAssertCaseOwned(
  caseId: string,
  owner: { userId?: string | null; anonymousSessionId?: string | null },
): CropCaseRecord | null {
  const record = memoryGetCropCase(caseId);
  if (!record) return null;
  return caseIsOwnedBy(record, owner) ? record : null;
}

export function memoryUpdateCaseFromConversation(
  caseId: string,
  message: string,
  extras?: CaseUpdateExtras,
): CropCaseRecord | null {
  const current = memoryGetCropCase(caseId);
  if (!current) return null;
  const next = mergeUpdatedCase(current, message, extras);
  cases.set(caseId, next);
  return next;
}

export function memoryAddCaseMessage(input: {
  caseId: string;
  role: CaseMessageRecord["role"];
  content: string;
  hasImages?: boolean;
}): CaseMessageRecord {
  const row = buildCaseMessage(input);
  const list = messages.get(input.caseId) ?? [];
  list.push(row);
  messages.set(input.caseId, list);
  return row;
}

export function memoryListCaseMessages(caseId: string): CaseMessageRecord[] {
  return [...(messages.get(caseId) ?? [])];
}

export function memoryListAllCaseMessages(): CaseMessageRecord[] {
  return [...messages.values()].flat();
}

export function memoryListAllCasePhotos(): CasePhotoRecord[] {
  return [...photos.values()].flat();
}

export function memoryUpdateCaseReview(
  caseId: string,
  review: Parameters<typeof applyCaseReview>[1],
): CropCaseRecord | null {
  const current = memoryGetCropCase(caseId);
  if (!current) return null;
  const next = applyCaseReview(current, review);
  cases.set(caseId, next);
  return next;
}

export function memoryAddCaseObservation(input: {
  caseId: string;
  observedFacts: string[];
  possibleCauses: string[];
  confidence: StructuredCaseFacts["confidence"];
  nextCheck?: string | null;
  recommendedAction?: string | null;
}): CaseObservationRecord {
  const row = buildCaseObservation(input);
  const list = observations.get(input.caseId) ?? [];
  const existing = list[list.length - 1];
  if (existing) {
    const updated: CaseObservationRecord = {
      ...existing,
      observedFacts: row.observedFacts,
      possibleCauses: row.possibleCauses,
      confidence: row.confidence,
      nextCheck: row.nextCheck,
      recommendedAction: row.recommendedAction,
    };
    list[list.length - 1] = updated;
    observations.set(input.caseId, list);
    return updated;
  }
  list.push(row);
  observations.set(input.caseId, list);
  return row;
}

export function memoryAddCasePhoto(input: {
  caseId: string;
  ownerUserId?: string | null;
  ownerSessionId?: string | null;
  storagePath: string;
  mimeType: string;
  fileSizeBytes: number;
}): CasePhotoRecord {
  const row = buildCasePhoto(input);
  const list = photos.get(input.caseId) ?? [];
  list.push(row);
  photos.set(input.caseId, list);
  return row;
}

export function memoryListCasePhotos(caseId: string): CasePhotoRecord[] {
  return [...(photos.get(caseId) ?? [])];
}

export function memoryLinkGuestCasesToUser(anonymousSessionId: string, userId: string): number {
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

export function memoryAddCaseFollowup(
  input: Omit<CaseFollowupRecord, "id" | "createdAt">,
): CaseFollowupRecord {
  const row = buildCaseFollowup(input);
  const list = followups.get(input.caseId) ?? [];
  list.push(row);
  followups.set(input.caseId, list);
  return row;
}

export function memoryRecordFollowupOutcome(input: {
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
    const outcome = buildCaseOutcome({
      caseId: row.caseId,
      outcome: input.outcome,
      notes: input.notes ?? null,
    });
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

export function memoryOptOutFollowups(caseId: string) {
  const list = followups.get(caseId) ?? [];
  for (const row of list) row.optedOut = true;
}

export function memoryListFollowups(caseId?: string): CaseFollowupRecord[] {
  if (caseId) return [...(followups.get(caseId) ?? [])];
  return [...followups.values()].flat();
}

export function memoryListOutcomes(caseId?: string): CaseOutcomeRecord[] {
  if (caseId) return [...(outcomes.get(caseId) ?? [])];
  return [...outcomes.values()].flat();
}

export function memoryListObservations(caseId: string): CaseObservationRecord[] {
  return [...(observations.get(caseId) ?? [])];
}

export function memoryAddCaseAssessment(input: {
  caseId: string;
  payload: Record<string, unknown>;
}): CaseAssessmentRecord {
  const row = buildCaseAssessment(input);
  const list = assessments.get(input.caseId) ?? [];
  list.push(row);
  assessments.set(input.caseId, list);
  return row;
}

export function memoryAddCaseAction(input: {
  caseId: string;
  actionText: string;
}): CaseActionRecord {
  const row = buildCaseAction(input);
  const list = actions.get(input.caseId) ?? [];
  list.push(row);
  actions.set(input.caseId, list);
  return row;
}

export function memoryListCaseAssessments(caseId: string): CaseAssessmentRecord[] {
  return [...(assessments.get(caseId) ?? [])];
}

export function memoryListCaseActions(caseId: string): CaseActionRecord[] {
  return [...(actions.get(caseId) ?? [])];
}

export function memoryHasActiveCase(owner: {
  userId?: string | null;
  anonymousSessionId?: string | null;
}): boolean {
  return memoryCasesForOwner(owner).some(
    (item) => item.caseStatus === "open" || item.caseStatus === "in_progress",
  );
}
