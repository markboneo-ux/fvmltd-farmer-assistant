import type { IntentCategory } from "@/lib/assistant/intents";
import { isCalculationIntent } from "@/lib/assistant/intents";
import type { ResearchNeed } from "./types";

const MARKET =
  /\b(current price|today'?s price|wholesale price|retail price|market price|what is (the )?(price|celery|pumpkin|tomato).{0,20}(selling|price)|how much (is|are|should i sell|can i sell)|is .{0,20} selling well|selling well|farmgate|namdevco|namis)\b/i;

const PESTICIDE =
  /\b(registered|registration|approved (spray|chemical|pesticide|fungicide|insecticide)|what (can|should) i (spray|use)|what chemical|what fungicide|what insecticide|pesticide|label (rate|information)|is .{0,40} (legal|allowed|registered) (in|for))\b/i;

const LABEL = /\b(product label|label (info|information|rate)|pre-?harvest interval|re-?entry)\b/i;

const GUIDANCE =
  /\b(ministry of agriculture|extension (advice|bulletin)|government (programme|program|grant)|official (advice|guidance)|cardi (bulletin|alert))\b/i;

const FINANCING =
  /\b(loan|grant|financing|finance scheme|agricultural (credit|incentive)|subsidy|ADB |agricultural development bank)\b/i;

const ALERTS =
  /\b(pest alert|disease alert|outbreak|quarantine|recent (pest|disease) (alert|warning))\b/i;

const REGULATORY =
  /\b(import permit|pesticide law|banned (chemical|pesticide)|restricted use)\b/i;

/**
 * Browse the public web only when the question needs fresh or local information.
 * Stable agronomy (why leaves yellow, how to scout whiteflies) stays offline.
 */
export function classifyResearchNeed(options: {
  message: string;
  intent?: IntentCategory | null;
}): ResearchNeed {
  const text = options.message.trim();
  const intent = options.intent ?? null;

  if (intent && isCalculationIntent(intent)) return "none";

  if (intent === "pricing" || MARKET.test(text)) return "market_prices";
  if (intent === "cashflow" && MARKET.test(text)) return "market_prices";
  if (LABEL.test(text)) return "product_label";
  if (intent === "pest_disease" && PESTICIDE.test(text)) return "pesticide_registration";
  if (PESTICIDE.test(text)) return "pesticide_registration";
  if (FINANCING.test(text)) return "financing";
  if (ALERTS.test(text)) return "pest_alerts";
  if (REGULATORY.test(text)) return "regulatory";
  if (GUIDANCE.test(text)) return "government_guidance";

  return "none";
}

export function shouldUseWebResearch(options: {
  message: string;
  intent?: IntentCategory | null;
}): boolean {
  return classifyResearchNeed(options) !== "none";
}
