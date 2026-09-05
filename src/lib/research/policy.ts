/**
 * When to run country-specific web research, and when country is required.
 * General agronomy does not browse the web.
 */

import type { IntentCategory } from "@/lib/assistant/intents";
import { ASK_COUNTRY_QUESTION } from "./countries";
import type { ResearchTopic } from "./types";

const MARKET =
  /\b(market price|wholesale price|farmgate|retail price|namdevco|namis|jamis|current price|today'?s price|what (is|are) .{0,40}(selling|going) for|price of (tomatoes?|peppers?|cucumber|celery|produce))\b/i;

const PESTICIDE =
  /\b(registered|registration|approved (for|in)|pesticide register|list of pesticides?|pesticides?( are| is)? (available|registered|approved|in|for)|what pesticides?|what can i spray|what chemical|trade name|brand (to use|name)|label rate|pre-?harvest interval|re-?entry|PHI|REI|is .{0,30} legal (to (use|spray)|in))\b/i;

const PRODUCT_ASK =
  /\b(what (can|should) i (spray|use|buy)|what fungicides?|what insecticides?|what herbicides?|what pesticides?|list of pesticides?|pesticides?( are| is)? available|available pesticides?|product (for|to use)|available locally|local (product|chemical|spray))\b/i;

const PROGRAM =
  /\b(incentive|grant|subsidy|government (programme|program|scheme|help)|youth agro|farmer registration|ministry (grant|incentive))\b/i;

const ALERT =
  /\b(disease alert|outbreak (warning|alert)|official (alert|advisory)|pest alert)\b/i;

const REGULATION =
  /\b(regulation|restricted pesticide|banned (pesticide|chemical)|import (permit|licence|license)|legal to (import|sell|spray))\b/i;

const EXTENSION =
  /\b(extension (advice|recommendation|officer)|ministry (says|guidance|recommend)|official (guide|bulletin))\b/i;

const WEATHER_NOW =
  /\b(forecast|weather (today|this week|now)|will it rain|rainfall (this|next)|humidity (today|this))\b/i;

const AVAILABILITY =
  /\b(in stock|can i (get|buy) .{0,20}(locally|in (trinidad|guyana|jamaica))|available (in|locally))\b/i;

export function detectResearchTopics(options: {
  message: string;
  intent?: IntentCategory | null;
  asksForProducts?: boolean;
  asksAboutWeather?: boolean;
}): ResearchTopic[] {
  const text = options.message.trim();
  const topics = new Set<ResearchTopic>();

  if (MARKET.test(text) || options.intent === "market" || options.intent === "pricing") {
    topics.add("market_prices");
  }
  if (PESTICIDE.test(text) || PRODUCT_ASK.test(text) || options.asksForProducts) {
    topics.add("pesticide_registration");
    topics.add("chemical_approval");
    if (/\blabel\b/i.test(text)) topics.add("product_label");
  }
  if (PROGRAM.test(text)) topics.add("government_program");
  if (ALERT.test(text)) topics.add("disease_alert");
  if (REGULATION.test(text)) topics.add("regulation");
  if (EXTENSION.test(text)) topics.add("extension");
  if (WEATHER_NOW.test(text) || options.asksAboutWeather) {
    topics.add("weather");
  }
  if (AVAILABILITY.test(text)) topics.add("input_availability");
  if (/\bministry\b/i.test(text) && /\b(guide|recommend|say|advice)\b/i.test(text)) {
    topics.add("government_guidance");
  }

  return [...topics];
}

export function countryIsRequired(topics: ResearchTopic[]): boolean {
  return topics.some(
    (topic) =>
      topic === "pesticide_registration" ||
      topic === "product_label" ||
      topic === "chemical_approval" ||
      topic === "market_prices" ||
      topic === "government_program" ||
      topic === "disease_alert" ||
      topic === "government_guidance" ||
      topic === "extension" ||
      topic === "regulation" ||
      topic === "input_availability" ||
      topic === "weather",
  );
}

export function shouldRunWebResearch(topics: ResearchTopic[]): boolean {
  return topics.some((topic) => topic !== "weather");
}

export function countryPromptIfNeeded(options: {
  country: string | null | undefined;
  topics: ResearchTopic[];
}): string | null {
  if (options.country) return null;
  if (!countryIsRequired(options.topics)) return null;
  return ASK_COUNTRY_QUESTION;
}

export const LOCAL_VERIFICATION_UNAVAILABLE =
  "I could not verify this from an official local source for your country.";
