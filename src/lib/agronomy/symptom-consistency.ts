/**
 * Keep the farmer-facing narrative aligned with what this case actually reported.
 * Template examples such as "yellow spots" must not overwrite "small brown spots."
 * Retrieved weather may add wet-context, but must not rewrite the observation.
 */

import type { KnownFarmerFacts } from "./tomato-protocol";
import type { AgronomicWeatherSignal } from "./agronomic-weather";
import { farmerReportedWetWeather } from "./evidence-hierarchy";

export type SymptomAttributes = {
  crop: string | null;
  symptomType: "spots" | "wilt" | "holes" | "yellowing" | "burn" | "pest" | null;
  colour: string | null;
  size: string | null;
  location: string | null;
  farmerPhrase: string | null;
  wetFromFarmer: boolean;
  weatherDerivedWet: boolean;
};

const COLOURS = "brown|yellow|black|dark|pale|tan|olive|purple|white|grey|gray";
const SIZES = "small|tiny|large|fine";
const LOCATIONS = "lower leaves|older leaves|upper leaves|new leaves|leaf tips|leaf edges|underside";

const SPOT_PHRASE = new RegExp(
  `\\b((?:${SIZES})\\s+)?(?:${COLOURS})\\s+spots?(?:\\s+on\\s+(?:the\\s+)?(?:${LOCATIONS}))?\\b`,
  "i",
);

export function extractSymptomAttributes(options: {
  facts?: KnownFarmerFacts | null;
  text?: string;
  weatherSignals?: AgronomicWeatherSignal[];
}): SymptomAttributes {
  const facts = options.facts ?? null;
  const text = (options.text ?? facts?.rawText ?? "").trim();
  const lower = text.toLowerCase();

  let symptomType: SymptomAttributes["symptomType"] = null;
  if (/\b(spots?|lesions?)\b/.test(lower)) symptomType = "spots";
  else if (/\bwilt/.test(lower)) symptomType = "wilt";
  else if (/\bholes?\b/.test(lower)) symptomType = "holes";
  else if (/\byellow(ing)?\b/.test(lower)) symptomType = "yellowing";
  else if (/\b(burn|scorch)\b/.test(lower)) symptomType = "burn";
  else if (/\bwhite\s*fl/.test(lower)) symptomType = "pest";

  const phraseMatch = text.match(SPOT_PHRASE);
  const farmerPhrase = phraseMatch?.[0]?.replace(/\s+/g, " ").trim() ?? null;

  const colourMatch = farmerPhrase
    ? farmerPhrase.match(new RegExp(`\\b(${COLOURS})\\b`, "i"))
    : lower.match(new RegExp(`\\b(${COLOURS})\\s+(spots?|lesions?|patches)\\b`, "i"));
  const sizeMatch = farmerPhrase
    ? farmerPhrase.match(new RegExp(`\\b(${SIZES})\\b`, "i"))
    : lower.match(new RegExp(`\\b(${SIZES})\\s+(?:${COLOURS}\\s+)?spots?\\b`, "i"));
  const locationMatch = lower.match(new RegExp(`\\b(${LOCATIONS})\\b`, "i"));

  const wetFromFarmer = farmerReportedWetWeather(text);
  const weatherDerivedWet = Boolean(
    options.weatherSignals?.includes("prolonged_wetness") ||
      options.weatherSignals?.includes("disease_pressure"),
  );

  return {
    crop: facts?.crop ?? null,
    symptomType,
    colour: colourMatch?.[1]?.toLowerCase() ?? null,
    size: sizeMatch?.[1]?.toLowerCase() ?? null,
    location: locationMatch?.[1]?.toLowerCase() ?? null,
    farmerPhrase,
    wetFromFarmer,
    weatherDerivedWet: weatherDerivedWet && !wetFromFarmer,
  };
}

export function describeObservedSpots(attrs: SymptomAttributes): string {
  if (attrs.farmerPhrase) return attrs.farmerPhrase;
  const bits = [attrs.size, attrs.colour, attrs.symptomType === "spots" ? "spots" : null].filter(
    Boolean,
  );
  let phrase = bits.join(" ").trim();
  if (phrase && attrs.location && !phrase.includes(attrs.location)) {
    phrase = `${phrase} on the ${attrs.location}`;
  }
  return phrase || "leaf spots";
}

function preserveNewlinesReplace(text: string, pattern: RegExp, replacement: string): string {
  return text.replace(pattern, replacement);
}

/**
 * Rewrite template/example symptom language so it matches this case.
 */
export function alignNarrativeToObservedSymptoms(
  text: string,
  attrs: SymptomAttributes,
): string {
  if (!text.trim()) return text;
  let next = text;
  const observed = describeObservedSpots(attrs);

  if (attrs.colour && attrs.colour !== "yellow") {
    next = preserveNewlinesReplace(
      next,
      /\byellow spots on the lower (tomato )?leaves\b/gi,
      observed,
    );
    next = preserveNewlinesReplace(next, /\byellow spots\b/gi, observed.replace(/\s+on the .+$/i, ""));
  }

  if (attrs.colour === "brown" && /\bbrown spots\b/i.test(observed)) {
    next = preserveNewlinesReplace(next, /\byellowing is even, with no true spots\b/gi, "colouring is even, with no true spots");
    next = preserveNewlinesReplace(
      next,
      /\beven yellowing without lesions\b/gi,
      "even colouring without lesions",
    );
    next = preserveNewlinesReplace(next, /\bfrom even yellowing\b/gi, "from even colouring");
  }

  if (!attrs.wetFromFarmer) {
    if (attrs.weatherDerivedWet) {
      next = preserveNewlinesReplace(
        next,
        /\bafter a wet week\b/gi,
        "with recent conditions that have been wet",
      );
      next = preserveNewlinesReplace(
        next,
        /\bafter (prolonged )?(wet weather|rain)\b/gi,
        "with recent wet conditions",
      );
    } else {
      next = preserveNewlinesReplace(next, /,?\s*after a wet week\b/gi, "");
      next = preserveNewlinesReplace(next, /,?\s*after (prolonged )?(wet weather|rain)\b/gi, "");
    }
  }

  return next;
}

export function hasStaleSymptomWording(text: string, attrs: SymptomAttributes): boolean {
  if (!text.trim()) return false;
  if (attrs.colour && attrs.colour !== "yellow" && /\byellow spots\b/i.test(text)) {
    return true;
  }
  if (
    attrs.colour &&
    attrs.symptomType === "spots" &&
    !new RegExp(`\\b${attrs.colour}\\s+spots?\\b`, "i").test(text) &&
    /\byellow spots\b/i.test(text)
  ) {
    return true;
  }
  if (!attrs.wetFromFarmer && !attrs.weatherDerivedWet && /\bafter a wet week\b/i.test(text)) {
    return true;
  }
  return false;
}
