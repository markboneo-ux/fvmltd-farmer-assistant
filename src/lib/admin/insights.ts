import { funnelStats, listUsageEvents } from "@/lib/beta/usage-store";
import {
  listAllCaseMessages,
  listAllCasePhotos,
  listCropCases,
  listFollowups,
  listOutcomes,
  logCasePersistenceBackend,
} from "@/lib/cases/store";
import type { CropCaseRecord, TrendClass } from "@/lib/cases/types";
import { researchUsageStats } from "@/lib/research/log";
import { loadWebResearchDashboardStats } from "@/lib/research/persist";
import { canExposeTrend } from "@/lib/trends/engine";
import { listCaseTrends } from "@/lib/trends/store";
import { trendCountryKey } from "@/lib/trends/types";

export type InsightsFilters = {
  from?: string | null;
  to?: string | null;
  country?: string | null;
  district?: string | null;
  region?: string | null;
  crop?: string | null;
  variety?: string | null;
  problem?: string | null;
  issue?: string | null;
  homeOrCommercial?: "home" | "commercial" | null;
  userType?: string | null;
  guestOrRegistered?: "guest" | "registered" | null;
  confirmed?: "confirmed" | "unconfirmed" | null;
  resolved?: "resolved" | "unresolved" | null;
  outcome?: string | null;
  caseType?: string | null;
  status?: string | null;
  questionCategory?: string | null;
};

function inRange(iso: string, filters: InsightsFilters): boolean {
  if (filters.from && iso < filters.from) return false;
  if (filters.to && iso > `${filters.to}T23:59:59.999Z` && !iso.startsWith(filters.to)) {
    if (iso > filters.to) return false;
  }
  if (filters.to && iso.slice(0, 10) > filters.to) return false;
  return true;
}

function matchesCountry(
  value: string | null | undefined,
  needle: string | null | undefined,
): boolean {
  if (!needle) return true;
  return trendCountryKey(value) === trendCountryKey(needle === "Unknown" ? "unknown" : needle);
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

function questionBucket(intent: string | null | undefined): string {
  switch (intent) {
    case "crop_problem":
      return "Crop diagnosis";
    case "pest_disease":
      return "Pest/disease";
    case "nutrition":
      return "Nutrition";
    case "irrigation":
      return "Irrigation";
    case "cashflow":
    case "farm_business":
    case "costing":
      return "Business/cashflow";
    case "simple_math":
    case "unit_conversion":
      return "Calculations";
    case "pricing":
      return "Market/pricing";
    case "general_agriculture":
      return "General agriculture";
    default:
      return "Other";
  }
}

function isGuestCase(item: CropCaseRecord): boolean {
  return !item.userId;
}

function matchesFilters(item: CropCaseRecord, filters: InsightsFilters): boolean {
  if (!inRange(item.createdAt, filters)) return false;
  if (!matchesCountry(item.country, filters.country)) return false;
  if (!matches(item.district, filters.district ?? filters.region)) return false;
  if (!matches(item.crop, filters.crop)) return false;
  if (!matches(item.variety, filters.variety)) return false;
  if (!matches(item.problemCategory, filters.problem ?? filters.issue)) return false;
  if (filters.homeOrCommercial && item.homeOrCommercial !== filters.homeOrCommercial) {
    return false;
  }
  if (filters.userType && (item.userLevel ?? item.homeOrCommercial) !== filters.userType) {
    return false;
  }
  if (filters.guestOrRegistered === "guest" && !isGuestCase(item)) return false;
  if (filters.guestOrRegistered === "registered" && isGuestCase(item)) return false;
  if (filters.confirmed === "confirmed" && !item.diagnosisConfirmed) return false;
  if (filters.confirmed === "unconfirmed" && item.diagnosisConfirmed) return false;
  if (filters.resolved === "resolved" && item.caseStatus !== "resolved" && item.caseStatus !== "closed") {
    return false;
  }
  if (
    filters.resolved === "unresolved" &&
    (item.caseStatus === "resolved" || item.caseStatus === "closed")
  ) {
    return false;
  }
  if (!matches(item.caseType, filters.caseType)) return false;
  if (!matches(item.caseStatus, filters.status)) return false;
  if (!matches(item.questionCategory ?? item.conversationIntent, filters.questionCategory)) {
    return false;
  }
  return true;
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function hourKey(iso: string): string {
  const hour = new Date(iso).getUTCHours();
  return `${String(hour).padStart(2, "0")}:00 UTC`;
}

export async function buildInsights(filters: InsightsFilters = {}) {
  logCasePersistenceBackend();
  const allCases = (await listCropCases()).filter((item) => matchesFilters(item, filters));
  const allMessages = (await listAllCaseMessages()).filter((row) => inRange(row.createdAt, filters));
  const allPhotos = (await listAllCasePhotos()).filter((row) => inRange(row.createdAt, filters));
  const usage = listUsageEvents().filter((event) => inRange(event.createdAt, filters));

  const guests = new Set<string>();
  const registered = new Set<string>();
  const activeToday = new Set<string>();
  const activeWeek = new Set<string>();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const ownerKey = (item: { userId?: string | null; anonymousSessionId?: string | null }) =>
    item.userId || item.anonymousSessionId || "unknown";

  for (const event of usage) {
    if (event.authUserId) registered.add(event.authUserId);
    else if (event.guestSessionId) guests.add(event.guestSessionId);
    const key = event.authUserId || event.guestSessionId;
    if (!key) continue;
    if (event.createdAt.slice(0, 10) === today) activeToday.add(key);
    if (event.createdAt >= weekAgo) activeWeek.add(key);
  }
  for (const item of allCases) {
    if (item.userId) registered.add(item.userId);
    else if (item.anonymousSessionId) guests.add(item.anonymousSessionId);
    const key = ownerKey(item);
    if (item.createdAt.slice(0, 10) === today || item.updatedAt.slice(0, 10) === today) {
      activeToday.add(key);
    }
    if (item.updatedAt >= weekAgo || item.createdAt >= weekAgo) activeWeek.add(key);
  }

  const byCrop = new Map<string, number>();
  const byCountry = new Map<string, number>();
  const byDistrict = new Map<string, number>();
  const byVariety = new Map<string, number>();
  const byProblem = new Map<string, number>();
  const byWeek = new Map<string, number>();
  const byDay = new Map<string, number>();
  const bySymptom = new Map<string, number>();
  const byIntent = new Map<string, number>();
  const byCaseType = new Map<string, number>();
  const byCalculation = new Map<string, number>();
  const byQuestionType = new Map<string, number>();
  const byFarmerLevel = new Map<string, number>();
  let unresolved = 0;
  let escalations = 0;
  let nutrient = 0;
  let stunting = 0;
  let wilting = 0;
  let confirmedDiagnoses = 0;
  let agronomistReviewed = 0;
  let guestCases = 0;
  let registeredCases = 0;

  for (const item of allCases) {
    increment(byCrop, item.crop);
    increment(byCountry, trendCountryKey(item.country) === "unknown" ? "Unknown" : item.country);
    increment(byDistrict, item.district);
    increment(byVariety, item.variety);
    increment(byProblem, item.problemCategory);
    increment(byWeek, item.createdAt.slice(0, 7));
    increment(byDay, dayKey(item.createdAt));
    increment(byIntent, item.conversationIntent);
    increment(byCaseType, item.caseType);
    increment(byQuestionType, questionBucket(item.questionCategory ?? item.conversationIntent));
    increment(byFarmerLevel, item.userLevel);
    if (item.calculationType) increment(byCalculation, item.calculationType);
    for (const symptom of item.symptoms) increment(bySymptom, symptom);
    if (item.humanEscalation || item.caseStatus === "human_review") escalations += 1;
    if (item.caseStatus !== "resolved" && item.caseStatus !== "closed") unresolved += 1;
    if (item.problemCategory === "nutrient") nutrient += 1;
    if (item.problemCategory === "stunting" || item.symptoms.includes("stunting")) stunting += 1;
    if (item.problemCategory === "wilting" || item.symptoms.includes("wilting")) wilting += 1;
    if (item.diagnosisConfirmed) confirmedDiagnoses += 1;
    if (item.agronomistReviewed) agronomistReviewed += 1;
    if (isGuestCase(item)) guestCases += 1;
    else registeredCases += 1;
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
  const photoAssisted = allCases.filter((item) =>
    followups.some((row) => row.caseId === item.id && row.followUpPhotoId),
  ).length;
  const followupAsked = caseFollowups.filter((row) => row.askedAt).length;
  const followupWithOutcome = caseFollowups.filter((row) => row.outcome).length;
  const followupPending = caseFollowups.filter((row) => !row.outcome && !row.optedOut).length;
  const averageFollowupCompletion =
    caseFollowups.length === 0 ? 0 : Math.round((followupWithOutcome / caseFollowups.length) * 100);

  const persistedMessages = allMessages.filter((row) =>
    allCases.some((item) => item.id === row.caseId) || allCases.length === 0,
  );
  const usageMessages = usage.filter((event) => event.kind === "message").length;
  const messages = Math.max(persistedMessages.length, usageMessages);
  const imageAnalyses = Math.max(
    allPhotos.length,
    usage.filter((event) => event.kind === "image_analysis").length,
  );
  const uniqueUsers = guests.size + registered.size;
  const averageMessagesPerUser =
    uniqueUsers === 0 ? 0 : Math.round((messages / uniqueUsers) * 10) / 10;

  const messagesByDay = new Map<string, number>();
  const photosByDay = new Map<string, number>();
  const newUsersByDay = new Map<string, number>();
  const hours = new Map<string, number>();
  for (const row of persistedMessages) {
    increment(messagesByDay, dayKey(row.createdAt));
    increment(hours, hourKey(row.createdAt));
  }
  for (const photo of allPhotos) increment(photosByDay, dayKey(photo.createdAt));
  for (const item of allCases) increment(newUsersByDay, dayKey(item.createdAt));

  const funnel = funnelStats();
  const trends = (await listCaseTrends()).filter(canExposeTrend);
  const businessIntents = ["farm_business", "cashflow", "costing", "pricing"];
  const nonDiagnostic = allCases.filter(
    (item) => item.caseType && item.caseType !== "crop_problem",
  );
  const web = researchUsageStats();
  const persistedWeb = await loadWebResearchDashboardStats();
  const startOfToday = `${today}T00:00:00.000Z`;
  const usageMessageEvents = usage.filter((event) => event.kind === "message");
  const messagesToday = usageMessageEvents.filter(
    (event) => event.createdAt >= startOfToday,
  ).length;
  const messagesWeek = usageMessageEvents.filter(
    (event) => event.createdAt >= weekAgo,
  ).length;
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
  const resolved = allCases.filter(
    (item) => item.caseStatus === "resolved" || item.caseStatus === "closed",
  ).length;

  return {
    users: {
      total: uniqueUsers,
      guests: guests.size,
      registered: registered.size,
      active: uniqueUsers,
      activeToday: activeToday.size,
      activeWeek: activeWeek.size,
      returningUsers,
      uniqueGuestSessions: guests.size,
    },
    activity: {
      messages,
      messagesToday,
      messagesThisWeek: messagesWeek,
      totalMessages: messages,
      imageAnalyses,
      photosUploaded: allPhotos.length,
      cases: allCases.length,
      totalCropCases: allCases.length,
      averageMessagesPerUser,
      guestCases,
      registeredCases,
      ...funnel,
    },
    summary: {
      totalMessages: messages,
      totalCropCases: allCases.length,
      uniqueGuestSessions: guests.size,
      registeredUsers: registered.size,
      photosUploaded: allPhotos.length,
      activeUsersToday: activeToday.size,
      activeUsersThisWeek: activeWeek.size,
      averageMessagesPerUser,
      returningUsers,
    },
    overview: {
      messagesToday,
      messagesThisWeek: messagesWeek,
      totalMessages: messages,
      totalCropCases: allCases.length,
      uniqueGuestSessions: guests.size,
      registeredUsers: registered.size,
      returningUsers,
      photosUploaded: allPhotos.length,
    },
    web: {
      answersThatUsedWebResearch: Math.max(
        persistedWeb.answersThatUsedWebResearch,
        web.answersUsingWeb,
      ),
      sourceFailures: Math.max(persistedWeb.sourceFailures, web.sourceFailures.reduce((sum, row) => sum + row.count, 0)),
      staleSourceWarnings: Math.max(
        persistedWeb.staleSourceWarnings,
        web.outdatedSourceAlerts.reduce((sum, row) => sum + row.count, 0),
      ),
      topSources: persistedWeb.topSources.length > 0 ? persistedWeb.topSources : web.mostUsedSources,
    },
    questionTypes: topEntries(byQuestionType, 12),
    usage: {
      messagesPerDay: topEntries(messagesByDay, 14),
      casesPerDay: topEntries(byDay, 14),
      photosPerDay: topEntries(photosByDay, 14),
      newUsers: topEntries(newUsersByDay, 14),
      guestVsRegistered: [
        { label: "guest", count: guests.size },
        { label: "registered", count: registered.size },
      ],
      mostActiveTimes: topEntries(hours, 8),
    },
    webResearch: web,
    cases: allCases.slice(0, 80).map((item) => ({
      id: item.id,
      crop: item.crop,
      country: item.country,
      region: item.district,
      issue: item.problemCategory,
      status: item.caseStatus,
      confirmed: item.diagnosisConfirmed,
      guest: isGuestCase(item),
      createdAt: item.createdAt,
      questionType: questionBucket(item.questionCategory ?? item.conversationIntent),
    })),
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
      photoUsage: imageAnalyses,
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
      casesByType: topEntries(byCaseType),
      casesByFarmerLevel: topEntries(byFarmerLevel),
      resolvedCount: resolved,
      emergingTrends: trends.map((item) => ({
        label: [item.crop, item.country || "Unknown", item.region, item.symptomCluster]
          .filter(Boolean)
          .join(" · "),
        count: item.uniqueSessionCount,
        status: item.trendStatus,
        firstSeen: item.firstSeenAt,
        lastSeen: item.lastSeenAt,
        country: item.country,
        region: item.region,
        confidence: item.confidenceScore,
        reviewed: item.staffReviewed,
        uniqueFarmers: item.uniqueSessionCount,
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
