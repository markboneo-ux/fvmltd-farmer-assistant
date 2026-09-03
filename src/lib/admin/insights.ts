import { funnelStats, listUsageEvents } from "@/lib/beta/usage-store";
import { listCropCases, listFollowups, listOutcomes, logCasePersistenceBackend } from "@/lib/cases/store";
import type { TrendClass } from "@/lib/cases/types";

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
  let photoAssisted = 0;
  let unresolved = 0;
  let escalations = 0;
  let nutrient = 0;
  let stunting = 0;
  let wilting = 0;

  for (const item of allCases) {
    increment(byCrop, item.crop);
    increment(byCountry, item.country);
    increment(byDistrict, item.district);
    increment(byVariety, item.variety);
    increment(byProblem, item.problemCategory);
    increment(byWeek, item.createdAt.slice(0, 7));
    if (item.humanEscalation || item.caseStatus === "human_review") escalations += 1;
    if (item.caseStatus !== "resolved" && item.caseStatus !== "closed") unresolved += 1;
    if (item.problemCategory === "nutrient") nutrient += 1;
    if (item.problemCategory === "stunting" || item.symptoms.includes("stunting")) stunting += 1;
    if (item.problemCategory === "wilting" || item.symptoms.includes("wilting")) wilting += 1;
  }

  const outcomes = (await listOutcomes()).filter((row) =>
    allCases.some((item) => item.id === row.caseId),
  );
  const improved = outcomes.filter((row) => row.outcome === "improved").length;
  const unchanged = outcomes.filter((row) => row.outcome === "about_the_same").length;
  const worsened = outcomes.filter((row) => row.outcome === "worse").length;
  const solved = outcomes.filter((row) => row.outcome === "problem_solved").length;

  const followups = await listFollowups();
  photoAssisted = allCases.filter((item) =>
    followups.some((row) => row.caseId === item.id && row.followUpPhotoId),
  ).length;

  const messages = usage.filter((event) => event.kind === "message").length;
  const imageAnalyses = usage.filter((event) => event.kind === "image_analysis").length;
  const funnel = funnelStats();

  return {
    users: {
      total: guests.size + registered.size,
      guests: guests.size,
      registered: registered.size,
      active: guests.size + registered.size,
    },
    activity: {
      messages,
      imageAnalyses,
      cases: allCases.length,
      ...funnel,
    },
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
