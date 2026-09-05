import { funnelStats, listUsageEvents } from "@/lib/beta/usage-store";
import { listCropCases, listFollowups, listOutcomes, logCasePersistenceBackend } from "@/lib/cases/store";
import type { TrendClass } from "@/lib/cases/types";
import { loadWebResearchDashboardStats } from "@/lib/research/persist";
import { canExposeTrend } from "@/lib/trends/engine";
import { listCaseTrends } from "@/lib/trends/store";

export type InsightsFilters = {
  from?: string | null;
  to?: string | null;
  country?: string | null;
  district?: string | null;
  crop?: string | null;
  variety?: string | null;
  problem?: string | null;
  homeOrCommercial?: "home" | "commercial" | null;
  outcome?: string | null;
  caseType?: string | null;
  status?: string | null;
};

function inRange(iso: string, filters: InsightsFilters): boolean {
  if (filters.from && iso < filters.from) return false;
  if (filters.to && iso > filters.to) return false;
  return true;
}

function matches(value: string | null | undefined, needle: string | null | undefined): boolean {
  if (!needle) return true;
  return (value ?? "").toLowerCase() === needle.toLowerCase();
}

function increment(map: Map<string, number>, key: string | null | undefined) {
  const label = key?.trim() || "unknown";
  map.set(label, (map.get(label) ?? 0) + 1);
}

export function topEntries(map: Map<string, number>, limit = 8) {
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export async function buildInsights(filters: InsightsFilters = {}) {
  logCasePersistenceBackend();
  const allCases = (await listCropCases()).filter((item) => {
    if (!inRange(item.createdAt, filters)) return false;
    if (!matches(item.country, filters.country)) return false;
    if (!matches(item.district, filters.district)) return false;
    if (!matches(item.crop, filters.crop)) return false;
    if (!matches(item.variety, filters.variety)) return false;
    if (!matches(item.problemCategory, filters.problem)) return false;
    if (filters.homeOrCommercial && item.homeOrCommercial !== filters.homeOrCommercial) {
      return false;
    }
    if (!matches(item.caseType, filters.caseType)) return false;
    if (!matches(item.caseStatus, filters.status)) return false;
    return true;
  });

  const usage = listUsageEvents();
  const guests = new Set<string>();
  const registered = new Set<string>();
  for (const event of usage) {
    if (event.authUserId) registered.add(event.authUserId);
    else if (event.guestSessionId) guests.add(event.guestSessionId);
  }
  for (const item of allCases) {
    if (item.userId) registered.add(item.userId);
    else if (item.anonymousSessionId) guests.add(item.anonymousSessionId);
  }

  const byCrop = new Map<string, number>();
  const byCountry = new Map<string, number>();
  const byDistrict = new Map<string, number>();
  const byVariety = new Map<string, number>();
  const byProblem = new Map<string, number>();
  const byWeek = new Map<string, number>();
  const bySymptom = new Map<string, number>();
  const byIntent = new Map<string, number>();
  const byCaseType = new Map<string, number>();
  const byCalculation = new Map<string, number>();
  let photoAssisted = 0;
  let unresolved = 0;
  let escalations = 0;
  let nutrient = 0;
  let stunting = 0;
  let wilting = 0;
  let confirmedDiagnoses = 0;
  let agronomistReviewed = 0;

  for (const item of allCases) {
    increment(byCrop, item.crop);
    increment(byCountry, item.country);
    increment(byDistrict, item.district);
    increment(byVariety, item.variety);
    increment(byProblem, item.problemCategory);
    increment(byWeek, item.createdAt.slice(0, 7));
    increment(byIntent, item.conversationIntent);
    increment(byCaseType, item.caseType);
    if (item.calculationType) increment(byCalculation, item.calculationType);
    for (const symptom of item.symptoms) increment(bySymptom, symptom);
    if (item.humanEscalation || item.caseStatus === "human_review") escalations += 1;
    if (item.caseStatus !== "resolved" && item.caseStatus !== "closed") unresolved += 1;
    if (item.problemCategory === "nutrient") nutrient += 1;
    if (item.problemCategory === "stunting" || item.symptoms.includes("stunting")) stunting += 1;
    if (item.problemCategory === "wilting" || item.symptoms.includes("wilting")) wilting += 1;
    if (item.diagnosisConfirmed) confirmedDiagnoses += 1;
    if (item.agronomistReviewed) agronomistReviewed += 1;
  }

  const outcomes = (await listOutcomes()).filter((row) =>
    allCases.some((item) => item.id === row.caseId),
  );
  const improved = outcomes.filter((row) => row.outcome === "improved").length;
  const unchanged = outcomes.filter((row) => row.outcome === "about_the_same").length;
  const worsened = outcomes.filter((row) => row.outcome === "worse").length;
  const solved = outcomes.filter((row) => row.outcome === "problem_solved").length;

  const followups = await listFollowups();
  const caseFollowups = followups.filter((row) => allCases.some((item) => item.id === row.caseId));
  photoAssisted = allCases.filter((item) =>
    followups.some((row) => row.caseId === item.id && row.followUpPhotoId),
  ).length;
  const followupAsked = caseFollowups.filter((row) => row.askedAt).length;
  const followupWithOutcome = caseFollowups.filter((row) => row.outcome).length;
  const followupPending = caseFollowups.filter((row) => !row.outcome && !row.optedOut).length;
  const averageFollowupCompletion =
    caseFollowups.length === 0 ? 0 : Math.round((followupWithOutcome / caseFollowups.length) * 100);

  const messages = usage.filter((event) => event.kind === "message");
  const imageAnalyses = usage.filter((event) => event.kind === "image_analysis");
  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);
  const weekAgo = new Date(startOfToday.getTime() - 7 * 24 * 60 * 60 * 1000);
  const messagesToday = messages.filter((event) => event.createdAt >= startOfToday.toISOString()).length;
  const messagesWeek = messages.filter((event) => event.createdAt >= weekAgo.toISOString()).length;

  const daysByUser = new Map<string, Set<string>>();
  for (const event of usage) {
    const key = event.authUserId || event.guestSessionId;
    if (!key) continue;
    const day = event.createdAt.slice(0, 10);
    const set = daysByUser.get(key) ?? new Set<string>();
    set.add(day);
    daysByUser.set(key, set);
  }
  let returningUsers = 0;
  for (const days of daysByUser.values()) {
    if (days.size > 1) returningUsers += 1;
  }

  const funnel = funnelStats();
  const trends = (await listCaseTrends()).filter(canExposeTrend);
  const emergingTrends = trends.filter((item) => item.trendStatus === "emerging");
  const businessIntents = ["farm_business", "cashflow", "costing", "pricing"];
  const nonDiagnostic = allCases.filter(
    (item) => item.caseType && item.caseType !== "crop_problem",
  );
  const web = await loadWebResearchDashboardStats();
  const resolved = allCases.filter(
    (item) => item.caseStatus === "resolved" || item.caseStatus === "closed",
  ).length;

  return {
    users: {
      total: guests.size + registered.size,
      guests: guests.size,
      registered: registered.size,
      active: guests.size + registered.size,
      returningUsers,
      uniqueGuestSessions: guests.size,
    },
    activity: {
      messages: messages.length,
      messagesToday,
      messagesThisWeek: messagesWeek,
      totalMessages: messages.length,
      imageAnalyses: imageAnalyses.length,
      photosUploaded: imageAnalyses.length,
      cases: allCases.length,
      totalCropCases: allCases.length,
      ...funnel,
    },
    overview: {
      messagesToday,
      messagesThisWeek: messagesWeek,
      totalMessages: messages.length,
      totalCropCases: allCases.length,
      uniqueGuestSessions: guests.size,
      registeredUsers: registered.size,
      returningUsers,
      photosUploaded: imageAnalyses.length,
    },
    web,
    agronomy: {
      problemsByCrop: topEntries(byCrop),
      problemsByCountry: topEntries(byCountry),
      problemsByDistrict: topEntries(byDistrict),
      problemsByVariety: topEntries(byVariety),
      problemsByWeek: topEntries(byWeek, 12),
      mostReportedPest: topEntries(byProblem).find((item) =>
        /whitefly|pest|aphid|thrips/.test(item.label),
      ) ?? null,
      mostReportedDisease: topEntries(byProblem).find((item) =>
        /blight|spot|wilt|disease/.test(item.label),
      ) ?? null,
      nutrientRelated: nutrient,
      stunting,
      wilting,
      photoAssisted,
      unresolved,
      humanEscalations: escalations,
      casesImproved: improved,
      casesUnchanged: unchanged,
      casesWorsened: worsened,
      problemSolved: solved,
      topSymptoms: topEntries(bySymptom),
      topSuspectedIssues: topEntries(byProblem),
      casesByCountry: topEntries(byCountry),
      casesByRegion: topEntries(byDistrict),
      casesOverTime: topEntries(byWeek, 12),
      confirmedDiagnoses,
      agronomistReviewed,
      solvedCount: solved,
      unresolvedCount: unresolved,
      photoUsage: imageAnalyses.length,
      averageFollowupCompletionPercent: averageFollowupCompletion,
      followupAsked,
      followupPending,
      followupWithOutcome,
      mostCommonBusinessQuestions: topEntries(byIntent).filter((item) =>
        businessIntents.includes(item.label),
      ),
      mostCommonCalculations: topEntries(byCalculation),
      mostCommonNonDiagnosticNeeds: topEntries(byIntent).filter(
        (item) =>
          item.label !== "crop_problem" &&
          item.label !== "pest_disease" &&
          item.label !== "unknown",
      ),
      questionTypes: topEntries(byIntent, 16),
      casesByType: topEntries(byCaseType),
      resolvedCount: resolved,
      emergingTrends: emergingTrends.map((item) => ({
        label: [item.crop, item.region, item.symptomCluster].filter(Boolean).join(" · "),
        count: item.caseCount,
        status: item.trendStatus,
      })),
      trendRows: trends.map((item) => ({
        emergingIssue: item.suspectedIssue || item.symptomCluster,
        crop: item.crop,
        country: item.country,
        region: item.region,
        uniqueUsers: item.uniqueSessionCount,
        caseCount: item.caseCount,
        firstSeen: item.firstSeenAt,
        lastSeen: item.lastSeenAt,
        confidence: item.confidenceScore,
        reviewStatus: item.trendStatus,
      })),
      nonDiagnosticCaseCount: nonDiagnostic.length,
    },
  };
}

export function classifyTrend(options: {
  currentCount: number;
  previousCount: number;
  sameDistrict: boolean;
  humanVerifiedOutbreak?: boolean;
}): TrendClass {
  if (options.humanVerifiedOutbreak) return "verified_outbreak";
  if (options.currentCount >= 8 && options.sameDistrict && options.currentCount >= options.previousCount * 3) {
    return "possible_outbreak";
  }
  if (options.currentCount >= 5 && options.currentCount >= options.previousCount * 2) {
    return "elevated_reports";
  }
  if (options.currentCount >= 3 && options.currentCount > options.previousCount) {
    return "emerging_pattern";
  }
  return "emerging_pattern";
}

export async function detectTrends(filters: InsightsFilters = {}) {
  const insights = await buildInsights(filters);
  const previous = await buildInsights({
    ...filters,
    from: filters.from ? shiftMonth(filters.from, -1) : null,
    to: filters.from ?? null,
  });

  return insights.agronomy.problemsByDistrict.slice(0, 6).map((district) => {
    const prev = previous.agronomy.problemsByDistrict.find((item) => item.label === district.label);
    const classification = classifyTrend({
      currentCount: district.count,
      previousCount: prev?.count ?? 0,
      sameDistrict: true,
    });
    return {
      label: district.label,
      count: district.count,
      classification,
    };
  });
}

function shiftMonth(iso: string, delta: number): string {
  const date = new Date(iso);
  date.setUTCMonth(date.getUTCMonth() + delta);
  return date.toISOString();
}
