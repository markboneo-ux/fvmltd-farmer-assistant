import "server-only";

import { logOps } from "@/lib/security/ops-log";
import { tryCreateAdminClient } from "@/lib/supabase/helpers";
import type { AccessState } from "@/lib/beta/limits";
import {
  CasePersistenceError,
} from "./persistence";
import {
  actionToRow,
  assessmentToRow,
  cropCaseToRow,
  followupToRow,
  messageToRow,
  observationToRow,
  outcomeToRow,
  photoToRow,
  rowToAction,
  rowToAssessment,
  rowToCropCase,
  rowToFollowup,
  rowToMessage,
  rowToObservation,
  rowToOutcome,
  rowToPhoto,
} from "./map";
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

type QueryError = { message?: string } | null;

type QueryResult<T> = {
  data: T | null;
  error: QueryError;
};

export type CaseStoreQueryBuilder = {
  insert(values: Record<string, unknown> | Record<string, unknown>[]): CaseStoreQueryBuilder;
  update(values: Record<string, unknown>): CaseStoreQueryBuilder;
  select(columns?: string): CaseStoreQueryBuilder;
  eq(column: string, value: unknown): CaseStoreQueryBuilder;
  is(column: string, value: unknown): CaseStoreQueryBuilder;
  in(column: string, values: unknown[]): CaseStoreQueryBuilder;
  or(filters: string): CaseStoreQueryBuilder;
  order(column: string, options?: { ascending?: boolean }): CaseStoreQueryBuilder;
  single<T = Record<string, unknown>>(): Promise<QueryResult<T>>;
  maybeSingle<T = Record<string, unknown>>(): Promise<QueryResult<T | null>>;
  then<TResult1 = QueryResult<Record<string, unknown>[]>, TResult2 = never>(
    onfulfilled?:
      | ((value: QueryResult<Record<string, unknown>[]>) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2>;
};

export type CaseStoreAdminClient = {
  from(table: string): CaseStoreQueryBuilder;
};

let clientOverride: CaseStoreAdminClient | null = null;

export function setCaseStoreAdminClientForTests(client: CaseStoreAdminClient | null) {
  clientOverride = client;
}

function persistFail(table: string, message: string): never {
  logOps("database_failure", {
    table,
    error: message,
    backend: "supabase",
  });
  throw new CasePersistenceError("case_persistence_failed", table);
}

function adminClient(): CaseStoreAdminClient {
  if (clientOverride) return clientOverride;
  const created = tryCreateAdminClient();
  if (!created.ok) {
    persistFail("admin_client", created.error);
  }
  return created.client as unknown as CaseStoreAdminClient;
}

async function insertRow<T>(
  table: string,
  row: Record<string, unknown>,
  map: (value: Record<string, unknown>) => T,
): Promise<T> {
  const { data, error } = await adminClient()
    .from(table)
    .insert(row)
    .select("*")
    .single<Record<string, unknown>>();
  if (error || !data) {
    persistFail(table, error?.message ?? "insert failed");
  }
  return map(data);
}

async function updateRow<T>(
  table: string,
  id: string,
  patch: Record<string, unknown>,
  map: (value: Record<string, unknown>) => T,
): Promise<T> {
  const { data, error } = await adminClient()
    .from(table)
    .update(patch)
    .eq("id", id)
    .select("*")
    .single<Record<string, unknown>>();
  if (error || !data) {
    persistFail(table, error?.message ?? "update failed");
  }
  return map(data);
}

async function selectRows(
  table: string,
  configure: (builder: CaseStoreQueryBuilder) => CaseStoreQueryBuilder,
): Promise<Record<string, unknown>[]> {
  const { data, error } = await configure(adminClient().from(table).select("*"));
  if (error) persistFail(table, error.message ?? "select failed");
  return Array.isArray(data) ? data : data ? [data] : [];
}

export async function supabaseCreateCropCase(input: {
  userId?: string | null;
  anonymousSessionId?: string | null;
  accessState?: AccessState;
  message: string;
  profile?: { country?: string | null; district?: string | null } | null;
}): Promise<CropCaseRecord> {
  const record = buildNewCropCase(input);
  return insertRow("crop_cases", cropCaseToRow(record), rowToCropCase);
}

export async function supabaseGetCropCase(id: string): Promise<CropCaseRecord | null> {
  const { data, error } = await adminClient()
    .from("crop_cases")
    .select("*")
    .eq("id", id)
    .maybeSingle<Record<string, unknown>>();
  if (error) persistFail("crop_cases", error.message ?? "select failed");
  return data ? rowToCropCase(data) : null;
}

export async function supabaseListCropCases(): Promise<CropCaseRecord[]> {
  const rows = await selectRows("crop_cases", (builder) =>
    builder.order("created_at", { ascending: true }),
  );
  return rows.map(rowToCropCase);
}

export async function supabaseCasesForOwner(owner: {
  userId?: string | null;
  anonymousSessionId?: string | null;
}): Promise<CropCaseRecord[]> {
  let builder = adminClient().from("crop_cases").select("*");
  if (owner.userId && owner.anonymousSessionId) {
    builder = builder.or(
      `user_id.eq.${owner.userId},anonymous_session_id.eq.${owner.anonymousSessionId}`,
    );
  } else if (owner.userId) {
    builder = builder.eq("user_id", owner.userId);
  } else if (owner.anonymousSessionId) {
    builder = builder.eq("anonymous_session_id", owner.anonymousSessionId);
  } else {
    return [];
  }
  const { data, error } = await builder;
  if (error) persistFail("crop_cases", error.message ?? "select failed");
  const rows = Array.isArray(data) ? data : data ? [data] : [];
  return rows.map(rowToCropCase).filter((item) => caseIsOwnedBy(item, owner));
}

export async function supabaseAssertCaseOwned(
  caseId: string,
  owner: { userId?: string | null; anonymousSessionId?: string | null },
): Promise<CropCaseRecord | null> {
  const record = await supabaseGetCropCase(caseId);
  if (!record) return null;
  return caseIsOwnedBy(record, owner) ? record : null;
}

export async function supabaseUpdateCaseFromConversation(
  caseId: string,
  message: string,
  extras?: CaseUpdateExtras,
): Promise<CropCaseRecord | null> {
  const current = await supabaseGetCropCase(caseId);
  if (!current) return null;
  const next = mergeUpdatedCase(current, message, extras);
  return updateRow("crop_cases", caseId, cropCaseToRow(next), rowToCropCase);
}

export async function supabaseAddCaseMessage(input: {
  caseId: string;
  role: CaseMessageRecord["role"];
  content: string;
  hasImages?: boolean;
}): Promise<CaseMessageRecord> {
  const row = buildCaseMessage(input);
  return insertRow("case_messages", messageToRow(row), rowToMessage);
}

export async function supabaseListCaseMessages(caseId: string): Promise<CaseMessageRecord[]> {
  const rows = await selectRows("case_messages", (builder) =>
    builder.eq("case_id", caseId).order("created_at", { ascending: true }),
  );
  return rows.map(rowToMessage);
}

export async function supabaseAddCaseObservation(input: {
  caseId: string;
  observedFacts: string[];
  possibleCauses: string[];
  confidence: StructuredCaseFacts["confidence"];
  nextCheck?: string | null;
  recommendedAction?: string | null;
}): Promise<CaseObservationRecord> {
  const existing = await supabaseListObservations(input.caseId);
  const latest = existing[existing.length - 1];
  const row = buildCaseObservation(input);
  if (latest) {
    return updateRow(
      "case_observations",
      latest.id,
      {
        observed_facts: row.observedFacts,
        possible_causes: row.possibleCauses,
        confidence: row.confidence,
        next_check: row.nextCheck,
        recommended_action: row.recommendedAction,
      },
      rowToObservation,
    );
  }
  return insertRow("case_observations", observationToRow(row), rowToObservation);
}

export async function supabaseListObservations(caseId: string): Promise<CaseObservationRecord[]> {
  const rows = await selectRows("case_observations", (builder) =>
    builder.eq("case_id", caseId).order("created_at", { ascending: true }),
  );
  return rows.map(rowToObservation);
}

export async function supabaseAddCasePhoto(input: {
  caseId: string;
  ownerUserId?: string | null;
  ownerSessionId?: string | null;
  storagePath: string;
  mimeType: string;
  fileSizeBytes: number;
}): Promise<CasePhotoRecord> {
  const row = buildCasePhoto(input);
  return insertRow("case_photos", photoToRow(row), rowToPhoto);
}

export async function supabaseListCasePhotos(caseId: string): Promise<CasePhotoRecord[]> {
  const rows = await selectRows("case_photos", (builder) =>
    builder.eq("case_id", caseId).order("created_at", { ascending: true }),
  );
  return rows.map(rowToPhoto);
}

export async function supabaseLinkGuestCasesToUser(
  anonymousSessionId: string,
  userId: string,
): Promise<number> {
  const owned = await supabaseCasesForOwner({ anonymousSessionId });
  let linked = 0;
  const updatedAt = nowIso();
  for (const record of owned) {
    if (record.userId) continue;
    await updateRow(
      "crop_cases",
      record.id,
      { user_id: userId, updated_at: updatedAt },
      rowToCropCase,
    );
    linked += 1;
  }

  const photos = await selectRows("case_photos", (builder) =>
    builder.eq("owner_session_id", anonymousSessionId).is("owner_user_id", null),
  );
  for (const photo of photos) {
    const id = typeof photo.id === "string" ? photo.id : "";
    if (!id) continue;
    await updateRow("case_photos", id, { owner_user_id: userId }, rowToPhoto);
  }
  return linked;
}

export async function supabaseAddCaseFollowup(
  input: Omit<CaseFollowupRecord, "id" | "createdAt">,
): Promise<CaseFollowupRecord> {
  const row = buildCaseFollowup(input);
  return insertRow("case_followups", followupToRow(row), rowToFollowup);
}

export async function supabaseRecordFollowupOutcome(input: {
  followupId: string;
  outcome: FollowUpOutcome;
  actionTaken?: string | null;
  notes?: string | null;
  newSeverity?: StructuredCaseFacts["severity"] | null;
}): Promise<CaseFollowupRecord | null> {
  const { data, error } = await adminClient()
    .from("case_followups")
    .select("*")
    .eq("id", input.followupId)
    .maybeSingle<Record<string, unknown>>();
  if (error) persistFail("case_followups", error.message ?? "select failed");
  if (!data) return null;

  const askedAt = nowIso();
  const updated = await updateRow(
    "case_followups",
    input.followupId,
    {
      outcome: input.outcome,
      action_taken: input.actionTaken ?? data.action_taken ?? null,
      notes: input.notes ?? data.notes ?? null,
      new_severity: input.newSeverity ?? data.new_severity ?? null,
      asked_at: askedAt,
    },
    rowToFollowup,
  );

  const outcome = buildCaseOutcome({
    caseId: updated.caseId,
    outcome: input.outcome,
    notes: input.notes ?? null,
  });
  await insertRow("case_outcomes", outcomeToRow(outcome), rowToOutcome);

  if (input.outcome === "problem_solved") {
    await updateRow(
      "crop_cases",
      updated.caseId,
      { case_status: "resolved", updated_at: nowIso() },
      rowToCropCase,
    );
  }
  return updated;
}

export async function supabaseOptOutFollowups(caseId: string) {
  const existing = await supabaseListFollowups(caseId);
  for (const row of existing) {
    if (row.optedOut) continue;
    await updateRow("case_followups", row.id, { opted_out: true }, rowToFollowup);
  }
}

export async function supabaseListFollowups(caseId?: string): Promise<CaseFollowupRecord[]> {
  const rows = await selectRows("case_followups", (builder) =>
    caseId
      ? builder.eq("case_id", caseId).order("created_at", { ascending: true })
      : builder.order("created_at", { ascending: true }),
  );
  return rows.map(rowToFollowup);
}

export async function supabaseListOutcomes(caseId?: string): Promise<CaseOutcomeRecord[]> {
  const rows = await selectRows("case_outcomes", (builder) =>
    caseId
      ? builder.eq("case_id", caseId).order("created_at", { ascending: true })
      : builder.order("created_at", { ascending: true }),
  );
  return rows.map(rowToOutcome);
}

export async function supabaseAddCaseAssessment(input: {
  caseId: string;
  payload: Record<string, unknown>;
}): Promise<CaseAssessmentRecord> {
  const row = buildCaseAssessment(input);
  return insertRow("case_assessments", assessmentToRow(row), rowToAssessment);
}

export async function supabaseAddCaseAction(input: {
  caseId: string;
  actionText: string;
}): Promise<CaseActionRecord> {
  const row = buildCaseAction(input);
  return insertRow("case_actions", actionToRow(row), rowToAction);
}

export async function supabaseListCaseAssessments(caseId: string): Promise<CaseAssessmentRecord[]> {
  const rows = await selectRows("case_assessments", (builder) =>
    builder.eq("case_id", caseId).order("created_at", { ascending: true }),
  );
  return rows.map(rowToAssessment);
}

export async function supabaseListCaseActions(caseId: string): Promise<CaseActionRecord[]> {
  const rows = await selectRows("case_actions", (builder) =>
    builder.eq("case_id", caseId).order("created_at", { ascending: true }),
  );
  return rows.map(rowToAction);
}

export async function supabaseHasActiveCase(owner: {
  userId?: string | null;
  anonymousSessionId?: string | null;
}): Promise<boolean> {
  const owned = await supabaseCasesForOwner(owner);
  return owned.some((item) => item.caseStatus === "open" || item.caseStatus === "in_progress");
}
