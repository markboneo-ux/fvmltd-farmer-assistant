/**
 * Keep the farmer's stated question first. Weather, similar cases, and
 * catalogues are supporting context only.
 */

import type { IntentCategory } from "@/lib/assistant/intents";
import { isBusinessIntent, isCalculationIntent, isDiagnosticIntent } from "@/lib/assistant/intents";

export type ContextSource =
  | "user_question"
  | "active_crop"
  | "photos"
  | "ranked_causes"
  | "country"
  | "web_research"
  | "similar_cases"
  | "weather"
  | "product_catalogue";

export type RankedContext = {
  source: ContextSource;
  allowed: boolean;
  rank: number;
  instruction: string;
};

export function rankTurnContext(options: {
  intent: IntentCategory;
  message: string;
  hasPhotos: boolean;
  country: string | null;
  weatherAttached: boolean;
  similarCaseHint?: string | null;
  webResearchUsed?: boolean;
}): RankedContext[] {
  const diagnostic = isDiagnosticIntent(options.intent);
  const business = isBusinessIntent(options.intent) || isCalculationIntent(options.intent);
  const items: RankedContext[] = [
    {
      source: "user_question",
      allowed: true,
      rank: 1,
      instruction: `Answer this farmer question first, in plain language: "${options.message}". Do not lead with weather, catalogues, or other farms.`,
    },
  ];

  if (diagnostic) {
    items.push({
      source: "ranked_causes",
      allowed: true,
      rank: 2,
      instruction:
        "Work through nutrition, water, drainage, roots, disease, insects, mites, herbicide, weather stress, and age before locking onto one cause.",
    });
  }

  if (options.hasPhotos) {
    items.push({
      source: "photos",
      allowed: true,
      rank: 3,
      instruction:
        "Describe only what is visible. Do not overstate certainty. Ask for another photo only if a specific view would change the advice.",
    });
  }

  if (options.country) {
    items.push({
      source: "country",
      allowed: true,
      rank: 4,
      instruction: `Country context is ${options.country}. Use it only when local rules, products, or prices matter. Never borrow another country's register.`,
    });
  }

  items.push({
    source: "web_research",
    allowed: Boolean(options.webResearchUsed) && !business,
    rank: 5,
    instruction: options.webResearchUsed
      ? "Use only the server web-research notes. If a local fact is not verified, say so."
      : "No web research on this turn. Do not invent local prices, registrations, or programmes.",
  });

  items.push({
    source: "similar_cases",
    allowed: Boolean(options.similarCaseHint) && diagnostic,
    rank: 6,
    instruction: options.similarCaseHint
      ? `Similar-case note (supporting only): ${options.similarCaseHint}`
      : "No similar-case note.",
  });

  items.push({
    source: "weather",
    allowed: options.weatherAttached && diagnostic,
    rank: 7,
    instruction: options.weatherAttached
      ? "Weather may be mentioned AFTER the direct answer, as extra watch-out only. Weather is not the diagnosis."
      : "Do not lead with weather. Do not invent a 72-hour disease-pressure headline.",
  });

  items.push({
    source: "product_catalogue",
    allowed: false,
    rank: 8,
    instruction: "Product names stay unverified unless the server attached a verified local source.",
  });

  return items.filter((item) => item.allowed || item.source === "weather" || item.source === "web_research");
}

export function relevanceInstructions(ranked: RankedContext[]): string {
  return [
    "RELEVANCE ORDER (highest first). Do not let a lower item hijack the answer.",
    ...ranked
      .sort((a, b) => a.rank - b.rank)
      .map((item) => `${item.rank}. ${item.source}: ${item.instruction}`),
  ].join("\n");
}

export function assessmentLeadsWithWeather(text: string): boolean {
  const start = text.trim().slice(0, 180).toLowerCase();
  return (
    /\b(high disease pressure|next 72 hours|weather[- ]linked risk|forecast shows)\b/.test(start) &&
    !/\b(yellow|wilt|spot|leaves|nutrient|root)\b/.test(start)
  );
}
