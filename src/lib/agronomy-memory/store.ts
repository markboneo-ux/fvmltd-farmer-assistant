import type {
  AgronomyCaseMessage,
  AgronomyCaseOutcome,
  AgronomyCaseRecord,
  AgronomyCaseReview,
  CropOutcome,
  ReviewVerdict,
  SimilarCaseEvidence,
  SimilarCaseQuery,
} from "./types";

export type MemoryStore = {
  cases: AgronomyCaseRecord[];
  messages: AgronomyCaseMessage[];
  outcomes: AgronomyCaseOutcome[];
  reviews: AgronomyCaseReview[];
};

function nowIso() {
  return new Date().toISOString();
}

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `mem-${Date.now()}-${Math.random()}`;
}

let runtimeStore: MemoryStore = {
  cases: [],
  messages: [],
  outcomes: [],
  reviews: [],
};

export function getMemoryStore(): MemoryStore {
  return runtimeStore;
}

export function resetMemoryStoreForTests(seed: Partial<MemoryStore> = {}) {
  runtimeStore = {
    cases: seed.cases ? [...seed.cases] : [],
    messages: seed.messages ? [...seed.messages] : [],
    outcomes: seed.outcomes ? [...seed.outcomes] : [],
    reviews: seed.reviews ? [...seed.reviews] : [],
  };
}

export function upsertAgronomyCase(
  input: Partial<AgronomyCaseRecord> & { sessionId: string },
): AgronomyCaseRecord {
  const existing =
    (input.id
      ? runtimeStore.cases.find((item) => item.id === input.id)
      : runtimeStore.cases.find(
          (item) =>
            item.sessionId === input.sessionId && item.cropOutcome === null,
        )) ?? null;

  const timestamp = nowIso();
  const next: AgronomyCaseRecord = {
    id: existing?.id ?? input.id ?? newId(),
    farmerId: input.farmerId ?? existing?.farmerId ?? null,
    sessionId: input.sessionId,
    country: input.country ?? existing?.country ?? null,
    district: input.district ?? existing?.district ?? null,
    farm: input.farm ?? existing?.farm ?? null,
    crop: input.crop ?? existing?.crop ?? null,
    variety: input.variety ?? existing?.variety ?? null,
    plantAge: input.plantAge ?? existing?.plantAge ?? null,
    productionSystem: input.productionSystem ?? existing?.productionSystem ?? null,
    farmerScale: input.farmerScale ?? existing?.farmerScale ?? null,
    areaPlanted: input.areaPlanted ?? existing?.areaPlanted ?? null,
    problemReported: input.problemReported ?? existing?.problemReported ?? null,
    symptoms: input.symptoms ?? existing?.symptoms ?? null,
    fieldDistribution:
      input.fieldDistribution ?? existing?.fieldDistribution ?? null,
    photoCount: input.photoCount ?? existing?.photoCount ?? 0,
    soilOrMedium: input.soilOrMedium ?? existing?.soilOrMedium ?? null,
    irrigation: input.irrigation ?? existing?.irrigation ?? null,
    drainage: input.drainage ?? existing?.drainage ?? null,
    fertilizerHistory:
      input.fertilizerHistory ?? existing?.fertilizerHistory ?? null,
    cropProtectionHistory:
      input.cropProtectionHistory ?? existing?.cropProtectionHistory ?? null,
    weatherConditions:
      input.weatherConditions ?? existing?.weatherConditions ?? null,
    suspectedCauses: input.suspectedCauses ?? existing?.suspectedCauses ?? null,
    confidence: input.confidence ?? existing?.confidence ?? null,
    actionsRecommended:
      input.actionsRecommended ?? existing?.actionsRecommended ?? [],
    actionsActuallyTaken:
      input.actionsActuallyTaken ?? existing?.actionsActuallyTaken ?? null,
    followUpResult: input.followUpResult ?? existing?.followUpResult ?? null,
    cropOutcome: input.cropOutcome ?? existing?.cropOutcome ?? null,
    confirmedDiagnosis:
      input.confirmedDiagnosis ?? existing?.confirmedDiagnosis ?? null,
    yieldImpact: input.yieldImpact ?? existing?.yieldImpact ?? null,
    followUpDueAt: input.followUpDueAt ?? existing?.followUpDueAt ?? null,
    createdAt: existing?.createdAt ?? input.createdAt ?? timestamp,
    updatedAt: timestamp,
  };

  runtimeStore.cases = [
    next,
    ...runtimeStore.cases.filter((item) => item.id !== next.id),
  ];
  return next;
}

export function appendCaseMessage(input: {
  caseId: string;
  role: "user" | "assistant";
  content: string;
}): AgronomyCaseMessage {
  const row: AgronomyCaseMessage = {
    id: newId(),
    caseId: input.caseId,
    role: input.role,
    content: input.content,
    createdAt: nowIso(),
  };
  runtimeStore.messages.push(row);
  return row;
}

export function recordCaseOutcome(input: {
  caseId: string;
  cropOutcome: CropOutcome;
  actionsTaken?: string | null;
  daysAfterRecommendation?: number | null;
}): AgronomyCaseOutcome {
  const row: AgronomyCaseOutcome = {
    id: newId(),
    caseId: input.caseId,
    cropOutcome: input.cropOutcome,
    actionsTaken: input.actionsTaken ?? null,
    daysAfterRecommendation: input.daysAfterRecommendation ?? null,
    createdAt: nowIso(),
  };
  runtimeStore.outcomes.push(row);
  upsertAgronomyCase({
    id: input.caseId,
    sessionId:
      runtimeStore.cases.find((item) => item.id === input.caseId)?.sessionId ??
      "unknown",
    cropOutcome: input.cropOutcome,
    actionsActuallyTaken: input.actionsTaken ?? null,
    followUpResult: input.cropOutcome,
  });
  return row;
}

export function recordCaseReview(input: {
  caseId: string;
  verdict: ReviewVerdict;
  confirmedDiagnosis?: string | null;
  recommendedCorrection?: string | null;
  requiresLabConfirmation?: boolean;
  staffProfileId?: string | null;
}): AgronomyCaseReview {
  const row: AgronomyCaseReview = {
    id: newId(),
    caseId: input.caseId,
    staffProfileId: input.staffProfileId ?? null,
    verdict: input.verdict,
    confirmedDiagnosis: input.confirmedDiagnosis ?? null,
    recommendedCorrection: input.recommendedCorrection ?? null,
    requiresLabConfirmation: input.requiresLabConfirmation ?? false,
    createdAt: nowIso(),
  };
  runtimeStore.reviews.push(row);
  if (input.confirmedDiagnosis) {
    upsertAgronomyCase({
      id: input.caseId,
      sessionId:
        runtimeStore.cases.find((item) => item.id === input.caseId)?.sessionId ??
        "unknown",
      confirmedDiagnosis: input.confirmedDiagnosis,
    });
  }
  return row;
}

export function getCaseById(id: string): AgronomyCaseRecord | null {
  return runtimeStore.cases.find((item) => item.id === id) ?? null;
}

export function getCaseMessages(caseId: string): AgronomyCaseMessage[] {
  return runtimeStore.messages.filter((item) => item.caseId === caseId);
}

export function getCaseOutcomes(caseId: string): AgronomyCaseOutcome[] {
  return runtimeStore.outcomes.filter((item) => item.caseId === caseId);
}

export function getCaseReviews(caseId: string): AgronomyCaseReview[] {
  return runtimeStore.reviews.filter((item) => item.caseId === caseId);
}

export function getDueFollowUp(sessionId: string, now = new Date()): AgronomyCaseRecord | null {
  const nowMs = now.getTime();
  return (
    runtimeStore.cases.find((item) => {
      if (item.sessionId !== sessionId) return false;
      if (item.cropOutcome) return false;
      if (!item.followUpDueAt) return false;
      return new Date(item.followUpDueAt).getTime() <= nowMs;
    }) ?? null
  );
}

function tokenSet(value: string | null | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 2),
  );
}

function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let count = 0;
  for (const token of a) {
    if (b.has(token)) count += 1;
  }
  return count;
}

/**
 * Rank prior cases for retrieval. Reviewed + confirmed + outcome cases
 * outrank unreviewed ones. Farmer identity is never returned.
 */
export function getSimilarCases(
  query: SimilarCaseQuery,
  options: { limit?: number } = {},
): SimilarCaseEvidence[] {
  const limit = options.limit ?? 5;
  const querySymptoms = tokenSet(query.symptoms);
  const queryWeather = tokenSet(query.weatherContext);

  const ranked = runtimeStore.cases.map((item) => {
    const reviews = runtimeStore.reviews.filter((row) => row.caseId === item.id);
    const outcomes = runtimeStore.outcomes.filter((row) => row.caseId === item.id);
    const reviewed = reviews.length > 0;
    const confirmed =
      Boolean(item.confirmedDiagnosis) ||
      reviews.some((row) => Boolean(row.confirmedDiagnosis));
    const latestOutcome = outcomes[outcomes.length - 1]?.cropOutcome ?? item.cropOutcome;
    const successful =
      latestOutcome === "improved" || latestOutcome === "solved";

    let score = 0;
    if (reviewed) score += 100;
    if (confirmed) score += 80;
    if (latestOutcome) score += 60;
    if (successful) score += 40;
    if (query.country && item.country === query.country) score += 20;
    if (
      query.district &&
      item.district &&
      item.district.toLowerCase() === query.district.toLowerCase()
    ) {
      score += 25;
    }
    if (query.crop && item.crop === query.crop) score += 30;
    if (
      query.variety &&
      item.variety &&
      item.variety.toLowerCase() === query.variety.toLowerCase()
    ) {
      score += 25;
    }
    if (
      query.productionSystem &&
      item.productionSystem === query.productionSystem
    ) {
      score += 10;
    }
    score += overlap(querySymptoms, tokenSet(item.symptoms ?? item.problemReported)) * 8;
    score += overlap(queryWeather, tokenSet(item.weatherConditions)) * 4;

    const locationParts = [item.district, item.country].filter(Boolean);
    return {
      evidence: {
        pattern:
          item.symptoms ||
          item.problemReported ||
          item.suspectedCauses ||
          "recorded crop problem",
        crop: item.crop,
        locationLabel: locationParts.length ? locationParts.join(", ") : null,
        outcome: latestOutcome,
        reviewed,
        confirmedDiagnosis:
          item.confirmedDiagnosis ||
          reviews.find((row) => row.confirmedDiagnosis)?.confirmedDiagnosis ||
          null,
        score,
      } satisfies SimilarCaseEvidence,
      farmerId: item.farmerId,
    };
  });

  return ranked
    .filter((item) => item.evidence.score > 0)
    .sort((a, b) => b.evidence.score - a.evidence.score)
    .slice(0, limit)
    .map((item) => item.evidence);
}

export function formatSimilarCasesForModel(
  cases: SimilarCaseEvidence[],
): string {
  if (cases.length === 0) {
    return "- none retrieved for this turn";
  }

  return cases
    .map((item, index) => {
      const bits = [
        item.crop ? `crop ${item.crop}` : null,
        item.locationLabel,
        item.reviewed ? "agronomist-reviewed" : "unreviewed",
        item.confirmedDiagnosis
          ? `later confirmed: ${item.confirmedDiagnosis}`
          : null,
        item.outcome ? `outcome: ${item.outcome}` : null,
      ].filter(Boolean);
      return `${index + 1}. ${item.pattern} (${bits.join("; ")})`;
    })
    .join("\n");
}

export const FOLLOW_UP_OPTIONS: Array<{ id: CropOutcome; label: string }> = [
  { id: "improved", label: "Improved" },
  { id: "unchanged", label: "About the same" },
  { id: "worse", label: "Worse" },
  { id: "solved", label: "Problem solved" },
];

export function followUpQuestion(): string {
  return "Did the crop improve after the steps we discussed?";
}
