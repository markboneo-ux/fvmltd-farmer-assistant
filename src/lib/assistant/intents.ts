/**
 * Lightweight farmer-intent classifier. Rule-based so tests stay deterministic
 * and we never force every request into a crop-diagnosis workflow.
 */

import { extractLastCrop } from "./crops";

export const INTENT_CATEGORIES = [
  "crop_problem",
  "pest_disease",
  "nutrition",
  "irrigation",
  "soil",
  "weather",
  "variety",
  "planting",
  "nursery",
  "production_planning",
  "harvest",
  "postharvest",
  "market",
  "farm_business",
  "cashflow",
  "costing",
  "pricing",
  "simple_math",
  "unit_conversion",
  "recordkeeping",
  "general_agriculture",
  "other",
] as const;

export type IntentCategory = (typeof INTENT_CATEGORIES)[number];

export type CaseType =
  | "crop_problem"
  | "farm_business"
  | "calculation"
  | "general";

export type ClassifiedIntent = {
  intent: IntentCategory;
  questionCategory: IntentCategory;
  calculationType: string | null;
  caseType: CaseType;
};

const NEW_TOPIC =
  /\b(new (question|topic|case|problem)|something else|different (crop|question|topic)|forget (that|this)|switch(ing)? to|now i (want|need|have)|another (crop|question|issue))\b/i;

export function isDiagnosticIntent(intent: IntentCategory): boolean {
  return (
    intent === "crop_problem" ||
    intent === "pest_disease" ||
    intent === "nutrition" ||
    intent === "irrigation" ||
    intent === "soil" ||
    intent === "weather" ||
    intent === "variety" ||
    intent === "planting" ||
    intent === "nursery" ||
    intent === "harvest" ||
    intent === "postharvest"
  );
}

export function isBusinessIntent(intent: IntentCategory): boolean {
  return (
    intent === "farm_business" ||
    intent === "cashflow" ||
    intent === "costing" ||
    intent === "pricing" ||
    intent === "market"
  );
}

export function isCalculationIntent(intent: IntentCategory): boolean {
  return intent === "simple_math" || intent === "unit_conversion";
}

export function caseTypeForIntent(intent: IntentCategory): CaseType {
  if (isCalculationIntent(intent)) return "calculation";
  if (isBusinessIntent(intent)) return "farm_business";
  if (isDiagnosticIntent(intent)) return "crop_problem";
  return "general";
}

function hasArithmeticQuestion(text: string): boolean {
  const lower = text.toLowerCase();
  const hasNumber = /\d/.test(lower);
  if (!hasNumber) return false;

  return (
    /\b(how much|how many|what is|what's|total|cost|revenue|profit|margin|times|multiply|percentage|percent|%|\+|x\s+\d|×)\b/i.test(
      lower,
    ) ||
    /\b\d+[\d,.]*(?:\s*(?:bags?|kg|lb|lbs|pounds?|acres?|plants?|trays?|cells?))\s+(?:at|each|x|×|times)\b/i.test(
      lower,
    ) ||
    /\b\d+[\d,.]*\s*(bags?|kg|lb)\s+at\s*\$?\s*\d/i.test(lower)
  );
}

function hasConversion(text: string): boolean {
  const lower = text.toLowerCase();
  if (/\bbags?\b/.test(lower) && /\b(kg|lb|lbs)\b/.test(lower)) return false;
  return /\b(convert|conversion|to kg|into kg|to lb|into lb|to hectares?|into hectares?|to acres?)\b/i.test(
    lower,
  );
}

export function classifyFarmerIntent(message: string): ClassifiedIntent {
  const text = message.trim();
  const lower = text.toLowerCase();

  if (hasConversion(lower) && /\d/.test(lower)) {
    return pack("unit_conversion", "unit_conversion");
  }

  if (
    /\b(cash\s*flow|cashflow|cash flow for (the )?bank|prepare a cashflow)\b/i.test(
      lower,
    )
  ) {
    return pack("cashflow");
  }

  if (
    /\b(market price|wholesale price|farmgate|namdevco|namis|jamis|what (is|are) .{0,40}selling for)\b/i.test(
      lower,
    )
  ) {
    return pack("pricing");
  }

  if (
    /\b(fertilizer|fertiliser|npk|urea|nutrient|deficiency|foliar)\b/i.test(lower) &&
    !/\b(cost|price|\$\s*\d)\b/.test(lower)
  ) {
    const calc =
      /\d/.test(lower) && /\b(acre|hectare|ha|how much)\b/.test(lower)
        ? "fertilizer_rate"
        : null;
    return pack("nutrition", "nutrition", calc);
  }

  if (hasArithmeticQuestion(lower) && !isClearlyCropProblem(lower)) {
    if (
      /\b(revenue|profit|margin|gross|break-?even|income)\b/.test(lower) &&
      !/\b(bag|kg|lb|plant|tray)\b/.test(lower)
    ) {
      return pack("simple_math", "simple_math", "farm_revenue");
    }
    if (/\b(cost|price|\$)\b/.test(lower) && /\b(bag|kg|lb|acre|plant)\b/.test(lower)) {
      return pack("simple_math", "costing", detectCalculationType(lower));
    }
    return pack("simple_math", "simple_math", detectCalculationType(lower));
  }

  if (
    /\b(break-?even|gross margin|loan repayment|farm (budget|plan|accounts?)|for the bank)\b/i.test(
      lower,
    )
  ) {
    return pack("farm_business");
  }

  if (
    /\b(pricing|what (should|can) i (charge|sell)|selling price|current price|market price|wholesale price|how much (should|can) i sell|is .{0,30} selling well)\b/i.test(
      lower,
    )
  ) {
    return pack("pricing");
  }

  if (
    /\b(costing|cost of production|production cost|input cost)\b/i.test(lower)
  ) {
    return pack("costing");
  }

  if (
    /\b(record|records|recordkeeping|logbook|farm diary|keep track)\b/i.test(lower)
  ) {
    return pack("recordkeeping");
  }

  if (
    /\b(white\s*fl|aphid|thrips|mite|worm|caterpillar|insect|pest|blight|leaf\s+spot|mildew|mould|mold|fungus|virus|nematode|rot)\b/i.test(
      lower,
    )
  ) {
    return pack("pest_disease");
  }

  if (
    /\b(wilt|stunt|yellow|chloros|leaf spots?|leaves? have spots?|spots? on.{0,40}(leaf|leaves|plants?)|holes? in (the )?leaf|dying plants?|crop (has a )?problem|plants? (are )?(sick|looking bad))/i.test(
      lower,
    ) ||
    (Boolean(extractLastCrop(text)) &&
      /\b(spot|wilt|yellow|hole|curl|mould|mold|sick|problem|stunt)\b/.test(lower))
  ) {
    return pack("crop_problem");
  }

  if (/\b(irrigat|drip|sprinkler|watering|water the)\b/i.test(lower)) {
    return pack("irrigation");
  }

  if (/\b(soil|drainage|waterlog|pH|compost|coco\s*peat)\b/i.test(lower)) {
    return pack("soil");
  }

  if (/\b(weather|forecast|rainfall|humidity|rainy|drought|heat wave)\b/i.test(lower)) {
    return pack("weather");
  }

  if (/\b(variety|cultivar|which variety|what variety)\b/i.test(lower)) {
    return pack("variety");
  }

  if (/\b(nursery|seedling|seed tray|germinate)\b/i.test(lower)) {
    return pack("nursery");
  }

  if (/\b(plant(ing)? date|transplant|spacing|how far apart|when (should|do) i plant)\b/i.test(lower)) {
    return pack("planting");
  }

  if (
    /\b(production plan|how many plants|how many acres should i|planting plan)\b/i.test(
      lower,
    )
  ) {
    return pack("production_planning");
  }

  if (/\b(harvest|picking|when (should|do) i pick)\b/i.test(lower)) {
    return pack("harvest");
  }

  if (/\b(post-?harvest|storage|packhouse|grading|ripen)\b/i.test(lower)) {
    return pack("postharvest");
  }

  if (/\b(farm|crop|plant|grow|agriculture|agronom)/i.test(lower)) {
    return pack("general_agriculture");
  }

  return pack("other");
}

function pack(
  intent: IntentCategory,
  questionCategory: IntentCategory = intent,
  calculationType: string | null = null,
): ClassifiedIntent {
  return {
    intent,
    questionCategory,
    calculationType,
    caseType: caseTypeForIntent(intent),
  };
}

function detectCalculationType(lower: string): string {
  if (/\bbags?\b/.test(lower) && /\b(kg|kilo)/.test(lower)) return "bags_to_kg";
  if (/\b(lb|lbs|pounds?)\b/.test(lower) && /\$|price|sell/.test(lower)) {
    return "weight_times_price";
  }
  if (/\bbags?\b/.test(lower) && /\$|cost|price/.test(lower)) return "bags_times_price";
  if (/\btrays?\b/.test(lower) && /\bcells?\b/.test(lower)) return "trays_times_cells";
  if (/\bplants?\b/.test(lower) && /\bspacing\b/.test(lower)) return "plants_times_spacing";
  if (/\byield\b/.test(lower) && /\bacres?\b/.test(lower)) return "yield_per_acre";
  if (/\bpercent|%|margin\b/.test(lower)) return "percentage";
  if (/\brevenue\b/.test(lower)) return "revenue";
  return "arithmetic";
}

function isClearlyCropProblem(lower: string): boolean {
  return /\b(wilt|spots? on|holes? in (the )?leaf|white\s*fl|blight|stunt)\b/.test(
    lower,
  );
}

const FOLLOW_UP_HINT =
  /^(yes|no|ok|okay|not sure|few plants|patches|most of (the )?field|whole field|none|not yet|same|still|a few)[\s.!?]*$/i;

const AGRONOMY_FOLLOW_UP =
  /\b(soil|wet|water|drain|spray|photo|leaf|leaves|stem|root|patch|field|plants?|wilt|yellow|sticky|mould|mold)\b/i;

export function isLikelyFollowUp(
  message: string,
  options?: { activeCrop?: string | null; hasHistory?: boolean },
): boolean {
  const text = message.trim();
  if (!text) return false;
  if (FOLLOW_UP_HINT.test(text)) return true;

  const namedCrop = extractLastCrop(text);
  if (namedCrop && options?.activeCrop && namedCrop !== options.activeCrop.toLowerCase()) {
    return false;
  }
  if (namedCrop && text.length > 24) {
    return false;
  }
  if (!options?.hasHistory && !options?.activeCrop) {
    return false;
  }
  if (text.length <= 90 && AGRONOMY_FOLLOW_UP.test(text) && !/\d+\s*(bags?|lb|kg)/i.test(text)) {
    return !isBusinessIntent(classifyFarmerIntent(text).intent);
  }
  return false;
}

export function isExplicitNewTopic(message: string): boolean {
  return NEW_TOPIC.test(message);
}

export function isSymptomLedProblem(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    isClearlyCropProblem(lower) ||
    /\b(white\s*fl|aphid|thrips|mite|blight|leaf\s+spot|mildew|mould|mold|pest|disease|wilting|spots? on)\b/i.test(
      lower,
    )
  );
}

function isStandaloneMathQuestion(message: string): boolean {
  return (
    hasArithmeticQuestion(message) &&
    /\b(how much will|how many kg|what is the revenue|what is the total)\b/i.test(
      message,
    )
  );
}

function asIntent(value: IntentCategory | string | null | undefined): IntentCategory | null {
  if (!value) return null;
  return INTENT_CATEGORIES.includes(value as IntentCategory)
    ? (value as IntentCategory)
    : null;
}

/**
 * Keep cashflow/business (and diagnosis follow-ups) on the same thread when
 * the farmer is answering, not starting a new topic.
 */
export function resolveConversationIntent(options: {
  message: string;
  activeIntent?: IntentCategory | string | null;
  activeCrop?: string | null;
  historyIntent?: IntentCategory | string | null;
}): ClassifiedIntent {
  const classified = classifyFarmerIntent(options.message);
  const previous = asIntent(options.activeIntent) ?? asIntent(options.historyIntent);
  if (!previous) return classified;

  if (
    shouldStartNewCase({
      message: options.message,
      activeCrop: options.activeCrop ?? null,
      activeIntent: previous,
    })
  ) {
    return classified;
  }

  if (isBusinessIntent(previous)) {
    if (isSymptomLedProblem(options.message) || classified.intent === "crop_problem" || classified.intent === "pest_disease") {
      return classified;
    }
    if (isStandaloneMathQuestion(options.message) && isCalculationIntent(classified.intent)) {
      return classified;
    }
    return pack(previous);
  }

  if (
    (isDiagnosticIntent(previous) || previous === "general_agriculture") &&
    isLikelyFollowUp(options.message, {
      activeCrop: options.activeCrop,
      hasHistory: true,
    }) &&
    !isBusinessIntent(classified.intent) &&
    !isCalculationIntent(classified.intent)
  ) {
    return pack(previous);
  }

  return classified;
}

export function shouldStartNewCase(options: {
  message: string;
  activeCrop: string | null;
  activeIntent: IntentCategory | string | null;
}): boolean {
  const classified = classifyFarmerIntent(options.message);
  if (isExplicitNewTopic(options.message)) return true;

  const previous = asIntent(options.activeIntent);
  const namedCrop = extractLastCrop(options.message);
  if (
    namedCrop &&
    options.activeCrop &&
    namedCrop !== options.activeCrop.toLowerCase()
  ) {
    if (previous && isBusinessIntent(previous) && !isSymptomLedProblem(options.message)) {
      // Naming the enterprise during cashflow is not a new crop-problem case.
    } else {
      return true;
    }
  }

  const prevIntent = previous || "crop_problem";
  const prevBusiness = isBusinessIntent(prevIntent) || isCalculationIntent(prevIntent);
  const nextBusiness =
    isBusinessIntent(classified.intent) || isCalculationIntent(classified.intent);
  const prevCrop = isDiagnosticIntent(prevIntent) || prevIntent === "general_agriculture";
  const nextCrop =
    classified.intent === "crop_problem" || classified.intent === "pest_disease";

  if (prevCrop && nextBusiness) return true;
  if (prevBusiness && (nextCrop || isSymptomLedProblem(options.message))) return true;
  if (prevBusiness && isStandaloneMathQuestion(options.message)) return true;
  if (
    prevBusiness &&
    classified.intent === "nutrition" &&
    /\bhow much\b/i.test(options.message)
  ) {
    return true;
  }
  if (prevBusiness && nextBusiness && classified.intent !== prevIntent) {
    if (classified.intent === "cashflow" && prevIntent !== "cashflow") return true;
  }

  return false;
}
