/**
 * Country-aware spray / pesticide language.
 * Never invent registration. Always separate verified vs general classes.
 * Never show a "classes" heading unless actual classes are named.
 */

import type { PesticideCheck } from "@/lib/research/types";
import type { VerifiedInputDisplay } from "./case-schema";

export type SprayGuidance = {
  verifiedLines: string[];
  unverifiedClasses: string[];
  farmerText: string;
  localRegistrationVerified: boolean;
};

export const SPRAY_NEEDED_HEADING = "If a spray is needed";

export const FUNGAL_LEAF_SPOT_HEADING = "IF THE SPOTS FIT A FUNGAL LEAF SPOT";
export const BACTERIAL_LEAF_SPOT_HEADING = "IF THE SPOTS FIT A BACTERIAL LEAF SPOT";

export const NARROW_SPRAY_TARGET =
  "Avoid choosing a disease-specific spray until the likely target is narrowed enough to select the right type of product.";

const FUNGAL_LEAF_SPOT_CLASSES = [
  "Mancozeb- or chlorothalonil-class protectants",
  "Copper protectants",
  "Strobilurin (QoI) or DMI fungicides only later, in rotation, if a programme is justified",
];

const BACTERIAL_LEAF_SPOT_CLASSES = [
  "Copper-based bactericides or protectants where the crop and label allow",
  "A product labelled for bacterial spot or speck on this crop, only if a current local label exists",
];

const WHITEFLY_CLASSES = [
  "Insecticidal soap or oil where the crop and label allow",
  "Biopesticides such as Beauveria where available",
  "A locally labelled whitefly insecticide, rotating IRAC groups if you do spray",
];

export function couldNotVerifyUse(country: string, crop?: string | null): string {
  void crop;
  return `I could not verify a current ${country} registration for this exact use.`;
}

export function sanitizePrematureSprayWording(text: string): string {
  if (!text.trim()) return text;
  return text
    .replace(
      /\bavoid spraying until the cause is confirmed\.?/gi,
      NARROW_SPRAY_TARGET,
    )
    .replace(
      /\b(hold a spray|do not start a spray|avoid spraying) until (we know(?: fungal vs bacterial)?|the (?:spot type|cause) is (?:clearer|confirmed))\.?/gi,
      NARROW_SPRAY_TARGET,
    )
    .replace(
      /\bhold extra fertilizer and do not start a spray until the spot type is clearer\.?/gi,
      `Hold extra fertilizer. ${NARROW_SPRAY_TARGET}`,
    );
}

function isWhitefly(options: {
  pestOrDisease?: string | null;
  observedPest?: string | null;
}): boolean {
  return /\bwhitefl/.test(`${options.observedPest ?? ""} ${options.pestOrDisease ?? ""}`.toLowerCase());
}

function fungalBacterialSplit(options: {
  pestOrDisease?: string | null;
  likelyCauses?: string[];
  crop?: string | null;
  spotsObserved?: boolean;
}): boolean {
  if (options.spotsObserved === false) return false;
  const blob = `${options.pestOrDisease ?? ""} ${(options.likelyCauses ?? []).join(" ")}`.toLowerCase();
  const fungal = /\b(cercospora|septoria|early blight|alternaria|fungal|frogeye|anthracnose)\b/.test(
    blob,
  );
  const bacterial = /\bbacterial\b/.test(blob);
  if (fungal && bacterial) return true;
  const leafSpots =
    /\b(leaf\s+spots?|foliar fungal disease|spots?)\b/.test(blob) ||
    options.pestOrDisease === "foliar fungal disease";
  const splitCrop = options.crop === "pepper" || options.crop === "tomato";
  return Boolean(leafSpots && splitCrop);
}

export function generalClassesFor(options: {
  pestOrDisease?: string | null;
  observedPest?: string | null;
  asksForSpray?: boolean;
  likelyCauses?: string[];
  crop?: string | null;
  spotsObserved?: boolean;
}): string[] {
  if (isWhitefly(options)) return WHITEFLY_CLASSES;
  if (options.spotsObserved === false && !isWhitefly(options)) return [];
  if (fungalBacterialSplit(options)) {
    return [...FUNGAL_LEAF_SPOT_CLASSES, ...BACTERIAL_LEAF_SPOT_CLASSES];
  }
  const needle = `${options.observedPest ?? ""} ${options.pestOrDisease ?? ""} ${(options.likelyCauses ?? []).join(" ")}`.toLowerCase();
  if (/\b(bacterial)\b/.test(needle) && !/\b(cercospora|septoria|fungal|blight)\b/.test(needle)) {
    return BACTERIAL_LEAF_SPOT_CLASSES;
  }
  if (/\b(spot|blight|fungal|cercospora|septoria|mould|mold|mildew)\b/.test(needle)) {
    return FUNGAL_LEAF_SPOT_CLASSES;
  }
  return [];
}

function formatUnverifiedClasses(country: string | null, classes: string[]): string {
  const where = country ? ` for ${country}` : " locally";
  return `General classes only, not verified${where}: ${classes.join("; ")}.`;
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
  likelyCauses?: string[];
  admittedCauses?: string[];
  spotsObserved?: boolean;
}): SprayGuidance | null {
  if (!options.asksForSpray) return null;
  const causeLabels =
    options.admittedCauses && options.admittedCauses.length > 0
      ? options.admittedCauses
      : options.likelyCauses;

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

  const split = fungalBacterialSplit({
    pestOrDisease: options.target,
    likelyCauses: causeLabels,
    crop: options.crop,
    spotsObserved: options.spotsObserved,
  });
  const whitefly = isWhitefly({
    pestOrDisease: options.target,
    observedPest: options.observedPest,
  });

  const unverifiedClasses = localRegistrationVerified
    ? []
    : generalClassesFor({
        pestOrDisease: options.target,
        observedPest: options.observedPest,
        asksForSpray: true,
        likelyCauses: causeLabels,
        crop: options.crop,
        spotsObserved: options.spotsObserved,
      });

  const parts: string[] = [];

  if (!country) {
    parts.push(
      "I need the country before I can say whether a product is registered.",
    );
  } else if (!localRegistrationVerified) {
    parts.push(couldNotVerifyUse(country, options.crop));
  }

  if (verifiedLines.length > 0) {
    parts.push(`Verified for this country/crop: ${verifiedLines.join(" ")}`);
  }

  if (!localRegistrationVerified && split) {
    parts.push(
      "Fungal and bacterial leaf spots need different product choices.",
    );
    parts.push(FUNGAL_LEAF_SPOT_HEADING);
    parts.push(formatUnverifiedClasses(country, FUNGAL_LEAF_SPOT_CLASSES));
    parts.push(BACTERIAL_LEAF_SPOT_HEADING);
    parts.push(formatUnverifiedClasses(country, BACTERIAL_LEAF_SPOT_CLASSES));
    parts.push(
      "Look closely: pale-centred or target-like spots raise a fungal leaf spot; greasy or water-soaked specks raise a bacterial leaf spot.",
    );
    parts.push(NARROW_SPRAY_TARGET);
  } else if (!localRegistrationVerified && unverifiedClasses.length > 0) {
    parts.push(formatUnverifiedClasses(country, unverifiedClasses));
    parts.push(
      "These are management classes used in similar crops, not a statement that they are registered or for sale in your country. Read the local label and regulator list before you buy or spray.",
    );
    if (!whitefly) parts.push(NARROW_SPRAY_TARGET);
  } else if (!localRegistrationVerified && unverifiedClasses.length === 0) {
    parts.push(
      options.spotsObserved === false
        ? "I cannot name a product class yet. I need a closer look at the curled and yellowing leaves — insects underneath versus an even nutrient pattern — before choosing a product."
        : "I cannot name a product class yet. I need a closer look at the spots — pale centre versus greasy water-soaked — before choosing between fungal and bacterial management.",
    );
    parts.push(NARROW_SPRAY_TARGET);
  }

  parts.push(
    "Cultural steps come first: keep leaves drier if you can, avoid moving through wet plants, and scout before you spray.",
  );

  if (whitefly) {
    parts.push(
      "If you do spray for whiteflies, rotate IRAC groups and do not use the same chemistry over and over. That is resistance management, not a product pitch.",
    );
  }

  return {
    verifiedLines,
    unverifiedClasses,
    farmerText: sanitizePrematureSprayWording(parts.join("\n")),
    localRegistrationVerified,
  };
}

export function hasUnverifiedCountryPesticideClaim(text: string): boolean {
  return (
    /\b(registered in|approved in|legal to spray in)\b/i.test(text) &&
    !/\b(could not verify|haven't verified|not verified|have not verified)\b/i.test(text)
  );
}
