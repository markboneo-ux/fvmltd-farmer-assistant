/**
 * Pluggable web search. Tests inject a mock. Production may use Brave, Tavily,
 * or trusted-domain fetch only. Never invent search hits.
 */

import { allowedDomainsFor, sourceByDomain } from "./sources";
import type { FetchedPage, PageFetcher, SearchHit, SearchProvider } from "./types";

let injectedProvider: SearchProvider | null = null;
let injectedFetcher: PageFetcher | null = null;

export function setSearchProviderForTests(provider: SearchProvider | null) {
  injectedProvider = provider;
}

export function setPageFetcherForTests(fetcher: PageFetcher | null) {
  injectedFetcher = fetcher;
}

export function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function envProviderName(): string {
  return (process.env.WEB_SEARCH_PROVIDER || "").trim().toLowerCase() || "none";
}

export function resolveSearchProvider(): SearchProvider {
  if (injectedProvider) return injectedProvider;
  const name = envProviderName();
  if (name === "brave" && process.env.BRAVE_SEARCH_API_KEY) {
    return braveProvider();
  }
  if (name === "tavily" && process.env.TAVILY_API_KEY) {
    return tavilyProvider();
  }
  return noneProvider();
}

function noneProvider(): SearchProvider {
  return {
    name: "none",
    async search() {
      return [];
    },
  };
}

function braveProvider(): SearchProvider {
  return {
    name: "brave",
    async search(query, options) {
      const params = new URLSearchParams({
        q: query,
        count: "8",
      });
      if (options?.allowedDomains?.length) {
        params.set("site", options.allowedDomains[0]);
      }
      const response = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY || "",
        },
      });
      if (!response.ok) {
        throw new Error(`brave_search_${response.status}`);
      }
      const json = (await response.json()) as {
        web?: { results?: Array<{ url?: string; title?: string; description?: string }> };
      };
      const retrievedAt = new Date().toISOString();
      return (json.web?.results ?? [])
        .map((item) => ({
          url: item.url || "",
          title: item.title || "",
          snippet: item.description || "",
          domain: domainFromUrl(item.url || ""),
          retrievedAt,
          publishedAt: null,
        }))
        .filter((item) => item.url);
    },
  };
}

function tavilyProvider(): SearchProvider {
  return {
    name: "tavily",
    async search(query, options) {
      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: process.env.TAVILY_API_KEY,
          query,
          include_domains: options?.allowedDomains ?? [],
          max_results: 8,
        }),
      });
      if (!response.ok) {
        throw new Error(`tavily_search_${response.status}`);
      }
      const json = (await response.json()) as {
        results?: Array<{ url?: string; title?: string; content?: string }>;
      };
      const retrievedAt = new Date().toISOString();
      return (json.results ?? [])
        .map((item) => ({
          url: item.url || "",
          title: item.title || "",
          snippet: item.content || "",
          domain: domainFromUrl(item.url || ""),
          retrievedAt,
          publishedAt: null,
        }))
        .filter((item) => item.url);
    },
  };
}

export async function defaultPageFetcher(url: string): Promise<FetchedPage | null> {
  if (injectedFetcher) return injectedFetcher(url);
  try {
    const response = await fetch(url, {
      headers: { Accept: "text/html,application/xhtml+xml,text/plain" },
      redirect: "follow",
    });
    const html = await response.text();
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return {
      url,
      title: decodeHtml(titleMatch?.[1]?.trim() || url),
      text: stripHtml(html).slice(0, 20_000),
      retrievedAt: new Date().toISOString(),
      publishedAt: extractPublishedDate(html),
      status: response.status,
    };
  } catch {
    return null;
  }
}

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extractPublishedDate(html: string): string | null {
  const prop =
    html.match(
      /<meta[^>]+(?:property|name)=["'](?:article:published_time|og:updated_time|date)["'][^>]+content=["']([^"']+)/i,
    ) ||
    html.match(
      /content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:article:published_time|og:updated_time|date)["']/i,
    );
  return prop?.[1] ?? null;
}

export function filterHitsToTrustedCountry(
  hits: SearchHit[],
  country: string | null,
): SearchHit[] {
  return hits.filter((hit) => {
    const source = sourceByDomain(hit.domain);
    if (!source || !source.active) return false;
    if (source.country === "regional") return true;
    if (!country) return false;
    return source.country.toLowerCase() === country.toLowerCase();
  });
}

export function trustedHomepageHits(
  country: string | null,
  topic?: Parameters<typeof allowedDomainsFor>[1],
): SearchHit[] {
  const retrievedAt = new Date().toISOString();
  return allowedDomainsFor(country, topic)
    .map((domain) => {
      const source = sourceByDomain(domain);
      if (!source?.homepageUrl) return null;
      return {
        url: source.homepageUrl,
        title: source.sourceName,
        snippet: source.notes,
        domain,
        retrievedAt,
        publishedAt: source.lastReviewedAt,
      } satisfies SearchHit;
    })
    .filter((item): item is SearchHit => Boolean(item));
}
