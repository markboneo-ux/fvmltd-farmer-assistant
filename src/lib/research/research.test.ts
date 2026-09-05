import { describe, expect, it, afterEach } from "vitest";
import { extractCountryFromText } from "./countries";
import { isStale, staleWarning } from "./freshness";
import {
  pesticideCheckFromEvidence,
  trinidadCannotProveGuyana,
  UNVERIFIED_CHEMICAL_TEMPLATE,
} from "./pesticides";
import { detectResearchTopics, shouldRunWebResearch } from "./policy";
import { setPageFetcherForTests, setSearchProviderForTests } from "./provider";
import { runCountryResearch, WEB_LOOKUP_FAILED_FARMER } from "./run";
import { sourceByDomain, sourcesForCountry } from "./sources";
import type { SearchHit } from "./types";

afterEach(() => {
  setSearchProviderForTests(null);
  setPageFetcherForTests(null);
});

function hit(overrides: Partial<SearchHit>): SearchHit {
  return {
    url: "https://example.com",
    title: "Example",
    snippet: "",
    domain: "example.com",
    retrievedAt: new Date().toISOString(),
    publishedAt: null,
    ...overrides,
  };
}

describe("country extraction", () => {
  it("reads Caribbean countries from farmer text", () => {
    expect(extractCountryFromText("I farm in Guyana")).toBe("Guyana");
    expect(extractCountryFromText("Trinidad market prices")).toBe("Trinidad and Tobago");
    expect(extractCountryFromText("celery in Couva")).toBe("Trinidad and Tobago");
    expect(extractCountryFromText("My celery leaves are yellow")).toBeNull();
  });
});

describe("trusted source registry", () => {
  it("configures NAMDEVCO and TT ministry as official TT sources", () => {
    const tt = sourcesForCountry("Trinidad and Tobago");
    expect(tt.some((item) => item.domain === "namdevco.com")).toBe(true);
    expect(tt.some((item) => item.domain === "namistt.com")).toBe(true);
    expect(tt.some((item) => item.domain === "agriculture.gov.tt")).toBe(true);
    expect(tt.some((item) => item.domain === "health.gov.tt")).toBe(true);
    expect(sourceByDomain("ptccb.org.gy")?.country).toBe("Guyana");
    expect(sourceByDomain("agriculture.gov.vc")?.country).toBe(
      "Saint Vincent and the Grenadines",
    );
    expect(sourceByDomain("agriculture.gov.ag")?.country).toBe("Antigua and Barbuda");
  });

  it("does not treat a Trinidad source as Guyana proof", () => {
    expect(
      trinidadCannotProveGuyana({
        questionCountry: "Guyana",
        sourceCountry: "Trinidad and Tobago",
      }),
    ).toBe(true);
  });
});

describe("research policy", () => {
  it("triggers web research for a current Trinidad market question", () => {
    const topics = detectResearchTopics({
      message: "What is the NAMDEVCO wholesale price for celery in Trinidad this week?",
    });
    expect(topics).toContain("market_prices");
    expect(shouldRunWebResearch(topics)).toBe(true);
  });

  it("does not browse for a general celery yellowing question", () => {
    const topics = detectResearchTopics({
      message: "My celery leaves are yellow but there are no spots.",
    });
    expect(shouldRunWebResearch(topics)).toBe(false);
  });
});

describe("pesticide verification", () => {
  it("does not treat a Trinidad hit as Guyana registration", () => {
    const check = pesticideCheckFromEvidence({
      crop: "celery",
      pestOrDisease: "leaf miner",
      country: "Guyana",
      farmerText: "Is imidacloprid registered for celery in Guyana?",
      hits: [
        hit({
          url: "https://www.namdevco.com/",
          domain: "namdevco.com",
          title: "NAMDEVCO",
          snippet: "imidacloprid registered for celery in Trinidad",
        }),
      ],
    });
    expect(check.verified).toBe(false);
    expect(check.countryStatus).toBe("not_verified");
    expect(check.farmerNote).toContain("Guyana");
  });

  it("labels an unverified chemical clearly", () => {
    const check = pesticideCheckFromEvidence({
      crop: "tomato",
      pestOrDisease: "whiteflies",
      country: "Trinidad and Tobago",
      farmerText: "Can I spray ProductX on tomato?",
      hits: [],
    });
    expect(check.verified).toBe(false);
    expect(check.farmerNote).toBe(
      UNVERIFIED_CHEMICAL_TEMPLATE("Trinidad and Tobago"),
    );
  });

  it("can cite a verified local regulator hit", () => {
    const check = pesticideCheckFromEvidence({
      crop: "tomato",
      pestOrDisease: "whiteflies",
      country: "Guyana",
      farmerText: "Is imidacloprid registered in Guyana?",
      hits: [
        hit({
          url: "https://ptccb.org.gy/register",
          domain: "ptccb.org.gy",
          title: "PTCCB register",
          snippet: "Imidacloprid is registered. Registration number GY-123.",
        }),
      ],
    });
    expect(check.verified).toBe(true);
    expect(check.sourceName).toMatch(/Pesticides and Toxic Chemicals/i);
  });

  it("can cite the Trinidad CFDD portal only when that listing says registered", () => {
    const check = pesticideCheckFromEvidence({
      crop: "celery",
      pestOrDisease: null,
      country: "Trinidad and Tobago",
      farmerText: "Is malathion registered in Trinidad?",
      hits: [
        hit({
          url: "https://health.gov.tt/cfdd/pesticides/search/7514",
          domain: "health.gov.tt",
          title: "Malathion 57 EC",
          snippet: "Malathion Status Registered. Trinidad and Tobago Product Registration Number TTPR0176-003.",
        }),
      ],
    });
    expect(check.verified).toBe(true);
    expect(check.sourceName).toMatch(/Chemistry, Food and Drugs/i);
  });
});

describe("runCountryResearch", () => {
  it("runs web research for Trinidad market questions against NAMDEVCO/NAMIS", async () => {
    setSearchProviderForTests({
      name: "mock",
      async search() {
        return [
          hit({
            url: "https://www.namistt.com/",
            domain: "namistt.com",
            title: "Wholesale market reports",
            snippet: "Celery wholesale $12.00 / kg at Macoya",
          }),
        ];
      },
    });
    setPageFetcherForTests(async (url) => ({
      url,
      title: "NAMIS",
      text: "Wholesale Prices Celery Kg 12.00",
      retrievedAt: new Date().toISOString(),
      publishedAt: new Date().toISOString(),
      status: 200,
    }));

    const result = await runCountryResearch({
      message: "What is the current celery market price in Trinidad?",
      country: "Trinidad and Tobago",
      crop: "celery",
      topics: ["market_prices"],
    });
    expect(result.used).toBe(true);
    expect(result.citations.some((item) => /namdevco|namis/i.test(item.sourceName))).toBe(
      true,
    );
    expect(result.marketNotes[0]?.priceType).toBe("wholesale");
  });

  it("still returns a safe general fallback when search fails", async () => {
    setSearchProviderForTests({
      name: "mock-fail",
      async search() {
        throw new Error("network down");
      },
    });
    const result = await runCountryResearch({
      message: "Is imidacloprid registered in Guyana?",
      country: "Guyana",
      crop: "tomato",
      topics: ["pesticide_registration"],
    });
    expect(result.failure).not.toBeNull();
    expect(result.farmerFallback).toBe(WEB_LOOKUP_FAILED_FARMER);
    expect(result.pesticideChecks.every((item) => !item.verified)).toBe(true);
  });
});

describe("freshness", () => {
  it("flags old market data as stale", () => {
    expect(
      isStale({
        topic: "market_prices",
        retrievedAt: "2020-01-01T00:00:00.000Z",
        publishedAt: "2020-01-01T00:00:00.000Z",
      }),
    ).toBe(true);
    expect(staleWarning({ retrievedAt: "2020-01-01T00:00:00.000Z" })).toMatch(
      /last updated on 2020-01-01/,
    );
  });
});
