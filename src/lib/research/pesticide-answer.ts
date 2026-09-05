/**
 * Farmer-facing pesticide-registration answers.
 * Never dump an unmanageable product wall. Never refuse with “contact extension”.
 */

import type { PesticideQuery } from "./pesticide-query";
import type { RegulatoryEvidence } from "./evidence";
import type { PesticideCheck, PesticideFarmerAnswer, WebSourceCitation } from "./types";

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
  const short = text.trim().length < 280;
  const pointsAway =
    /\b(contact|refer to) (the |your )?(ministry|extension( office| officer)?|authorities)\b/i.test(
      text,
    );
  const noHelp =
    !/\b(crop|pest|active ingredient|trade name|register|i can (search|check|still))\b/i.test(
      text,
    );
  return short && pointsAway && noHelp;
}

export function missingPublicRegisterMessage(country: string): string {
  return [
    `I could not find a current public pesticide register for ${country} that I can verify online.`,
    `I can still check a specific crop, pest, active ingredient, or product against available ${country} and regional sources.`,
  ].join(" ");
}

export function broadRegisterFilterMessage(country: string): string {
  return [
    `${country} has a large register of approved pesticide products. I can search it for you. It is more useful to narrow it by crop, pest, active ingredient, or trade name.`,
    "You can ask me:",
    "- By crop",
    "- By pest/disease",
    "- By active ingredient",
    "- By trade name",
    "- Full official register",
  ].join("\n");
}

export function buildPesticideFarmerAnswer(options: {
  country: string;
  query: PesticideQuery;
  evidence: RegulatoryEvidence[];
  check: PesticideCheck | null;
  parsedProducts?: Array<{ tradeName: string | null; activeIngredient: string | null; status: string | null }>;
  authorityContact?: { organization: string; url: string | null } | null;
}): PesticideFarmerAnswer {
  const registerEvidence = options.evidence.filter((item) => item.sufficientForRegisterLocation);
  const productEvidence = options.evidence.filter((item) => item.sufficientForProductClaim);
  const localEvidence = options.evidence.filter(
    (item) =>
      item.country &&
      item.country.toLowerCase() === options.country.toLowerCase(),
  );
  const registerFound = registerEvidence.length > 0;
  const sources = toSources(localEvidence.length > 0 ? localEvidence : options.evidence);
  const verificationLine = registerFound
    ? `Checked against ${options.country} official sources.`
    : null;

  if (!registerFound) {
    const lines = [missingPublicRegisterMessage(options.country)];
    if (options.authorityContact) {
      lines.push(
        `The relevant official authority is ${options.authorityContact.organization}. That is secondary information — I can still look up a specific crop, pest, active ingredient, or product name.`,
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
    const lines = [broadRegisterFilterMessage(options.country)];
    const best = registerEvidence[0];
    if (options.query.wantsFullList && best) {
      lines.push(
        `The verified official source is the ${best.organization} listing. I am not dumping hundreds of products here. Open the official register, or ask me to search by crop, pest, active ingredient, or trade name.`,
      );
    } else {
      lines.push(
        `I checked the official ${options.country} pesticide listing. I have not claimed that any specific product is registered for a crop unless a country listing for that product was retrieved.`,
      );
    }
    return {
      country: options.country,
      farmerText: lines.join("\n\n"),
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
