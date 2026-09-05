/**
 * Current vs stable information. Never describe old data as current.
 */

import type { ResearchTopic } from "./types";

const FRESH_TOPICS = new Set<ResearchTopic>([
  "pesticide_registration",
  "product_label",
  "chemical_approval",
  "market_prices",
  "government_program",
  "disease_alert",
  "weather",
  "regulation",
  "input_availability",
]);

const MAX_AGE_DAYS: Record<string, number> = {
  pesticide_registration: 180,
  product_label: 365,
  chemical_approval: 180,
  market_prices: 14,
  government_program: 90,
  disease_alert: 21,
  weather: 2,
  regulation: 180,
  input_availability: 30,
  government_guidance: 365,
  extension: 365,
};

export function topicRequiresFreshSource(topic: ResearchTopic): boolean {
  return FRESH_TOPICS.has(topic);
}

export function isStale(options: {
  topic: ResearchTopic;
  retrievedAt: string;
  publishedAt?: string | null;
}): boolean {
  const maxDays = MAX_AGE_DAYS[options.topic] ?? 365;
  const stamp = options.publishedAt || options.retrievedAt;
  const then = Date.parse(stamp);
  if (!Number.isFinite(then)) return true;
  const ageMs = Date.now() - then;
  return ageMs > maxDays * 24 * 60 * 60 * 1000;
}

export function staleWarning(options: {
  publishedAt?: string | null;
  retrievedAt: string;
}): string | null {
  const stamp = options.publishedAt || options.retrievedAt;
  const date = new Date(stamp);
  if (Number.isNaN(date.getTime())) {
    return "This source does not show a clear update date, so treat it as possibly out of date.";
  }
  const iso = date.toISOString().slice(0, 10);
  return `This source was last updated on ${iso}.`;
}

export function formatAsOfDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}
