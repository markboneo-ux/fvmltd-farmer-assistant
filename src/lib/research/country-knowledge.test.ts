import { describe, expect, it } from "vitest";
import { countryKnowledgeHooks } from "./country-knowledge";

describe("country-specific retrieval hooks", () => {
  it("never uses Trinidad's pesticide register as Guyana proof", () => {
    const hook = countryKnowledgeHooks({
      country: "Guyana",
      purpose: "pesticide_registration",
      crop: "pepper",
      pestOrDisease: "Cercospora",
    });
    expect(hook.crossCountryPesticideUseForbidden).toBe(true);
    expect(
      hook.sources.some((source) => source.country === "Trinidad and Tobago"),
    ).toBe(false);
    expect(hook.sources.some((source) => /guyana|cardi|uwi|fao/i.test(source.name))).toBe(
      true,
    );
  });

  it("prefers official ministries and research institutes for agronomic guidance", () => {
    const hook = countryKnowledgeHooks({
      country: "Jamaica",
      purpose: "agronomic_guidance",
    });
    expect(hook.sources.length).toBeGreaterThan(0);
    expect(
      hook.sources.some((source) =>
        ["official_government", "statutory_authority", "research_institution"].includes(
          source.trustLevel,
        ),
      ),
    ).toBe(true);
  });
});
