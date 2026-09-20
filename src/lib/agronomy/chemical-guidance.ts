/**
 * Country-aware spray / pesticide language.
 * Never invent registration. Always separate verified vs general classes.
 */

import type { PesticideCheck } from "@/lib/research/types";
import type { VerifiedInputDisplay } from "./case-schema";

export type SprayGuidance = {
  verifiedLines: string[];
  unverifiedClasses: string[];
  farmerText: string;
  localRegistrationVerified: boolean;
};

const FOLIAR_SPOT_CLASSES = [
  "Protectant copper products",
  "Mancozeb- or chlorothalonil-class protectants",
  "Strobilurin (QoI) or DMI fungicides only later, in rotation, if a programme is justified",
];

const WHITEFLY_CLASSES = [
  "Insecticidal soap or oil where the crop and label allow",
  "Biopesticides such as Beauveria where available",
  "A locally labelled whitefly insecticide, rotating IRAC groups if you do spray",
];

export const SPRAY_NEEDED_HEADING = "If a spray is needed";

export function couldNotVerifyUse(country: string, crop?: string | null): string {
  void crop;
  return `I could not verify a current ${country} registration for this exact use.`;
}

export function generalClassesFor(options: {
  pestOrDisease?: string | null;
  observedPest?: string | null;
  asksForSpray?: boolean;
}): string[] {
  const needle = `${options.observedPest ?? ""} ${options.pestOrDisease ?? ""}`.toLowerCase();
  if (/\bwhitefl/.test(needle)) return WHITEFLY_CLASSES;
  if (/\b(spot|blight|fungal|cercospora|septoria|mould|mold|mildew)\b/.test(needle)) {
    return FOLIAR_SPOT_CLASSES;
  }
  if (options.asksForSpray) {
    return [
      "Start with cultural and monitoring steps",
      "Use a product only if it is labelled for this crop and pest in your country",
    ];
  }
  return [];
}

export function buildSprayGuidance(options: {
  country: string | null;
  crop: string | null;
  target: string | null;
  observedPest?: string | null;
  diagnosisConfidence?: string | null;
  asksForSpray: boolean;
  verifiedInputs?: VerifiedInputDisplay[];
  pesticideChecks?: PesticideCheck[];
}): SprayGuidance | null {
  if (!options.asksForSpray) return null;

  const country = options.country?.trim() || null;
  const verifiedInputs = (options.verifiedInputs ?? []).filter(
    (item) =>
      item.registrationStatus === "registered" &&
      item.verifiedBrands.some((brand) => brand.registrationStatus === "registered"),
  );
  const verifiedChecks = (options.pesticideChecks ?? []).filter((item) => item.verified);
  const localRegistrationVerified = verifiedInputs.length > 0 || verifiedChecks.length > 0;

  const verifiedLines: string[] = [];
  for (const item of verifiedInputs.slice(0, 3)) {
    const brand = item.verifiedBrands.find((entry) => entry.registrationStatus === "registered");
    verifiedLines.push(
      brand
        ? `${brand.brandName} (${item.activeIngredientOrNutrient}) — listed as registered for this country in our verified catalogue. Still read the current local label.`
        : `${item.activeIngredientOrNutrient} — listed as registered. Still read the current local label.`,
    );
  }
  for (const check of verifiedChecks.slice(0, 2)) {
    if (check.activeIngredient) {
      verifiedLines.push(
        `${check.activeIngredient} — verified from ${check.sourceName ?? "an official source"} for ${check.country ?? country}. Still read the current local label.`,
      );
    }
  }

  const unverifiedClasses = localRegistrationVerified
    ? []
    : generalClassesFor({
        pestOrDisease: options.target,
        observedPest: options.observedPest,
        asksForSpray: true,
      });

  const parts: string[] = [];
  const uncertain =
    !options.diagnosisConfidence ||
    options.diagnosisConfidence === "possible" ||
    options.diagnosisConfidence === "unknown";

  if (uncertain && !options.observedPest) {
    parts.push(
      "A spray only helps if we have the right target. Check the spot or pest type first so you do not buy the wrong product.",
    );
  }

  if (!country) {
    parts.push(
      "I need the country before I can say whether a product is registered. I can still outline general management classes, clearly labelled as not locally verified.",
    );
  } else if (!localRegistrationVerified) {
    parts.push(couldNotVerifyUse(country, options.crop));
  }

  if (verifiedLines.length > 0) {
    parts.push(`Verified for this country/crop: ${verifiedLines.join(" ")}`);
  }

  if (unverifiedClasses.length > 0) {
    parts.push(
      `General active-ingredient classes, NOT verified local recommendations: ${unverifiedClasses.join("; ")}.`,
    );
    parts.push(
      "These are management classes used in similar crops, not a statement that they are registered or for sale in your country. Read the local label and regulator list before you buy or spray.",
    );
  }

  parts.push(
    "Cultural steps come first: keep leaves drier if you can, avoid moving through wet plants, and scout before you spray.",
  );

  if (/\bwhitefl/.test(`${options.observedPest ?? ""} ${options.target ?? ""}`.toLowerCase())) {
    parts.push(
      "If you do spray for whiteflies, rotate IRAC groups and do not use the same chemistry over and over. That is resistance management, not a product pitch.",
    );
  }

  return {
    verifiedLines,
    unverifiedClasses,
    farmerText: parts.join(" "),
    localRegistrationVerified,
  };
}

export function hasUnverifiedCountryPesticideClaim(text: string): boolean {
  return (
    /\b(registered in|approved in|legal to spray in)\b/i.test(text) &&
    !/\b(could not verify|haven't verified|not verified|have not verified)\b/i.test(text)
  );
}
