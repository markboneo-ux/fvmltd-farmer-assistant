import type { AgronomicCasePayload } from "@/lib/agronomy/case-schema";
import type { CaseChatMessage } from "@/lib/agronomy/runCase";
import { farmerLevelToUserLevel } from "@/lib/assistant/farmer-context";
import {
  resolveConversationIntent,
  shouldStartNewCase,
} from "@/lib/assistant/intents";
import { getSimilarCases } from "@/lib/cases/similar";
import {
  addCaseAction,
  addCaseAssessment,
  appendCaseMessage,
  addCaseObservation,
  addCasePhoto,
  CasePersistenceError,
  assertCaseOwned,
  createCropCase,
  findActiveCropCaseForOwner,
  getCropCase,
  hasActiveCase,
  listCaseMessages,
  logCasePersistenceBackend,
  logCasePersistenceStart,
  updateCaseFromConversation,
} from "@/lib/cases/store";
import { addCaseFollowupSafe } from "@/lib/cases/followup-helpers";
import { ingestCaseForTrends, relevantTrendHint } from "@/lib/trends/ingest";
import { logCasePersistenceError } from "@/lib/cases/persistence";
import type { CropCaseRecord } from "@/lib/cases/types";
import { logOps } from "@/lib/security/ops-log";
import { logStageFailure } from "@/lib/errors/correlation";
import type { AppIdentity } from "./identity";
import { evaluateUsage, type UsageDecision } from "./limits";
import { countUsage, recordUsageEvent } from "./usage-store";

export type ConversationGate = UsageDecision & {
  used: ReturnType<typeof countUsage>;
};

export async function evaluateConversationGate(options: {
  identity: AppIdentity;
  next: "message" | "case" | "image_analysis";
}): Promise<ConversationGate> {
  const used = countUsage({
    guestSessionId: options.identity.guestSessionId,
    authUserId: options.identity.authUserId,
  });
  const activeCaseInProgress = await hasActiveCase({
    userId: options.identity.authUserId,
    anonymousSessionId: options.identity.guestSessionId,
  });
  const decision = evaluateUsage({
    access: options.identity.access,
    used,
    next: options.next,
    activeCaseInProgress,
  });
  return { ...decision, used };
}

export async function loadPersistedConversationHistory(
  caseId: string | null | undefined,
  currentMessage?: string,
): Promise<CaseChatMessage[] | null> {
  if (!caseId) return null;
  const stored = await listCaseMessages(caseId);
  if (stored.length === 0) return null;
  const history: CaseChatMessage[] = stored
    .filter((item): item is typeof item & { role: "user" | "assistant" } =>
      item.role === "user" || item.role === "assistant",
    )
    .map((item) => ({
      role: item.role,
      content: item.content,
    }));
  if (
    currentMessage &&
    history.at(-1)?.role === "user" &&
    history.at(-1)?.content === currentMessage
  ) {
    return history.slice(0, -1);
  }
  return history;
}

export async function resolveContinuingCropCase(options: {
  identity: AppIdentity;
  requestedCaseId?: string | null;
}): Promise<string | null> {
  const owner = {
    userId: options.identity.authUserId,
    anonymousSessionId: options.identity.guestSessionId,
  };
  const requested = options.requestedCaseId?.trim() || null;
  if (requested) {
    const owned = await assertCaseOwned(requested, owner);
    if (owned) return owned.id;
  }
  const active = await findActiveCropCaseForOwner(owner);
  return active?.id ?? null;
}

/**
 * Core chat save is crop_cases create/reuse + case_messages.
 * Follow-ups, trends, observations, and metadata updates are enrichment:
 * they must not mark a saved chat as failed.
 */
export async function persistConversationTurn(options: {
  identity: AppIdentity;
  caseId?: string | null;
  userMessage: string;
  assistantText: string;
  payload?: AgronomicCasePayload | null;
  imageCount?: number;
  profile?: { country?: string | null; district?: string | null } | null;
  correlationId?: string;
}): Promise<{ caseId: string; createdNewCase: boolean }> {
  logCasePersistenceStart();
  logCasePersistenceBackend();
  const { identity } = options;
  let createdNewCase = false;
  const continuingId = await resolveContinuingCropCase({
    identity,
    requestedCaseId: options.caseId,
  });
  let record = continuingId ? await getCropCase(continuingId) : null;
  if (
    record &&
    shouldStartNewCase({
      message: options.userMessage,
      activeCrop: record.crop,
      activeIntent: record.conversationIntent,
    })
  ) {
    record = null;
  }
  const classified = record
    ? resolveConversationIntent({
        message: options.userMessage,
        activeIntent: record.conversationIntent,
        activeCrop: record.crop,
      })
    : resolveConversationIntent({
        message: options.userMessage,
        activeIntent: options.payload?.intent ?? null,
      });

  if (!record) {
    record = await createCropCase({
      userId: identity.authUserId,
      anonymousSessionId: identity.guestSessionId,
      accessState: identity.access,
      message: options.userMessage,
      profile: options.profile,
    });
    createdNewCase = true;
    recordUsageEvent({
      guestSessionId: identity.guestSessionId,
      authUserId: identity.authUserId,
      kind: "case",
      caseId: record.id,
    });
  }

  await appendCaseMessage({
    caseId: record.id,
    role: "user",
    content: options.userMessage,
    hasImages: (options.imageCount ?? 0) > 0,
  });
  await appendCaseMessage({
    caseId: record.id,
    role: "assistant",
    content: options.assistantText,
  });

  recordUsageEvent({
    guestSessionId: identity.guestSessionId,
    authUserId: identity.authUserId,
    kind: "message",
    caseId: record.id,
  });
  if ((options.imageCount ?? 0) > 0) {
    recordUsageEvent({
      guestSessionId: identity.guestSessionId,
      authUserId: identity.authUserId,
      kind: "image_analysis",
      caseId: record.id,
    });
  }

  await persistConversationEnrichment({
    record,
    classified,
    options,
  });

  return { caseId: record.id, createdNewCase };
}

async function persistConversationEnrichment(input: {
  record: CropCaseRecord;
  classified: ReturnType<typeof resolveConversationIntent>;
  options: {
    userMessage: string;
    payload?: AgronomicCasePayload | null;
    correlationId?: string;
  };
}) {
  const { record, options, classified } = input;
  try {
    await updateCaseFromConversation(record.id, options.userMessage, {
      productsRequested:
        record.productsRequested || Boolean(options.payload?.verifiedInputOptions.length),
      verifiedProductsShown: (options.payload?.verifiedInputOptions ?? []).map(
        (item) => item.activeIngredientOrNutrient,
      ),
      humanEscalation: Boolean(options.payload?.escalationRecommended),
      severity: options.payload?.severity ?? record.severity,
      possibleCauses:
        options.payload?.likelyCauses ??
        options.payload?.checksToday ??
        record.possibleCauses,
      recommendedActions: options.payload?.safeActionsNow ?? record.recommendedActions,
      userLevel:
        farmerLevelToUserLevel(options.payload?.farmerLevel ?? null) ?? record.userLevel,
      caseStatus: options.payload?.escalationRecommended
        ? "human_review"
        : options.payload?.stage === "resolved"
          ? "resolved"
          : "in_progress",
      conversationIntent: classified.intent,
      questionCategory: classified.questionCategory,
      calculationType: classified.calculationType,
      caseType: classified.caseType,
      businessMetadata: {
        ...(record.businessMetadata ?? {}),
        locationConfidence: options.payload?.locationConfidence ?? null,
      },
    });

    if (options.payload) {
      await addCaseObservation({
        caseId: record.id,
        observedFacts: [options.userMessage],
        possibleCauses: options.payload.likelyCauses?.length
          ? options.payload.likelyCauses
          : options.payload.checksToday,
        confidence:
          options.payload.severity === "high"
            ? "medium"
            : options.payload.severity === "low"
              ? "low"
              : "unknown",
        nextCheck: options.payload.nextQuestion || options.payload.checksToday[0] || null,
        recommendedAction: options.payload.safeActionsNow[0] || null,
      });
      await addCaseAssessment({
        caseId: record.id,
        payload: { ...options.payload } as Record<string, unknown>,
      });
      for (const actionText of options.payload.safeActionsNow) {
        if (!actionText.trim()) continue;
        await addCaseAction({ caseId: record.id, actionText });
      }
    }

    const latest = await getCropCase(record.id);
    if (latest && !latest.humanEscalation) {
      await addCaseFollowupSafe(latest);
    }
    if (latest) {
      await ingestCaseForTrends(latest);
    }
  } catch (error) {
    const table = error instanceof CasePersistenceError ? error.table : "enrichment";
    logCasePersistenceError(error, table);
    logOps("database_failure", {
      error: error instanceof Error ? error.message : String(error),
      table,
      stage: "chat_enrichment",
      correlationId: options.correlationId ?? null,
    });
    logStageFailure({
      correlationId: options.correlationId ?? "unknown",
      route: "ai/case",
      stage: "chat_enrichment",
      externalService: "supabase",
      errorType: error instanceof Error ? error.name : "Error",
      message: error instanceof Error ? error.message : String(error),
      table,
    });
  }
}

export async function similarCaseHint(caseId: string): Promise<string | null> {
  try {
    const record = await getCropCase(caseId);
    if (!record) return null;
    const matches = (
      await getSimilarCases(
        {
          country: record.country,
          district: record.district,
          crop: record.crop,
          variety: record.variety,
          symptoms: record.symptoms,
          problemCategory: record.problemCategory,
          productionSystem: record.productionSystem,
          weatherContext: record.weatherRisk,
        },
        3,
      )
    ).filter((item) => item.caseId !== caseId);
    const trendHint = await relevantTrendHint({
      crop: record.crop,
      region: record.district,
      country: record.country,
      symptoms: record.symptoms,
      suspectedIssue: record.problemCategory,
    });
    return trendHint ?? matches[0]?.farmerFacingSummary ?? null;
  } catch (error) {
    logCasePersistenceError(error, "similar_cases");
    return null;
  }
}

export async function recordCasePhoto(options: {
  caseId: string;
  identity: AppIdentity;
  storagePath: string;
  mimeType: string;
  fileSizeBytes: number;
}) {
  return addCasePhoto({
    caseId: options.caseId,
    ownerUserId: options.identity.authUserId,
    ownerSessionId: options.identity.guestSessionId,
    storagePath: options.storagePath,
    mimeType: options.mimeType,
    fileSizeBytes: options.fileSizeBytes,
  });
}

export { CasePersistenceError };
