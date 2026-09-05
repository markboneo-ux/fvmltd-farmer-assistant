import type { MarketPriceQuote, PriceKind } from "./types";
import { sourcesByCategory } from "./trusted-sources";

const CROP_ALIASES: Array<{ crop: string; pattern: RegExp }> = [
  { crop: "pumpkin", pattern: /\bpumpkins?\b/i },
  { crop: "celery", pattern: /\bcelery\b/i },
  { crop: "tomato", pattern: /\btomato(es)?\b/i },
  { crop: "cucumber", pattern: /\bcucumbers?\b/i },
  { crop: "cabbage", pattern: /\bcabbage\b/i },
  { crop: "lettuce", pattern: /\blettuce\b/i },
  { crop: "pepper", pattern: /\b(sweet\s+)?peppers?\b/i },
  { crop: "chive", pattern: /\bchives?\b/i },
  { crop: "banana", pattern: /\bbananas?\b/i },
  { crop: "cassava", pattern: /\bcassava\b/i },
];

export function detectPriceKind(message: string): PriceKind {
  const lower = message.toLowerCase();
  if (/\bfarmgate|farm-gate|farm gate\b/.test(lower)) return "farmgate_estimate";
  if (/\bretail|supermarket|shop price\b/.test(lower)) return "retail";
  if (/\b(should|can) i sell|my (selling )?price|charge\b/.test(lower)) {
    return "farmer_selling";
  }
  return "wholesale";
}

export function extractMarketCrop(message: string, fallback?: string | null): string | null {
  for (const item of CROP_ALIASES) {
    if (item.pattern.test(message)) return item.crop;
  }
  return fallback ?? null;
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/,/g, "").replace(/[^\d.]/g, "");
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/**
 * Parse NAMIS/NAMDEVCO-style wholesale tables and plain "Pumpkin 4.41" text.
 */
export function parseNamisPriceHtml(html: string, crop: string): { amount: number | null; unit: string } {
  const text = stripTags(html);
  const cropPattern = new RegExp(
    `${crop.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s*\\([^)]*\\))?\\s*(?:kg|head|bundle)?\\s*([0-9]+(?:\\.[0-9]+)?)`,
    "i",
  );
  const match = text.match(cropPattern);
  if (match?.[1]) {
    return { amount: parseAmount(match[1]), unit: "kg" };
  }
  return { amount: null, unit: "kg" };
}

export function quoteIsStale(asOf: string | null, now = Date.now()): boolean {
  if (!asOf) return true;
  const parsed = Date.parse(asOf);
  if (!Number.isFinite(parsed)) return true;
  return now - parsed > 7 * 24 * 60 * 60 * 1000;
}

export function formatMarketQuote(quote: MarketPriceQuote): string {
  const kindLabel =
    quote.priceKind === "wholesale"
      ? "wholesale"
      : quote.priceKind === "retail"
        ? "retail"
        : quote.priceKind === "farmgate_estimate"
          ? "farmgate estimate"
          : "your own selling price (not a market quote)";

  if (quote.amount == null) {
    return `I could not read a current ${kindLabel} figure for ${quote.crop} from ${quote.sourceName}. Treat any number you hear locally as a check, not as official data.`;
  }

  const stale = quote.stale
    ? " This figure may be old — I will not treat it as today's price."
    : "";
  const asOf = quote.asOf ? ` as of ${quote.asOf.slice(0, 10)}` : "";
  return `${quote.crop} ${kindLabel} at ${quote.marketName || quote.sourceName}: about ${quote.currency} ${quote.amount.toFixed(2)} per ${quote.unit}${asOf}.${stale}`;
}

export function distinguishPriceKindsReminder(kind: PriceKind): string {
  return [
    "Wholesale is what traders pay at the market.",
    "Retail is what shops charge shoppers.",
    "Farmgate is an estimate of what you might get at the farm gate — usually below wholesale.",
    kind === "farmer_selling"
      ? "Your selling price is your decision. Use wholesale as a guide, not a rule."
      : "Do not mix these up when you plan what to plant or charge.",
  ].join(" ");
}

export function namdevcoSources() {
  return sourcesByCategory("Trinidad and Tobago", "market_prices");
}
