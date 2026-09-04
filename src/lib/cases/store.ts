import "server-only";

import type { AccessState } from "@/lib/beta/limits";
import {
  assertSupabasePersistenceOrThrow,
  logCaseCreated,
  logCaseMessageSaved,
} from "./persistence";
import {
  caseIsOwnedBy,
  type CaseUpdateExtras,
} from "./records";
import * as memory from "./memory-store";
import * as supabase from "./supabase-store";
import { resetMemoryTrends } from "@/lib/trends/store";
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

export { CasePersistenceError } from "./persistence";
export {
  logCaseCreated,
  logCaseMessageSaved,
  logCasePersistenceBackend,
  logCasePersistenceError,
  logCasePersistenceStart,
  logCasePersistenceSupabase,
  resolveCasePersistenceMode,
  setCasePersistenceModeForTests,
} from "./persistence";
export { setCaseStoreAdminClientForTests } from "./supabase-store";

function isMemoryBackend() {
  return assertSupabasePersistenceOrThrow() === "memory";
}

export function resetCaseStore() {
  memory.resetMemoryCaseStore();
  resetMemoryTrends();
}

export async function createCropCase(input: {
  userId?: string | null;
  anonymousSessionId?: string | null;
  accessState?: AccessState;
  message: string;
  profile?: { country?: string | null; district?: string | null } | null;
}): Promise<CropCaseRecord> {
  const record = isMemoryBackend()
    ? memory.memoryCreateCropCase(input)
    : await supabase.supabaseCreateCropCase(input);
  logCaseCreated(record.id);
  return record;
}

export async function getCropCase(id: string): Promise<CropCaseRecord | null> {
  if (isMemoryBackend()) return memory.memoryGetCropCase(id);
  return supabase.supabaseGetCropCase(id);
}

export async function listCropCases(): Promise<CropCaseRecord[]> {
  if (isMemoryBackend()) return memory.memoryListCropCases();
  return supabase.supabaseListCropCases();
}

export async function casesForOwner(owner: {
  userId?: string | null;
  anonymousSessionId?: string | null;
}): Promise<CropCaseRecord[]> {
  if (isMemoryBackend()) return memory.memoryCasesForOwner(owner);
  return supabase.supabaseCasesForOwner(owner);
}

export async function assertCaseOwned(
  caseId: string,
  owner: { userId?: string | null; anonymousSessionId?: string | null },
): Promise<CropCaseRecord | null> {
  if (isMemoryBackend()) return memory.memoryAssertCaseOwned(caseId, owner);
  return supabase.supabaseAssertCaseOwned(caseId, owner);
}

export async function updateCaseFromConversation(
  caseId: string,
  message: string,
  extras?: CaseUpdateExtras,
): Promise<CropCaseRecord | null> {
  if (isMemoryBackend()) return memory.memoryUpdateCaseFromConversation(caseId, message, extras);
  return supabase.supabaseUpdateCaseFromConversation(caseId, message, extras);
}

export async function appendCaseMessage(input: {
  caseId: string;
  role: CaseMessageRecord["role"];
  content: string;
  hasImages?: boolean;
}): Promise<CaseMessageRecord> {
  const record = isMemoryBackend()
    ? memory.memoryAddCaseMessage(input)
    : await supabase.supabaseAddCaseMessage(input);
  logCaseMessageSaved(record.caseId, record.role);
  return record;
}

/** @deprecated Use appendCaseMessage — kept for existing call sites. */
export async function addCaseMessage(input: {
  caseId: string;
  role: CaseMessageRecord["role"];
  content: string;
  hasImages?: boolean;
}): Promise<CaseMessageRecord> {
  return appendCaseMessage(input);
}

export async function listCaseMessages(caseId: string): Promise<CaseMessageRecord[]> {
  if (isMemoryBackend()) return memory.memoryListCaseMessages(caseId);
  return supabase.supabaseListCaseMessages(caseId);
}

export async function addCaseObservation(input: {
  caseId: string;
  observedFacts: string[];
  possibleCauses: string[];
  confidence: StructuredCaseFacts["confidence"];
  nextCheck?: string | null;
  recommendedAction?: string | null;
}): Promise<CaseObservationRecord> {
  if (isMemoryBackend()) return memory.memoryAddCaseObservation(input);
  return supabase.supabaseAddCaseObservation(input);
}

export async function addCasePhoto(input: {
  caseId: string;
  ownerUserId?: string | null;
  ownerSessionId?: string | null;
  storagePath: string;
  mimeType: string;
  fileSizeBytes: number;
}): Promise<CasePhotoRecord> {
  if (isMemoryBackend()) return memory.memoryAddCasePhoto(input);
  return supabase.supabaseAddCasePhoto(input);
}

export async function listCasePhotos(caseId: string): Promise<CasePhotoRecord[]> {
  if (isMemoryBackend()) return memory.memoryListCasePhotos(caseId);
  return supabase.supabaseListCasePhotos(caseId);
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

export async function linkGuestCasesToUser(
  anonymousSessionId: string,
  userId: string,
): Promise<number> {
  if (isMemoryBackend()) return memory.memoryLinkGuestCasesToUser(anonymousSessionId, userId);
  return supabase.supabaseLinkGuestCasesToUser(anonymousSessionId, userId);
}

export async function addCaseFollowup(
  input: Omit<CaseFollowupRecord, "id" | "createdAt">,
): Promise<CaseFollowupRecord> {
  if (isMemoryBackend()) return memory.memoryAddCaseFollowup(input);
  return supabase.supabaseAddCaseFollowup(input);
}

export async function recordFollowupOutcome(input: {
  followupId: string;
  outcome: FollowUpOutcome;
  actionTaken?: string | null;
  notes?: string | null;
  newSeverity?: StructuredCaseFacts["severity"] | null;
}): Promise<CaseFollowupRecord | null> {
  if (isMemoryBackend()) return memory.memoryRecordFollowupOutcome(input);
  return supabase.supabaseRecordFollowupOutcome(input);
}

export async function optOutFollowups(caseId: string) {
  if (isMemoryBackend()) return memory.memoryOptOutFollowups(caseId);
  return supabase.supabaseOptOutFollowups(caseId);
}

export async function listFollowups(caseId?: string): Promise<CaseFollowupRecord[]> {
  if (isMemoryBackend()) return memory.memoryListFollowups(caseId);
  return supabase.supabaseListFollowups(caseId);
}

export async function listOutcomes(caseId?: string): Promise<CaseOutcomeRecord[]> {
  if (isMemoryBackend()) return memory.memoryListOutcomes(caseId);
  return supabase.supabaseListOutcomes(caseId);
}

export async function listObservations(caseId: string): Promise<CaseObservationRecord[]> {
  if (isMemoryBackend()) return memory.memoryListObservations(caseId);
  return supabase.supabaseListObservations(caseId);
}

export async function addCaseAssessment(input: {
  caseId: string;
  payload: Record<string, unknown>;
}): Promise<CaseAssessmentRecord> {
  if (isMemoryBackend()) return memory.memoryAddCaseAssessment(input);
  return supabase.supabaseAddCaseAssessment(input);
}

export async function addCaseAction(input: {
  caseId: string;
  actionText: string;
}): Promise<CaseActionRecord> {
  if (isMemoryBackend()) return memory.memoryAddCaseAction(input);
  return supabase.supabaseAddCaseAction(input);
}

export async function listCaseAssessments(caseId: string): Promise<CaseAssessmentRecord[]> {
  if (isMemoryBackend()) return memory.memoryListCaseAssessments(caseId);
  return supabase.supabaseListCaseAssessments(caseId);
}

export async function listCaseActions(caseId: string): Promise<CaseActionRecord[]> {
  if (isMemoryBackend()) return memory.memoryListCaseActions(caseId);
  return supabase.supabaseListCaseActions(caseId);
}

export async function hasActiveCase(owner: {
  userId?: string | null;
  anonymousSessionId?: string | null;
}): Promise<boolean> {
  if (isMemoryBackend()) return memory.memoryHasActiveCase(owner);
  return supabase.supabaseHasActiveCase(owner);
}

export async function findActiveCropCaseForOwner(owner: {
  userId?: string | null;
  anonymousSessionId?: string | null;
}): Promise<CropCaseRecord | null> {
  const owned = await casesForOwner(owner);
  const active = owned
    .filter((item) => item.caseStatus === "open" || item.caseStatus === "in_progress")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return active[0] ?? null;
}

export { caseIsOwnedBy };
