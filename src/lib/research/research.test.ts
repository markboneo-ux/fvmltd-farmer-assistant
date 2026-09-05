import { describe, expect, it } from "vitest";
import { classifyFarmerIntent } from "@/lib/assistant/intents";
import { classifyResearchNeed, shouldUseWebResearch } from "./should-research";
import { rankSources, sourcesByCategory, trustRank } from "./trusted-sources";
import {
  detectPriceKind,
  formatMarketQuote,
  parseNamisPriceHtml,
} from "./market";
import {
  sanitizeUnverifiedPesticideClaims,
  verifyPesticideForCountry,
} from "./pesticides";
import { runWebResearch } from "./run";
import { unverifiedRegistrationMessage } from "./types";

describe("web research gating", () => {
  it("requests web data for a current market-price question", () => {
    const message = "What is the current price of pumpkin?";
    expect(classifyFarmerIntent(message).intent).toBe("pricing");
    expect(classifyResearchNeed({ message, intent: "pricing" })).toBe("market_prices");
    expect(shouldUseWebResearch({ message, intent: "pricing" })).toBe(true);
  });

  it("does not browse the web for stable agronomy", () => {
    expect(
      shouldUseWebResearch({
        message: "Why do celery leaves turn yellow from nitrogen deficiency?",
        intent: "nutrition",
      }),
    ).toBe(false);
  });

  it("gates live research for the Preview smoke prompts", () => {
    expect(
      shouldUseWebResearch({
        message: "I'm in Trinidad. My celery is burning from the edges.",
        intent: "crop_problem",
      }),
    ).toBe(false);
    expect(
      shouldUseWebResearch({
        message:
          "I'm a commercial celery farmer in Trinidad. My root-zone EC is 2.8 and the older leaves have marginal scorch.",
        intent: "crop_problem",
      }),
    ).toBe(false);
    expect(
      classifyResearchNeed({
        message: "I'm growing sweet pepper in Guyana. What can I spray for Cercospora?",
        intent: "pest_disease",
      }),
    ).toBe("pesticide_registration");
    expect(
      shouldUseWebResearch({
        message: "I have 18 trays with 128 seedlings each. How many plants?",
        intent: "simple_math",
      }),
    ).toBe(false);
    expect(
      shouldUseWebResearch({
        message: "I grow 3 acres of cucumber. Help me prepare a cashflow for the bank.",
        intent: "cashflow",
      }),
    ).toBe(false);
    expect(
      shouldUseWebResearch({
        message: "My lettuce has brown edges.",
        intent: "crop_problem",
      }),
    ).toBe(false);
  });
});

describe("web source ranking", () => {
  it("ranks government and NAMDEVCO above other sources", () => {
    const ranked = rankSources(sourcesByCategory("Trinidad and Tobago", "market_prices"));
    expect(ranked[0]?.name).toMatch(/NAMDEVCO|NAMIS/i);
    expect(trustRank("official_government")).toBeGreaterThan(trustRank("other"));
    expect(trustRank("statutory_authority")).toBeGreaterThan(trustRank("manufacturer"));
  });
});

describe("country-specific pesticide verification", () => {
  it("does not treat Trinidad registration as Guyana approval", () => {
    const guyana = verifyPesticideForCountry({
      country: "Guyana",
      crop: "tomato",
      issue: "whiteflies",
      activeIngredient: "imidacloprid",
    });
    expect(guyana.verified).toBe(false);
    expect(guyana.farmerMessage).toBe(unverifiedRegistrationMessage("Guyana", "tomato"));

    const trinidad = verifyPesticideForCountry({
      country: "Trinidad and Tobago",
      crop: "tomato",
      issue: "whiteflies",
      activeIngredient: "imidacloprid",
    });
    expect(trinidad.country).toBe("Trinidad and Tobago");
    expect(trinidad.verified || trinidad.status === "registered").toBe(true);
  });

  it("does not claim unverified pesticide approval", () => {
    const verification = verifyPesticideForCountry({
      country: "Barbados",
      activeIngredient: "imidacloprid",
      crop: "tomato",
    });
    const text = sanitizeUnverifiedPesticideClaims(
      "Imidacloprid is registered in Barbados so you can spray it today.",
      verification,
    );
    expect(text).toMatch(/haven't verified registration/i);
    expect(text.toLowerCase()).not.toMatch(/is registered in barbados so you can spray/);
  });
});

describe("market price parsing", () => {
  it("reads NAMDEVCO-style pumpkin wholesale figures", () => {
    const html = `
      <table><tr><td>Pumpkin</td><td>Kg</td><td>4.41</td></tr></table>
    `;
    expect(parseNamisPriceHtml(html, "pumpkin").amount).toBe(4.41);
    expect(detectPriceKind("What is the current price of pumpkin?")).toBe("wholesale");
    expect(detectPriceKind("How much should I sell celery for?")).toBe("farmer_selling");
    const quote = formatMarketQuote({
      crop: "pumpkin",
      country: "Trinidad and Tobago",
      priceKind: "wholesale",
      unit: "kg",
      amount: 4.41,
      currency: "TT$",
      marketName: "NAMDEVCO wholesale market",
      asOf: "2026-09-04T00:00:00.000Z",
      stale: false,
      sourceName: "NAMDEVCO NAMIS market data",
      sourceUrl: "https://namistt.com/",
      note: null,
    });
    expect(quote).toMatch(/wholesale/);
    expect(quote).toMatch(/4\.41/);
  });

  it("fetches a mocked NAMDEVCO page for a market-price web request", async () => {
    const html = "Highlights Pumpkin Kg 4.41 Cucumber Kg 11.11";
    const result = await runWebResearch({
      message: "What is the current price of pumpkin?",
      country: "Trinidad and Tobago",
      crop: "pumpkin",
      intent: "pricing",
      fetchFn: async () =>
        new Response(html, { status: 200, headers: { "Content-Type": "text/html" } }),
    });
    expect(result.needed).toBe("market_prices");
    expect(result.usedWeb).toBe(true);
    expect(result.marketQuotes[0]?.amount).toBe(4.41);
    expect(result.citations.some((item) => /NAMDEVCO|NAMIS/i.test(item.name))).toBe(true);
  });
});
