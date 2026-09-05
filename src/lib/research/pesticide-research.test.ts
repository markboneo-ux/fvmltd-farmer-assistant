import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { classifyRegulatoryEvidence } from "./evidence";
import { classifyPesticideQuery } from "./pesticide-query";
import {
  applyPesticideAnswerToText,
  buildPesticideFarmerAnswer,
  isGenericRegulatoryRefusal,
} from "./pesticide-answer";
import { detectResearchTopics, shouldRunWebResearch } from "./policy";
import { pesticideCheckFromEvidence } from "./pesticides";
import { setPageFetcherForTests, setSearchProviderForTests } from "./provider";
import { runCountryResearch } from "./run";
import { sourceByDomain } from "./sources";
import type { SearchHit } from "./types";
import { resolveConversationReference } from "@/lib/assistant/reference-resolution";
import { runAgronomicCase } from "@/lib/agronomy/runCase";
import { emptyRegionalContext, type AgronomicCasePayload } from "@/lib/agronomy/case-schema";
import { farmerPersistenceBanner } from "@/lib/chat/persistence-warning";
import { persistConversationTurn } from "@/lib/beta/conversation";
import type { AppIdentity } from "@/lib/beta/identity";
import { resetCaseStore, setCasePersistenceModeForTests, listCaseMessages } from "@/lib/cases/store";
import { resetUsageStore } from "@/lib/beta/usage-store";

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

function mockCase(overrides: Partial<AgronomicCasePayload> = {}): AgronomicCasePayload {
  return {
    mode: "quick_help",
    stage: "assessment",
    questionId: "",
    questionType: "",
    preliminaryAssessment: "Farmer reported a crop problem.",
    severity: "unknown",
    nextQuestion: "",
    quickReplies: [],
    checksToday: [],
    safeActionsNow: [],
    actionsToAvoid: [],
    photoRecommended: false,
    escalationRecommended: false,
    regionalContext: emptyRegionalContext(),
    weatherRisks: [],
    verifiedInputOptions: [],
    internalMissingInformation: [],
    ...overrides,
  };
}

function guest(): AppIdentity {
  return {
    kind: "guest",
    guestSessionId: "11111111-1111-4111-8111-111111111111",
    authUserId: null,
    farmerProfileId: null,
    email: null,
    access: "guest",
  };
}

describe("pesticide list research policy", () => {
  it("triggers research for a Trinidad broad pesticide list request", () => {
    const message = "What is the list of pesticides available in Trinidad";
    const topics = detectResearchTopics({ message, asksForProducts: true });
    expect(topics).toContain("pesticide_registration");
    expect(shouldRunWebResearch(topics)).toBe(true);
    expect(classifyPesticideQuery(message).isBroadList).toBe(true);
  });

  it("treats a Grenada pesticide list as Grenada, not Trinidad", () => {
    const message = "List of pesticides in Grenada";
    const query = classifyPesticideQuery(message);
    expect(query.isBroadList).toBe(true);
    expect(sourceByDomain("agriculture.weboffice.gd")?.country).toBe("Grenada");
    expect(sourceByDomain("health.gov.tt")?.country).toBe("Trinidad and Tobago");
  });
});

describe("regulatory evidence quality", () => {
  it("does not treat a regulator or ministry homepage as sufficient evidence", () => {
    const homepage = classifyRegulatoryEvidence({
      url: "https://agriculture.weboffice.gd/",
      title: "Ministry of Agriculture",
      text: "Welcome to the Ministry of Agriculture Grenada. Contact the extension office.",
      country: "Grenada",
      organization: "Ministry of Agriculture",
      sourceType: "government",
      sourceCountry: "Grenada",
    });
    expect(homepage.sufficientForProductClaim).toBe(false);
    expect(homepage.sufficientForRegisterLocation).toBe(false);
    expect(homepage.evidenceType).toBe("ministry_homepage");

    const portal = classifyRegulatoryEvidence({
      url: "https://health.gov.tt/cfdd/portal",
      title: "CFDD Portal",
      text: "The Ministry of Health seeks to provide information regarding the registration status of pesticides.",
      country: "Trinidad and Tobago",
      organization: "CFDD",
      sourceType: "regulator",
      sourceCountry: "Trinidad and Tobago",
    });
    expect(portal.sufficientForProductClaim).toBe(false);
    expect(portal.evidenceType).toBe("regulator_portal");
  });

  it("lets an official register or product listing support a registration claim", () => {
    const listing = classifyRegulatoryEvidence({
      url: "https://health.gov.tt/cfdd/pesticides/search/7514",
      title: "Pesticide - Malathion 57 EC",
      text: "Trinidad and Tobago Product Registration Number TTPR0176-003. Active Ingredients Malathion. Status Registered.",
      country: "Trinidad and Tobago",
      organization: "CFDD",
      sourceType: "regulator",
      sourceCountry: "Trinidad and Tobago",
    });
    expect(listing.sufficientForProductClaim).toBe(true);
    expect(listing.evidenceType).toBe("product_listing");

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
          snippet:
            "Malathion Status Registered. Trinidad and Tobago Product Registration Number TTPR0176-003.",
        }),
      ],
    });
    expect(check.verified).toBe(true);
  });
});

describe("country-specific pesticide answers", () => {
  it("offers filtering for a Trinidad broad list instead of a useless refusal", async () => {
    setSearchProviderForTests({
      name: "mock",
      async search() {
        return [];
      },
    });
    setPageFetcherForTests(async (url) => ({
      url,
      title: url.includes("cfdd") ? "CFDD Portal" : "Ministry",
      text: url.includes("health.gov.tt")
        ? "Pesticides and Toxic Chemicals Control Board. Registration status of pesticides in Trinidad and Tobago. CFDD Portal pesticide listings."
        : "Ministry of Agriculture",
      retrievedAt: new Date().toISOString(),
      publishedAt: "2026-09-01T00:00:00.000Z",
      status: 200,
    }));

    const result = await runCountryResearch({
      message: "What is the list of pesticides available in Trinidad",
      country: "Trinidad and Tobago",
      topics: ["pesticide_registration"],
    });
    expect(result.used).toBe(true);
    expect(result.pesticideAnswer?.registerFound).toBe(true);
    expect(result.pesticideAnswer?.farmerText).toMatch(/large register of approved pesticide products/i);
    expect(result.pesticideAnswer?.farmerText).toMatch(/By crop/i);
    expect(result.pesticideAnswer?.farmerText).not.toMatch(/contact (the |your )?extension/i);
    expect(result.citations.every((item) => item.country !== "Grenada")).toBe(true);
  });

  it("does not default a Grenada pesticide request to Trinidad", async () => {
    setSearchProviderForTests({
      name: "mock",
      async search() {
        return [
          hit({
            url: "https://agriculture.weboffice.gd/",
            domain: "agriculture.weboffice.gd",
            title: "Grenada Ministry of Agriculture",
            snippet: "Welcome to the Ministry of Agriculture.",
          }),
        ];
      },
    });
    setPageFetcherForTests(async (url) => ({
      url,
      title: "Grenada Ministry of Agriculture",
      text: "Welcome to the Ministry of Agriculture. Contact the extension office for advice.",
      retrievedAt: new Date().toISOString(),
      publishedAt: null,
      status: 200,
    }));

    const result = await runCountryResearch({
      message: "List of pesticides in Grenada",
      country: "Grenada",
      topics: ["pesticide_registration"],
    });
    expect(result.country).toBe("Grenada");
    expect(result.citations.some((item) => /trinidad|namdevco|health\.gov\.tt/i.test(item.url + item.sourceName))).toBe(
      false,
    );
    expect(result.pesticideAnswer?.registerFound).toBe(false);
    expect(result.pesticideAnswer?.farmerText).toMatch(
      /could not find a current public pesticide register for Grenada/i,
    );
    expect(result.pesticideAnswer?.farmerText).toMatch(/I can still check a specific crop/i);
    expect(result.pesticideAnswer?.farmerText).not.toMatch(/^contact (the |your )?(ministry|extension)/i);
  });

  it("does not treat a ministry homepage as the whole answer", () => {
    expect(isGenericRegulatoryRefusal("Refer to the Ministry / authorities.")).toBe(true);
    expect(isGenericRegulatoryRefusal("Contact the Ministry or extension office.")).toBe(true);
    const replaced = applyPesticideAnswerToText({
      currentText: "Contact your extension office.",
      answer: buildPesticideFarmerAnswer({
        country: "Grenada",
        query: classifyPesticideQuery("List of pesticides in Grenada"),
        evidence: [],
        check: null,
        authorityContact: {
          organization: "Ministry of Agriculture",
          url: "https://agriculture.weboffice.gd/",
        },
      }),
    });
    expect(replaced).toMatch(/could not find a current public pesticide register for Grenada/i);
    expect(replaced).not.toMatch(/^contact your extension office/i);
  });
});

describe("conversation reference resolution", () => {
  it("resolves 'refer to what?' from the previous assistant message", () => {
    const resolved = resolveConversationReference({
      message: "Refer to the what??",
      history: [
        { role: "user", content: "What is the list of pesticides available in Trinidad" },
        { role: "assistant", content: "You can refer to the official pesticide register." },
      ],
    });
    expect(resolved.isReference).toBe(true);
    expect(resolved.referent).toMatch(/pesticide register/i);
    expect(resolved.resolvedMessage.toLowerCase()).toMatch(/pesticide register/);
  });

  it("answers the pesticide register instead of asking for clarification", async () => {
    setSearchProviderForTests({
      name: "mock",
      async search() {
        return [];
      },
    });
    setPageFetcherForTests(async (url) => ({
      url,
      title: "CFDD Portal",
      text: "CFDD Portal. Registration status of pesticides in Trinidad and Tobago.",
      retrievedAt: new Date().toISOString(),
      publishedAt: null,
      status: 200,
    }));

    const result = await runAgronomicCase({
      message: "Refer to the what??",
      history: [
        { role: "user", content: "What is the list of pesticides available in Trinidad" },
        { role: "assistant", content: "You can refer to the official pesticide register." },
      ],
      profile: { country: "Trinidad and Tobago", locationConfidence: "explicit" },
      activeCase: {
        crop: null,
        conversationIntent: "general_agriculture",
        country: "Trinidad and Tobago",
      },
      createResponse: async () => ({
        id: "should_not_clarify",
        output_text: JSON.stringify(
          mockCase({
            preliminaryAssessment: "Could you clarify what assistance you need?",
          }),
        ),
      }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.case.preliminaryAssessment).not.toMatch(/could you clarify what assistance you need/i);
    expect(result.case.preliminaryAssessment.toLowerCase()).toMatch(/pesticide register|pesticide products/);
  });
});

describe("sources stay collapsed and persistence is unchanged", () => {
  it("keeps the Sources used disclosure collapsed in the chat UI", () => {
    const chat = readFileSync(join(process.cwd(), "src/components/ChatAssistantMessage.tsx"), "utf8");
    expect(chat).toMatch(/Sources used \(/);
    expect(chat).toMatch(/<details>/);
    expect(chat).not.toMatch(/<details\s+open/);
  });

  it("does not show a red persistence warning when the core save succeeds", async () => {
    resetCaseStore();
    resetUsageStore();
    setCasePersistenceModeForTests("memory");
    const persisted = await persistConversationTurn({
      identity: guest(),
      userMessage: "What is the list of pesticides available in Trinidad",
      assistantText: "Trinidad and Tobago has a large register of approved pesticide products.",
      payload: mockCase({
        preliminaryAssessment: "Trinidad and Tobago has a large register of approved pesticide products.",
      }),
    });
    expect(await listCaseMessages(persisted.caseId)).toHaveLength(2);
    expect(
      farmerPersistenceBanner({
        persistenceFailed: false,
        caseId: persisted.caseId,
      }),
    ).toBeNull();
  });
});

describe("preview deployment documentation", () => {
  it("documents how to distinguish PR Preview from git-main", () => {
    const doc = readFileSync(join(process.cwd(), "docs/PREVIEW_DEPLOYMENT.md"), "utf8");
    expect(doc).toMatch(/fvmltd-farmer-assistant-nxmi-git-<branch-slug>-fvmltd\.vercel\.app/);
    expect(doc).toMatch(/git-main/);
    expect(doc).toMatch(/PR #32/);
    expect(doc).toMatch(/Do \*\*not\*\* treat a `git-main` chat result/);
  });
});
