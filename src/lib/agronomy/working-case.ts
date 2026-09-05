import type { KnownFarmerFacts } from "./tomato-protocol";
import { ASK_CROP_QUESTION } from "@/lib/assistant/crops";
import {
  ASK_COUNTRY_QUESTION,
  countryReliableForLocalFacts,
  type LocationConfidence,
} from "@/lib/assistant/farmer-context";

export type WorkingCaseFacts = {
  crop: string | null;
  variety: string | null;
  country: string | null;
  region: string | null;
  plantAge: string | null;
  protectedOrOpen: "protected" | "open_field" | null;
  acreage: string | null;
  symptom: string | null;
  symptomLocation: string | null;
  symptomProgression: string | null;
  irrigation: string | null;
  recentFertilizer: boolean;
  recentPesticide: boolean;
  recentUnusualWeather: boolean;
  hasPhotos: boolean;
};

export function extractWorkingCase(
  facts: KnownFarmerFacts,
  options: { hasPhotos?: boolean } = {},
): WorkingCaseFacts {
  const text = facts.rawText.toLowerCase();
  const symptomLocation = facts.distributionHint
    ? null
    : /\b(tips?|edges?|margins?)\b/.test(text)
      ? "tips or edges"
      : /\b(spots?|lesions?)\b/.test(text)
        ? "separate spots"
        : /\b(lower|older)\s+leaves\b/.test(text)
          ? "older leaves"
          : /\b(new|young)\s+(leaves|growth)\b/.test(text)
            ? "new growth"
            : null;

  return {
    crop: facts.crop,
    variety: facts.variety,
    country: facts.country,
    region: facts.district,
    plantAge: facts.plantAge,
    protectedOrOpen:
      facts.productionSystem === "open_field"
        ? "open_field"
        : facts.productionSystem
          ? "protected"
          : null,
    acreage: facts.areaPlanted,
    symptom: facts.suspectedIssue,
    symptomLocation,
    symptomProgression: /\b(spreading|getting worse|overnight|suddenly)\b/.test(text)
      ? "progressing"
      : null,
    irrigation: facts.irrigationType,
    recentFertilizer: Boolean(facts.recentFertilizer),
    recentPesticide: Boolean(facts.recentPesticide),
    recentUnusualWeather: /\b(heavy rain|heat wave|dry spell|hot sun|humid)\b/.test(text),
    hasPhotos: Boolean(options.hasPhotos),
  };
}

export function highestValueMissingQuestion(options: {
  working: WorkingCaseFacts;
  locationConfidence?: LocationConfidence | null;
  asksForProducts?: boolean;
  photoRecommended?: boolean;
  diagnostic?: boolean;
}): string {
  const { working } = options;
  if (options.diagnostic && !working.crop) return ASK_CROP_QUESTION;

  if (
    options.asksForProducts &&
    !countryReliableForLocalFacts(options.locationConfidence ?? "unknown")
  ) {
    if (working.country) {
      return `Just to confirm, are you farming in ${working.country}?`;
    }
    return ASK_COUNTRY_QUESTION;
  }

  const skipPatternQuestion =
    working.symptom === "whiteflies" ||
    working.symptom === "wilt" ||
    working.symptom === "stunting";

  if (
    options.diagnostic &&
    !working.symptomLocation &&
    !skipPatternQuestion &&
    (working.symptom || working.crop)
  ) {
    return "Are the brown or yellow areas starting at the leaf tips, edges, or as separate spots?";
  }

  if (options.photoRecommended && !working.hasPhotos) {
    return "Can you send a close photo of the affected leaf plus a whole plant?";
  }

  if (
    options.asksForProducts &&
    !countryReliableForLocalFacts(options.locationConfidence ?? "unknown")
  ) {
    return working.country
      ? `Just to confirm, are you farming in ${working.country}?`
      : ASK_COUNTRY_QUESTION;
  }

  return "";
}
