import type { WebSourceCitation } from "./types";

export function formatFarmerSources(citations: WebSourceCitation[]): string {
  if (citations.length === 0) return "";
  const unique = dedupeCitations(citations).slice(0, 4);
  return `Sources:\n${unique.map((item) => `• ${item.name}`).join("\n")}`;
}

export function dedupeCitations(citations: WebSourceCitation[]): WebSourceCitation[] {
  const seen = new Set<string>();
  const result: WebSourceCitation[] = [];
  for (const item of citations) {
    const key = (item.url || item.name).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}
