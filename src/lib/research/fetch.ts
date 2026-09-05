import type { CatalogTrustedSource, ResearchDocument } from "./types";
import { domainFromUrl, isTrustedDomain } from "./trusted-sources";

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

const DEFAULT_TIMEOUT_MS = 8000;

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function titleFromHtml(html: string): string {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match?.[1]?.trim() || "";
}

export async function fetchTrustedDocument(
  source: CatalogTrustedSource,
  options?: { fetchFn?: FetchFn; timeoutMs?: number },
): Promise<ResearchDocument> {
  const fetchFn = options?.fetchFn ?? fetch;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retrievedAt = new Date().toISOString();

  try {
    const response = await fetchFn(source.url, {
      headers: {
        Accept: "text/html,application/xhtml+xml,application/json",
        "User-Agent": "FVM-Crop-Solution/1.0 (research; fvmltd)",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      return {
        source,
        url: source.url,
        title: source.name,
        excerpt: "",
        retrievedAt,
        ok: false,
        failureReason: `HTTP ${response.status}`,
      };
    }
    const raw = await response.text();
    const excerpt = htmlToText(raw).slice(0, 4000);
    return {
      source,
      url: source.url,
      title: titleFromHtml(raw) || source.name,
      excerpt,
      retrievedAt,
      ok: true,
      failureReason: null,
    };
  } catch (error) {
    return {
      source,
      url: source.url,
      title: source.name,
      excerpt: "",
      retrievedAt,
      ok: false,
      failureReason: error instanceof Error ? error.message : "fetch failed",
    };
  }
}

type SearchHit = { title: string; url: string; snippet: string };

/**
 * Optional live search. Set TAVILY_API_KEY (preferred) or WEB_SEARCH_API_KEY.
 * If unset, research uses trusted-source fetches only.
 */
export async function optionalWebSearch(options: {
  query: string;
  country?: string | null;
  fetchFn?: FetchFn;
}): Promise<SearchHit[]> {
  const tavily = process.env.TAVILY_API_KEY?.trim();
  const generic = process.env.WEB_SEARCH_API_KEY?.trim();
  const key = tavily || generic;
  if (!key) return [];

  const fetchFn = options.fetchFn ?? fetch;
  try {
    const response = await fetchFn("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        query: options.query,
        search_depth: "basic",
        max_results: 5,
        include_answer: false,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return [];
    const payload = (await response.json()) as {
      results?: Array<{ title?: string; url?: string; content?: string }>;
    };
    const hits = (payload.results ?? [])
      .map((item) => ({
        title: item.title ?? "",
        url: item.url ?? "",
        snippet: item.content ?? "",
      }))
      .filter((item) => item.url);
    return hits.filter((hit) => isTrustedDomain(hit.url, options.country));
  } catch {
    return [];
  }
}

export function searchHitToDocument(hit: SearchHit, source: CatalogTrustedSource): ResearchDocument {
  return {
    source,
    url: hit.url,
    title: hit.title || source.name,
    excerpt: hit.snippet.slice(0, 4000),
    retrievedAt: new Date().toISOString(),
    ok: true,
    failureReason: null,
  };
}

export { domainFromUrl };
