/**
 * Server-side country-specific web research.
 * Failures return general agronomy notes — never fabricated local facts.
 */

import { farmerFacingCitations } from "./citations";
import { canonicalizeCountry } from "./countries";
import { isStale, staleWarning, topicRequiresFreshSource } from "./freshness";
import { formatPesticideBlock, pesticideCheckFromEvidence } from "./pesticides";
import { countryIsRequired, LOCAL_VERIFICATION_UNAVAILABLE } from "./policy";
import {
  defaultPageFetcher,
  domainFromUrl,
  filterHitsToTrustedCountry,
  resolveSearchProvider,
  trustedHomepageHits,
} from "./provider";
import { sourceByDomain } from "./sources";
import type {
  MarketPriceNote,
  ResearchResult,
  ResearchTopic,
  SearchHit,
  WebCitation,
} from "./types";

import type { IntentCategory } from "@/lib/assistant/intents";
import type { ResearchNeed, WebResearchResult } from "./types";
import { classifyResearchNeed } from "./should-research";
import { isSourceStale, researchTargetsForNeed } from "./trusted-sources";
import { fetchTrustedDocument, optionalWebSearch, type FetchFn } from "./fetch";
import {
  detectPriceKind,
  distinguishPriceKindsReminder,
  extractMarketCrop,
  formatMarketQuote,
  parseNamisPriceHtml,
  quoteIsStale,
} from "./market";
import { verifyPesticideForCountry } from "./pesticides";
import { recordResearchEvent } from "./log";
import { dedupeCitations } from "./citations";

export const WEB_LOOKUP_FAILED_FARMER =
  "I couldn't complete the online lookup, but I can still help based on the information you've given me.";

const OTHER_COUNTRY_LEAK =
  /\b(trinidad|tobago|namdevco|namis)\b/i;

export async function runCountryResearch(options: {
  message: string;
  country: string | null;
  crop?: string | null;
  pestOrDisease?: string | null;
  topics: ResearchTopic[];
}): Promise<ResearchResult> {
  const country = canonicalizeCountry(options.country);
  const topics = options.topics;
  const empty: ResearchResult = {
    used: false,
    topics,
    country,
    countryRequired: countryIsRequired(topics),
    countryMissing: countryIsRequired(topics) && !country,
    citations: [],
    pesticideChecks: [],
    marketNotes: [],
    generalNotes: [],
    staleWarnings: [],
    failure: null,
    farmerFallback: null,
  };

  if (topics.length === 0) return empty;

  if (!country && countryIsRequired(topics)) {
    return {
      ...empty,
      countryMissing: true,
      generalNotes: [
        "Country is needed before local pesticide, price, or government information can be checked.",
      ],
    };
  }

  const browseTopics = topics.filter((topic) => topic !== "weather");
  if (browseTopics.length === 0) return empty;

  try {
    const query = buildQuery({
      message: options.message,
      country,
      crop: options.crop,
      topics: browseTopics,
    });
    const provider = resolveSearchProvider();
    let hits: SearchHit[] = [];
    try {
      hits = await provider.search(query, {
        country,
        allowedDomains: trustedHomepageHits(country, browseTopics[0]).map((item) => item.domain),
      });
    } catch (error) {
      return {
        ...empty,
        used: true,
        failure: {
          stage: "search",
          errorType: error instanceof Error ? error.name : "search_error",
          message: error instanceof Error ? error.message : "search failed",
        },
        farmerFallback: WEB_LOOKUP_FAILED_FARMER,
        generalNotes: [LOCAL_VERIFICATION_UNAVAILABLE],
      };
    }

    const homepage = trustedHomepageHits(country, browseTopics[0]);
    hits = filterHitsToTrustedCountry([...hits, ...homepage], country);

    if (country && country !== "Trinidad and Tobago") {
      hits = hits.filter((hit) => {
        const source = sourceByDomain(hit.domain);
        if (!source) return false;
        if (source.country === "Trinidad and Tobago" && country !== "Trinidad and Tobago") {
          return false;
        }
        return true;
      });
    }

    const citations: WebCitation[] = [];
    const staleWarnings: string[] = [];
    for (const hit of hits.slice(0, 6)) {
      const source = sourceByDomain(hit.domain);
      if (!source) continue;
      const topic = browseTopics[0];
      const stale = topicRequiresFreshSource(topic)
        ? isStale({
            topic,
            retrievedAt: hit.retrievedAt,
            publishedAt: hit.publishedAt,
          })
        : false;
      citations.push({
        url: hit.url,
        retrievedAt: hit.retrievedAt,
        title: hit.title,
        sourceName: source.sourceName,
        country: source.country === "regional" ? country : source.country,
        sourceType: source.sourceType,
        publishedAt: hit.publishedAt,
        stale,
      });
      if (stale) {
        const warning = staleWarning({
          publishedAt: hit.publishedAt,
          retrievedAt: hit.retrievedAt,
        });
        if (warning) staleWarnings.push(`${source.sourceName}: ${warning}`);
      }
    }

    const pesticideTopics = browseTopics.some(
      (topic) =>
        topic === "pesticide_registration" ||
        topic === "chemical_approval" ||
        topic === "product_label",
    );
    const pesticideChecks = pesticideTopics
      ? [
          pesticideCheckFromEvidence({
            crop: options.crop ?? null,
            pestOrDisease: options.pestOrDisease ?? null,
            country,
            farmerText: options.message,
            hits,
          }),
        ]
      : [];

    const marketNotes: MarketPriceNote[] = [];
    if (browseTopics.includes("market_prices") && country) {
      const marketHits = hits.filter((hit) => sourceByDomain(hit.domain)?.sourceType === "market_data");
      if (marketHits.length === 0) {
        marketNotes.push({
          commodity: options.crop ?? null,
          country,
          priceText: null,
          priceType: "unknown",
          sourceName: "none confirmed",
          sourceUrl: null,
          retrievedAt: new Date().toISOString(),
          publishedAt: null,
          stale: false,
        });
      }
      for (const hit of marketHits.slice(0, 2)) {
        const source = sourceByDomain(hit.domain)!;
        const page = await defaultPageFetcher(hit.url);
        const text = `${hit.snippet} ${page?.text ?? ""}`;
        marketNotes.push({
          commodity: options.crop ?? null,
          country,
          priceText: extractPriceSnippet(text),
          priceType: inferPriceType(text, source.sourceName),
          sourceName: source.sourceName,
          sourceUrl: hit.url,
          retrievedAt: page?.retrievedAt ?? hit.retrievedAt,
          publishedAt: page?.publishedAt ?? hit.publishedAt,
          stale: isStale({
            topic: "market_prices",
            retrievedAt: page?.retrievedAt ?? hit.retrievedAt,
            publishedAt: page?.publishedAt ?? hit.publishedAt,
          }),
        });
      }
    }

    const localUnavailable =
      citations.length === 0 &&
      pesticideChecks.every((item) => !item.verified) &&
      marketNotes.every((item) => !item.priceText);

    return {
      used: true,
      topics,
      country,
      countryRequired: countryIsRequired(topics),
      countryMissing: false,
      citations,
      pesticideChecks,
      marketNotes,
      generalNotes: localUnavailable
        ? [
            LOCAL_VERIFICATION_UNAVAILABLE,
            "I can still give general agronomic guidance. Verify local rules, labels, and prices before you act.",
          ]
        : pesticideChecks.filter((item) => !item.verified).map((item) => item.farmerNote),
      staleWarnings,
      failure: null,
      farmerFallback: null,
    };
  } catch (error) {
    return {
      ...empty,
      used: true,
      failure: {
        stage: "fetch",
        errorType: error instanceof Error ? error.name : "research_error",
        message: error instanceof Error ? error.message : "research failed",
      },
      farmerFallback: WEB_LOOKUP_FAILED_FARMER,
      generalNotes: [LOCAL_VERIFICATION_UNAVAILABLE],
    };
  }
}

function buildQuery(options: {
  message: string;
  country: string | null;
  crop?: string | null;
  topics: ResearchTopic[];
}): string {
  const parts = [options.message];
  if (options.country) parts.push(options.country);
  if (options.crop) parts.push(options.crop);
  if (options.topics.includes("market_prices")) parts.push("wholesale market price official");
  if (options.topics.includes("pesticide_registration")) {
    parts.push("pesticide register official");
  }
  return parts.join(" ").slice(0, 400);
}

function inferPriceType(text: string, sourceName: string): MarketPriceNote["priceType"] {
  const lower = text.toLowerCase();
  if (/\bwholesale\b/.test(lower) || /namdevco|namis/i.test(sourceName)) return "wholesale";
  if (/\bfarm\s*gate|farmgate\b/.test(lower)) return "farmgate";
  if (/\bretail\b/.test(lower)) return "retail";
  return "unknown";
}

function extractPriceSnippet(text: string): string | null {
  const match = text.match(
    /\b([A-Za-z][A-Za-z\s]{2,20})\s+(?:\$|TT\$|GY\$|J\$)?\s*(\d+(?:\.\d+)?)\s*(?:\/|per)\s*(kg|lb|bag|head|unit)/i,
  );
  return match ? match[0].trim() : null;
}

export function researchNotesForPrompt(result: ResearchResult): string {
  if (result.countryMissing) {
    return "Country is unknown and required for this local question. Ask: What country are you farming in? Give only general agronomy until the country is known. Do not use Trinidad information for another country.";
  }
  if (!result.used) return "";

  const lines: string[] = [
    "WEB RESEARCH (server-attached — do not invent extra local facts):",
  ];
  if (result.failure) {
    lines.push(WEB_LOOKUP_FAILED_FARMER);
    lines.push("Answer from general agronomic knowledge only. Do not invent local registration or prices.");
    return lines.join("\n");
  }
  if (result.country) lines.push(`Country in scope: ${result.country}.`);
  for (const note of result.generalNotes) lines.push(note);
  for (const check of result.pesticideChecks) {
    lines.push(formatPesticideBlock(check));
  }
  for (const market of result.marketNotes) {
    if (!market.priceText) {
      lines.push(
        `No verified ${market.country} market price was found. Do not invent a price. Do not substitute another country's market.`,
      );
      continue;
    }
    lines.push(
      `${market.sourceName} (${market.priceType} price — not assumed farmgate): ${market.priceText}`,
    );
    if (market.stale && market.publishedAt) {
      lines.push(`This source was last updated on ${market.publishedAt.slice(0, 10)}.`);
    }
  }
  for (const warning of result.staleWarnings) lines.push(warning);
  const citations = farmerFacingCitations(result.citations);
  if (citations) lines.push(citations);
  if (result.country && result.country !== "Trinidad and Tobago" && OTHER_COUNTRY_LEAK.test(lines.join(" "))) {
    return `Do not use Trinidad and Tobago sources for ${result.country}. ${LOCAL_VERIFICATION_UNAVAILABLE}`;
  }
  return lines.join("\n");
}

export function unusedDomain(_url: string) {
  return domainFromUrl(_url);
}

export type RunWebResearchOptions = {
  message: string;
  country?: string | null;
  crop?: string | null;
  issue?: string | null;
  intent?: IntentCategory | null;
  caseId?: string | null;
  fetchFn?: FetchFn;
  now?: number;
};

function categoryForNeed(need: ResearchNeed) {
  switch (need) {
    case "market_prices":
      return "market_prices" as const;
    case "pesticide_registration":
    case "product_label":
      return "pesticide_registration" as const;
    case "government_guidance":
      return "government_guidance" as const;
    case "financing":
      return "financing" as const;
    case "pest_alerts":
      return "pest_alerts" as const;
    case "regulatory":
      return "regulatory" as const;
    case "weather":
      return "weather" as const;
    default:
      return null;
  }
}

export async function runWebResearch(
  options: RunWebResearchOptions,
): Promise<WebResearchResult> {
  const need = classifyResearchNeed({
    message: options.message,
    intent: options.intent,
  });
  const country = options.country?.trim() || "";
  const empty: WebResearchResult = {
    needed: need,
    usedWeb: false,
    documents: [],
    citations: [],
    marketQuotes: [],
    pesticide: null,
    brief: "",
    failures: [],
    outdatedSources: [],
  };

  if (need === "none") {
    return empty;
  }

  if (!country) {
    return {
      ...empty,
      brief:
        "Country is unknown. Do not assume Trinidad and Tobago. Ask: What country are you farming in? Do not invent registrations, prices, or programmes.",
    };
  }

  const category = categoryForNeed(need);
  const targets = researchTargetsForNeed(country, category, need);

  const documents = await Promise.all(
    targets.map((source) => fetchTrustedDocument(source, { fetchFn: options.fetchFn })),
  );

  const searchHits = await optionalWebSearch({
    query: `${options.message} ${country}`,
    country,
    fetchFn: options.fetchFn,
  });
  for (const hit of searchHits.slice(0, 2)) {
    const match = targets.find((source) => hit.url.includes(source.domain)) ?? targets[0];
    if (match) {
      documents.push({
        source: match,
        url: hit.url,
        title: hit.title || match.name,
        excerpt: hit.snippet,
        retrievedAt: new Date().toISOString(),
        ok: true,
        failureReason: null,
      });
    }
  }

  const failures = documents
    .filter((doc) => !doc.ok)
    .map((doc) => ({
      sourceName: doc.source.name,
      reason: doc.failureReason || "fetch failed",
    }));
  const okDocs = documents.filter((doc) => doc.ok);
  const now = options.now ?? Date.now();
  const outdatedSources = targets
    .filter((source) => isSourceStale(source, now))
    .map((source) => ({
      sourceName: source.name,
      lastCheckedAt: source.lastCheckedAt,
    }));

  const citations = dedupeCitations(
    okDocs.map((doc) => ({
        name: doc.source.name,
        url: doc.url,
        organization: doc.source.name,
        publishedAt: doc.source.lastCheckedAt,
        category: doc.source.category,
        trustLevel: doc.source.trustLevel,
    })),
  );

  let pesticide = null;
  let marketQuotes = empty.marketQuotes;
  let brief = "";

  if (need === "pesticide_registration" || need === "product_label") {
    pesticide = verifyPesticideForCountry({
      country,
      crop: options.crop,
      issue: options.issue,
      message: options.message,
    });
    brief = pesticide.farmerMessage;
    if (!pesticide.verified) {
      brief += " Do not use another country's pesticide registration as proof.";
    }
    if (pesticide.sourceName && pesticide.verified) {
      citations.unshift({
        name: pesticide.sourceName,
        url: pesticide.sourceUrl,
        organization: pesticide.sourceName,
        publishedAt: pesticide.lastVerifiedAt,
        category: "pesticide_registration",
        trustLevel: "official_government",
      });
    }
  }

  if (need === "market_prices") {
    const crop = extractMarketCrop(options.message, options.crop) || "produce";
    const kind = detectPriceKind(options.message);
    const localMarket = okDocs.find(
      (doc) =>
        doc.source.country.toLowerCase() === country.toLowerCase() ||
        (country.toLowerCase().includes("trinidad") &&
          /namis|namdevco/i.test(doc.source.domain + doc.source.name)),
    );
    if (!localMarket) {
      brief = `I do not have a verified current market-price source for ${country}. Do not quote another Caribbean country's prices as local.`;
    } else {
      const namis = localMarket;
      const parsed = /namis|namdevco/i.test(namis.source.domain + namis.source.name)
        ? parseNamisPriceHtml(namis.excerpt, crop)
        : { amount: null, unit: "kg" };
      const asOf = namis.retrievedAt ?? null;
      const quote = {
        crop,
        country,
        priceKind: kind,
        unit: parsed.unit,
        amount: parsed.amount,
        currency: country.toLowerCase().includes("trinidad") ? "TT$" : "local",
        marketName: /namdevco|namis/i.test(namis.source.name) ? "NAMDEVCO wholesale market" : namis.source.name,
        asOf,
        stale: quoteIsStale(asOf, now),
        sourceName: namis.source.name,
        sourceUrl: namis.url,
        note: null,
      };
      marketQuotes = [quote];
      brief = [formatMarketQuote(quote), distinguishPriceKindsReminder(kind)].join("\n");
      if (!citations.some((item) => item.url === namis.url)) {
        citations.unshift({
          name: namis.source.name,
          url: namis.url,
          organization: namis.source.name,
          publishedAt: asOf,
          category: "market_prices",
          trustLevel: namis.source.trustLevel,
          supported: "market prices",
          checkedAt: asOf,
        });
      }
    }
  }

  if (!brief && okDocs[0]?.excerpt) {
    brief = `${okDocs[0].source.name}: ${okDocs[0].excerpt.slice(0, 400)}`;
  }

  const usedWeb = okDocs.length > 0 || Boolean(pesticide);
  recordResearchEvent({
    caseId: options.caseId ?? null,
    usedWeb,
    need,
    sources: citations.map((item) => item.name),
    failures,
    outdatedSources: outdatedSources.map((item) => item.sourceName),
  });

  return {
    needed: need,
    usedWeb,
    documents,
    citations: dedupeCitations(citations),
    marketQuotes,
    pesticide,
    brief,
    failures,
    outdatedSources,
  };
}

export function formatResearchBriefForModel(result: WebResearchResult): string {
  if (result.needed === "none") return "";
  const lines = [
    `WEB RESEARCH (${result.needed}):`,
    result.brief || "No fresh web excerpt was retrieved.",
  ];
  if (result.failures.length > 0) {
    lines.push(
      `Source failures: ${result.failures.map((item) => `${item.sourceName} (${item.reason})`).join("; ")}`,
    );
  }
  if (result.citations.length > 0) {
    lines.push(
      "Use these facts silently. Do not name the source organisations in the farmer-facing answer — the server attaches a collapsed Sources used list.",
    );
  }
  lines.push(
    "Do not invent prices, registrations, or programmes beyond this brief. If data may be old, say so.",
  );
  if (result.needed === "pesticide_registration" || result.needed === "product_label") {
    lines.push(
      "Pesticide logic: country → crop → problem → active ingredient → local registration → label → local trade name only if verified. Never assume a trade name is legal. Only include rates, PHI, REI, or intervals if this brief verifies a current label.",
      "Fallback order: official local source → regional research institution → recognized international research → general agronomy. Never use another Caribbean country's pesticide registration as proof.",
    );
  }
  return lines.join("\n");
}
