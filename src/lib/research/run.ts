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
