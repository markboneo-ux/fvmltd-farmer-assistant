import type { AgronomicCasePayload } from "@/lib/agronomy/case-schema";
import { getSimilarCases } from "@/lib/cases/similar";
import {
  addCaseMessage,
  addCaseObservation,
  addCasePhoto,
  createCropCase,
  getCropCase,
  hasActiveCase,
  updateCaseFromConversation,
} from "@/lib/cases/store";
import { addCaseFollowupSafe } from "@/lib/cases/followup-helpers";
import type { AppIdentity } from "./identity";
import { evaluateUsage, type UsageDecision } from "./limits";
import { countUsage, recordUsageEvent } from "./usage-store";

export type ConversationGate = UsageDecision & {
  used: ReturnType<typeof countUsage>;
};

export function evaluateConversationGate(options: {
  identity: AppIdentity;
  next: "message" | "case" | "image_analysis";
}): ConversationGate {
  const used = countUsage({
    guestSessionId: options.identity.guestSessionId,
    authUserId: options.identity.authUserId,
  });
  const activeCaseInProgress = hasActiveCase({
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

export function persistConversationTurn(options: {
  identity: AppIdentity;
  caseId?: string | null;
  userMessage: string;
  assistantText: string;
  payload?: AgronomicCasePayload | null;
  imageCount?: number;
  profile?: { country?: string | null; district?: string | null } | null;
}): { caseId: string; createdNewCase: boolean } {
  const { identity } = options;
  let createdNewCase = false;
  let record = options.caseId ? getCropCase(options.caseId) : null;

  if (!record) {
    record = createCropCase({
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
  } else {
    updateCaseFromConversation(record.id, options.userMessage, {
      productsRequested:
        record.productsRequested || Boolean(options.payload?.verifiedInputOptions.length),
      verifiedProductsShown: (options.payload?.verifiedInputOptions ?? []).map(
        (item) => item.activeIngredientOrNutrient,
      ),
      humanEscalation: Boolean(options.payload?.escalationRecommended),
      severity: options.payload?.severity ?? record.severity,
      possibleCauses: options.payload?.checksToday ?? record.possibleCauses,
      recommendedActions: options.payload?.safeActionsNow ?? record.recommendedActions,
      caseStatus: options.payload?.escalationRecommended
        ? "human_review"
        : options.payload?.stage === "resolved"
          ? "resolved"
          : "in_progress",
    });
  }

  addCaseMessage({
    caseId: record.id,
    role: "user",
    content: options.userMessage,
    hasImages: (options.imageCount ?? 0) > 0,
  });
  addCaseMessage({
    caseId: record.id,
    role: "assistant",
    content: options.assistantText,
  });

  if (options.payload) {
    addCaseObservation({
      caseId: record.id,
      observedFacts: [options.userMessage],
      possibleCauses: options.payload.checksToday,
      confidence:
        options.payload.severity === "high"
          ? "medium"
          : options.payload.severity === "low"
            ? "low"
            : "unknown",
      nextCheck: options.payload.nextQuestion || options.payload.checksToday[0] || null,
      recommendedAction: options.payload.safeActionsNow[0] || null,
    });
  }

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

  const latest = getCropCase(record.id);
  if (latest && !latest.humanEscalation) {
    addCaseFollowupSafe(latest);
  }

  return { caseId: record.id, createdNewCase };
}

export function similarCaseHint(caseId: string): string | null {
  const record = getCropCase(caseId);
  if (!record) return null;
  const matches = getSimilarCases(
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
  ).filter((item) => item.caseId !== caseId);
  return matches[0]?.farmerFacingSummary ?? null;
}

export function recordCasePhoto(options: {
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
