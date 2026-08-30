import type { AgronomicCasePayload } from "@/lib/agronomy/case-schema";
import type { KnownFarmerFacts } from "@/lib/agronomy/tomato-protocol";
import type { AgronomyCaseRecord } from "./types";

export function followUpDueFromNow(days = 7): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

export function mapTurnToCasePatch(input: {
  sessionId: string;
  farmerId?: string | null;
  farm?: string | null;
  facts: KnownFarmerFacts;
  payload: AgronomicCasePayload;
  farmerMessage: string;
  photoCount?: number;
  existingId?: string | null;
}): Partial<AgronomyCaseRecord> & { sessionId: string } {
  const scheduleFollowUp =
    input.payload.checksToday.length > 0 ||
    input.payload.safeActionsNow.length > 0 ||
    input.payload.stage === "assessment" ||
    input.payload.stage === "action_plan" ||
    input.payload.stage === "human_review";

  return {
    id: input.existingId ?? undefined,
    sessionId: input.sessionId,
    farmerId: input.farmerId ?? null,
    farm: input.farm ?? null,
    country: input.facts.country,
    district: input.facts.district,
    crop: input.facts.crop,
    variety: input.facts.variety,
    plantAge: input.facts.plantAge,
    productionSystem: input.facts.productionSystem,
    farmerScale: input.facts.farmerScale,
    areaPlanted: input.facts.areaPlanted,
    problemReported: input.facts.suspectedIssue || input.farmerMessage.slice(0, 240),
    symptoms: input.facts.suspectedIssue || input.farmerMessage.slice(0, 240),
    fieldDistribution: input.facts.distributionHint,
    photoCount: input.photoCount ?? 0,
    suspectedCauses: input.payload.preliminaryAssessment.slice(0, 400),
    confidence: input.payload.severity,
    actionsRecommended: [
      ...input.payload.checksToday,
      ...input.payload.safeActionsNow,
    ].slice(0, 8),
    followUpDueAt: scheduleFollowUp ? followUpDueFromNow(7) : null,
  };
}
