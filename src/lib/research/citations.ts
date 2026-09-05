/**
 * Farmer-facing source lines. Prefer source names over raw URLs.
 */

import type { WebCitation } from "./types";

export function farmerFacingCitations(citations: WebCitation[]): string {
  if (citations.length === 0) return "";
  const lines = citations.map((item) => `- ${item.sourceName} — ${citationHint(item)}`);
  return `Sources:\n${lines.join("\n")}`;
}

function citationHint(item: WebCitation): string {
  if (item.sourceType === "market_data") return "market information";
  if (item.sourceType === "regulator") return "pesticide / chemical information";
  if (item.sourceType === "government") return "crop guidance";
  if (item.sourceType === "extension") return "extension guidance";
  if (item.sourceType === "university" || item.sourceType === "research_institute") {
    return "research / technical guidance";
  }
  return item.title || "public source";
}

export function citationForUi(item: WebCitation): { name: string; url: string; hint: string } {
  return {
    name: item.sourceName,
    url: item.url,
    hint: citationHint(item),
  };
}
