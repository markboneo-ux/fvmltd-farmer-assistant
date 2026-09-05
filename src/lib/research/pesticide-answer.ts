/**
 * Farmer-facing pesticide-registration answers.
 * Never dump an unmanageable product wall. Never refuse with “contact extension”.
 */

import type { PesticideQuery } from "./pesticide-query";
import type { RegulatoryEvidence } from "./evidence";
import type { PesticideCheck, PesticideFarmerAnswer, WebSourceCitation } from "./types";
import {
  formatListingSample,
  type ParsedPesticideListing,
} from "./cfdd-listing";

export const PESTICIDE_FILTER_OPTIONS = [
  "By crop",
  "By pest/disease",
  "By active ingredient",
  "By trade name",
  "Full official register",
] as const;

export type { PesticideFarmerAnswer } from "./types";

export function isGenericRegulatoryRefusal(text: string): boolean {
  const lower = text.trim().toLowerCase();
  if (!lower) return false;
  if (/could you clarify what assistance you need/.test(lower)) return true;
  if (/what assistance do you need/.test(lower)) return true;
  const contactOnly =
    /^(please )?((you can |please )?(contact|refer to|check with) (the |your )?(local )?(ministry|extension( office| officer)?|authorities|regulator)).{0,80}$/i.test(
      text.trim(),
    );
  if (contactOnly) return true;
  const pointsAway =
    /\b(contact|refer to|visit) (the |your )?(ministry|extension( office| officer)?|authorities|regulator|official website)\b/i.test(
      text,
    );
  const noHelp =
    !/\b(crop|pest|active ingredient|trade name|i can (search|check|filter|still))\b/i.test(
      text,
    );
  if (pointsAway && noHelp) return true;
  const short = text.trim().length < 280;
  return short && pointsAway;
}

export function missingPublicRegisterMessage(country: string): string {
  return [
    `I could not complete a verified online lookup of a current public pesticide register for ${country}.`,
    `I can still help if you name a crop, pest, active ingredient, or product, using available ${country} and regional sources.`,
  ].join(" ");
}

function ttCfddDisplayName(country: string, organization?: string | null): string | null {
  if (country === "Trinidad and Tobago") {
    return "Chemistry, Food and Drugs Division (CFDD)";
  }
  return organization?.trim() || null;
}

export function lookupCouldNotBeCompletedMessage(country: string): string {
  return [
    `I could not complete the ${country} pesticide lookup from official listing pages.`,
    "I will not guess a register from a ministry homepage. Name a crop, pest, active ingredient, or product and I will try again.",
  ].join(" ");
}

export function broadRegisterFilterMessage(country: string, organization?: string | null): string {
  const sourceName = ttCfddDisplayName(country, organization);
  const opener = sourceName
    ? `${country}'s ${sourceName} maintains the pesticide registration records available through its public listings.`
    : `${country} has a large registered pesticide list maintained by the official regulator.`;
  return [
    opener,
    `Rather than dump hundreds of products, I can filter it for you by crop, pest, active ingredient or trade name.`,
    "For example, tell me:",
    "• celery",
    "• Cercospora",
    "• azoxystrobin",
    "• a product name",
    `and I'll check the ${country} registration data.`,
    "You can also ask for the full official listing link instead of a dump.",
  ].join("\n");
}

export function buildPesticideFarmerAnswer(options: {
  country: string;
  query: PesticideQuery;
  evidence: RegulatoryEvidence[];
  check: PesticideCheck | null;
  parsedProducts?: ParsedPesticideListing[];
  authorityContact?: { organization: string; url: string | null } | null;
}): PesticideFarmerAnswer {
  const registerEvidence = options.evidence.filter((item) => item.sufficientForRegisterLocation);
  const productEvidence = options.evidence.filter((item) => item.sufficientForProductClaim);
  const localEvidence = options.evidence.filter(
    (item) =>
      item.country &&
      item.country.toLowerCase() === options.country.toLowerCase(),
  );
  const samples = (options.parsedProducts ?? []).filter(
    (item) => item.registrationNumber || /registered/i.test(item.status || ""),
  );
  const registerFound = registerEvidence.length > 0 && (productEvidence.length > 0 || samples.length > 0);
  const listingSources = toSources(
    (localEvidence.length > 0 ? localEvidence : options.evidence).filter(
      (item) => item.sufficientForRegisterLocation || item.sufficientForProductClaim,
    ),
  );
  const sources = listingSources.length > 0 ? listingSources : [];
  const organization =
    productEvidence[0]?.organization ||
    registerEvidence[0]?.organization ||
    options.authorityContact?.organization ||
    null;
  const verificationLine = registerFound
    ? `Checked against ${options.country} official sources.`
    : null;

  if (!registerFound) {
    const lines = [
      options.evidence.length > 0
        ? lookupCouldNotBeCompletedMessage(options.country)
        : missingPublicRegisterMessage(options.country),
    ];
    if (options.authorityContact) {
      lines.push(
        `If you need to escalate after an online check fails, the official authority is ${options.authorityContact.organization}. That is secondary — I can still look up a specific crop, pest, active ingredient, or product name.`,
      );
    }
    return {
      country: options.country,
      farmerText: lines.join(" "),
      registerFound: false,
      offeredFilters: true,
      sources,
      verificationLine: null,
    };
  }

  if (options.query.isBroadList || options.query.kind === "broad_list" || options.query.kind === "full_register") {
    const lines = [broadRegisterFilterMessage(options.country, organization)];
    if (samples.length > 0) {
      lines.push(
        "Verified sample from the public listings (not the full register):",
        ...samples.slice(0, 3).map((item) => `• ${formatListingSample(item)}`),
      );
    }
    if (options.query.wantsFullList) {
      lines.push(
        "I am not dumping hundreds of products here. Ask me to search by crop, pest, active ingredient, or trade name, or ask for the official listing link.",
      );
    }
    return {
      country: options.country,
      farmerText: lines.join("\n"),
      registerFound: true,
      offeredFilters: true,
      sources,
      verificationLine,
    };
  }

  if (options.check?.verified && productEvidence.length > 0) {
    const productLines = [
      options.check.farmerNote,
      `Checked against ${options.country} official sources.`,
    ];
    return {
      country: options.country,
      farmerText: productLines.join(" "),
      registerFound: true,
      offeredFilters: false,
      sources,
      verificationLine,
    };
  }

  const target =
    options.query.tradeName ||
    options.query.activeIngredient ||
    options.query.crop ||
    options.query.pest ||
    "that product";
  const lines = [
    `I found the official ${options.country} pesticide listing, but I could not verify that ${target} is currently registered for the crop and use you asked about.`,
    "I can still search by crop, pest, active ingredient, or trade name against that listing. I will not treat another country's registration as legal proof.",
  ];
  return {
    country: options.country,
    farmerText: lines.join(" "),
    registerFound: true,
    offeredFilters: true,
    sources,
    verificationLine,
  };
}

function toSources(evidence: RegulatoryEvidence[]): WebSourceCitation[] {
  const seen = new Set<string>();
  const result: WebSourceCitation[] = [];
  for (const item of evidence) {
    const key = item.sourceUrl.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      name: item.organization,
      url: item.sourceUrl,
      organization: item.organization,
      publishedAt: item.publicationDate,
      checkedAt: item.retrievedDate,
      category:
        item.evidenceType === "regional_research" || item.evidenceType === "international_agronomy"
          ? "research"
          : "pesticide_registration",
      trustLevel: "official",
      supported: supportForEvidence(item),
    });
  }
  return result;
}

function supportForEvidence(item: RegulatoryEvidence): string {
  if (item.sufficientForProductClaim) return "pesticide product listing";
  if (item.sufficientForRegisterLocation) return "official pesticide register / listing";
  if (item.evidenceType === "regional_research") return "regional agronomy (not national registration)";
  if (item.evidenceType === "international_agronomy") {
    return "international agronomy (not national registration)";
  }
  return "background official page";
}

export function applyPesticideAnswerToText(options: {
  currentText: string;
  answer: PesticideFarmerAnswer | null;
}): string {
  if (!options.answer) return options.currentText;
  if (!options.currentText.trim() || isGenericRegulatoryRefusal(options.currentText)) {
    return options.answer.farmerText;
  }
  if (isGenericRegulatoryRefusal(options.currentText)) {
    return options.answer.farmerText;
  }
  const lower = options.currentText.toLowerCase();
  if (
    /\b(contact|refer to) (the |your )?(ministry|extension( office| officer)?|authorities)\b/i.test(
      options.currentText,
    ) &&
    options.currentText.trim().length < 500
  ) {
    return options.answer.farmerText;
  }
  if (options.answer.registerFound && !/register|crop|pest|active ingredient|trade name/i.test(lower)) {
    return options.answer.farmerText;
  }
  if (!options.answer.registerFound && !/could not find a current public pesticide register/i.test(lower)) {
    return options.answer.farmerText;
  }
  return options.currentText;
}
