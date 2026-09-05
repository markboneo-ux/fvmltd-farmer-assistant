import { afterEach, describe, expect, it } from "vitest";
import { emptyRegionalContext, type AgronomicCasePayload } from "./case-schema";
import { rankDiagnosticCauses } from "./causes";
import { runAgronomicCase } from "./runCase";
import { shouldInvokeWeatherTool } from "./tool-policy";
import { extractKnownFacts } from "./tomato-protocol";
import { mentionsTomato } from "@/lib/assistant/crops";
import { classifyFarmerIntent, shouldStartNewCase } from "@/lib/assistant/intents";
import { persistConversationTurn } from "@/lib/beta/conversation";
import type { AppIdentity } from "@/lib/beta/identity";
import { resetUsageStore } from "@/lib/beta/usage-store";
import {
  addCasePhoto,
  createCropCase,
  getCropCase,
  listCaseMessages,
  listCasePhotos,
  resetCaseStore,
  setCasePersistenceModeForTests,
  updateCaseFromConversation,
} from "@/lib/cases/store";
import { UNVERIFIED_CHEMICAL_TEMPLATE } from "@/lib/research/pesticides";
import { setPageFetcherForTests, setSearchProviderForTests } from "@/lib/research/provider";
import { ingestCaseForTrends } from "@/lib/trends/ingest";
import { aggregateCluster, scoreTrend } from "@/lib/trends/engine";
import { listCaseTrends } from "@/lib/trends/store";
import type { TrendClusterInput } from "@/lib/trends/types";

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

function guest(id = "11111111-1111-4111-8111-111111111111"): AppIdentity {
  return {
    kind: "guest",
    guestSessionId: id,
    authUserId: null,
    farmerProfileId: null,
    email: null,
    access: "guest",
  };
}

afterEach(() => {
  setSearchProviderForTests(null);
  setPageFetcherForTests(null);
  setCasePersistenceModeForTests("memory");
  resetCaseStore();
  resetUsageStore();
});

describe("U1 celery does not mention tomato", () => {
  it("celery yellowing never carries tomato", async () => {
    let captured = "";
    const result = await runAgronomicCase({
      message: "My celery leaves are yellow but there are no spots.",
      history: [{ role: "user", content: "Tomato whiteflies" }],
      skipRegionalTools: true,
      createResponse: async (params) => {
        captured = `${params.instructions} ${JSON.stringify(params.input)}`;
        return {
          id: "celery",
          output_text: JSON.stringify(
            mockCase({
              preliminaryAssessment:
                "Yellowing without spots on celery is more likely nutrition, root stress, waterlogging, or older-leaf ageing than a leaf-spot disease.",
            }),
          ),
        };
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(captured.toLowerCase()).not.toMatch(/crop:\s*tomato/);
    expect(mentionsTomato(result.case.preliminaryAssessment)).toBe(false);
  });
});

describe("U2 celery answered before weather", () => {
  it("does not attach weather as the primary answer", async () => {
    const facts = extractKnownFacts("My celery leaves are yellow but there are no spots.");
    expect(shouldInvokeWeatherTool(facts)).toBe(false);
    const causes = rankDiagnosticCauses(
      "My celery leaves are yellow but there are no spots.",
    );
    expect(causes[0]?.category).not.toBe("fungal disease");
    expect(causes.some((item) => item.category === "nutrition")).toBe(true);

    const result = await runAgronomicCase({
      message: "My celery leaves are yellow but there are no spots.",
      profile: { country: "Trinidad and Tobago" },
      createResponse: async () => ({
        id: "celery_weather",
        output_text: JSON.stringify(
          mockCase({
            preliminaryAssessment:
              "The yellowing without spots makes nutrition, root stress, waterlogging, or older-leaf ageing more likely than a leaf spot disease. First check whether the yellowing starts on older or younger leaves.",
          }),
        ),
      }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.case.weatherRisks).toEqual([]);
    expect(result.case.preliminaryAssessment.toLowerCase()).toMatch(/yellowing|nutrition|root/);
    expect(result.case.preliminaryAssessment.toLowerCase().slice(0, 80)).not.toMatch(
      /high disease pressure|72 hours/,
    );
  });
});

describe("U3 Trinidad market triggers web research", () => {
  it("uses NAMDEVCO/NAMIS for a current Trinidad price question", async () => {
    setSearchProviderForTests({
      name: "mock",
      async search() {
        return [
          {
            url: "https://www.namistt.com/",
            title: "Wholesale market reports",
            snippet: "Celery wholesale $12.00 / kg",
            domain: "namistt.com",
            retrievedAt: new Date().toISOString(),
            publishedAt: new Date().toISOString(),
          },
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
    const result = await runAgronomicCase({
      message: "What is the current celery market price in Trinidad?",
      profile: { country: "Trinidad and Tobago" },
      createResponse: async () => ({
        id: "market",
        output_text: JSON.stringify(
          mockCase({
            preliminaryAssessment: "Here is the official wholesale figure I could verify.",
            checksToday: [],
            safeActionsNow: [],
          }),
        ),
      }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.case.researchUsed).toBe(true);
    expect(result.case.webCitations?.some((item) => /namis|namdevco/i.test(item.sourceName))).toBe(
      true,
    );
    expect(result.case.preliminaryAssessment).toMatch(/wholesale/i);
  });
});

describe("U4 Guyana pesticide does not use Trinidad as proof", () => {
  it("keeps Guyana registration unverified when only Trinidad hits exist", async () => {
    setSearchProviderForTests({
      name: "mock",
      async search() {
        return [
          {
            url: "https://www.namdevco.com/",
            title: "NAMDEVCO",
            snippet: "imidacloprid registered in Trinidad",
            domain: "namdevco.com",
            retrievedAt: new Date().toISOString(),
            publishedAt: null,
          },
        ];
      },
    });
    const result = await runAgronomicCase({
      message: "Is imidacloprid registered for tomato in Guyana?",
      profile: { country: "Guyana" },
      createResponse: async () => ({
        id: "gy",
        output_text: JSON.stringify(
          mockCase({
            preliminaryAssessment: "I can talk generally about whitefly materials.",
          }),
        ),
      }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.case.pesticideChecks?.[0]?.verified).toBe(false);
    expect(result.case.preliminaryAssessment).toContain(
      UNVERIFIED_CHEMICAL_TEMPLATE("Guyana"),
    );
    expect(
      result.case.webCitations?.some((item) => item.country === "Trinidad and Tobago"),
    ).toBe(false);
  });
});

describe("U5 unverified chemical labelled", () => {
  it("states not verified when no official hit exists", async () => {
    setSearchProviderForTests({
      name: "mock",
      async search() {
        return [];
      },
    });
    const result = await runAgronomicCase({
      message: "Is ProductX registered for celery in Trinidad?",
      profile: { country: "Trinidad and Tobago" },
      createResponse: async () => ({
        id: "unverified",
        output_text: JSON.stringify(
          mockCase({ preliminaryAssessment: "General chemical caution." }),
        ),
      }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.case.pesticideChecks?.[0]?.countryStatus).toBe("not_verified");
    expect(result.case.preliminaryAssessment).toMatch(/cannot confirm|not verified/i);
  });
});

describe("U6 verified local source can be cited", () => {
  it("cites PTCCB when Guyana register evidence is present", async () => {
    setSearchProviderForTests({
      name: "mock",
      async search() {
        return [
          {
            url: "https://ptccb.org.gy/register",
            title: "PTCCB register",
            snippet: "Imidacloprid is registered. Registration number GY-123.",
            domain: "ptccb.org.gy",
            retrievedAt: new Date().toISOString(),
            publishedAt: new Date().toISOString(),
          },
        ];
      },
    });
    const result = await runAgronomicCase({
      message: "Is imidacloprid registered in Guyana?",
      profile: { country: "Guyana" },
      createResponse: async () => ({
        id: "verified",
        output_text: JSON.stringify(
          mockCase({ preliminaryAssessment: "See the official register note." }),
        ),
      }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.case.pesticideChecks?.[0]?.verified).toBe(true);
    expect(result.case.webCitations?.[0]?.sourceName).toMatch(
      /Pesticides and Toxic Chemicals/i,
    );
  });
});

describe("U7 web failure still gives a safe general answer", () => {
  it("answers generally when search throws", async () => {
    setSearchProviderForTests({
      name: "fail",
      async search() {
        throw new Error("offline");
      },
    });
    const result = await runAgronomicCase({
      message: "What is the current tomato market price in Trinidad?",
      profile: { country: "Trinidad and Tobago" },
      createResponse: async () => ({
        id: "failweb",
        output_text: JSON.stringify(
          mockCase({
            preliminaryAssessment:
              "I can still talk about how to read a wholesale price, but I do not have a live figure.",
          }),
        ),
      }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.case.researchFailed).toBe(true);
    expect(result.case.preliminaryAssessment).toMatch(
      /couldn'?t complete the online lookup|still talk/i,
    );
  });
});

describe("U8 simple math does not trigger diagnosis", () => {
  it("returns arithmetic only", async () => {
    const result = await runAgronomicCase({
      message: "How much will 18 bags at $240 cost?",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.case.intent).toBe("simple_math");
    expect(result.case.checksToday).toEqual([]);
    expect(result.case.preliminaryAssessment).toMatch(/\$4,320/);
  });
});

describe("U9 cashflow enters business mode", () => {
  it("starts the bank cashflow workflow", async () => {
    expect(classifyFarmerIntent("Help me prepare a cashflow for the bank").intent).toBe(
      "cashflow",
    );
    const result = await runAgronomicCase({
      message: "Help me prepare a cashflow for the bank",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.case.intent).toBe("cashflow");
    expect(result.case.checksToday).toEqual([]);
    expect(result.case.preliminaryAssessment.toLowerCase()).toMatch(
      /cashflow|crop or enterprise/,
    );
  });
});

describe("U10–U11 conversation boundaries", () => {
  it("same crop follow-up keeps celery", async () => {
    const result = await runAgronomicCase({
      message: "The yellowing is on the older leaves.",
      history: [
        { role: "user", content: "My celery leaves are yellow but there are no spots." },
      ],
      activeCase: { crop: "celery", conversationIntent: "crop_problem" },
      skipRegionalTools: true,
      createResponse: async (params) => {
        expect(String(params.instructions).toLowerCase()).toMatch(/celery/);
        return {
          id: "keep",
          output_text: JSON.stringify(
            mockCase({
              preliminaryAssessment:
                "Yellowing on older celery leaves fits a nitrogen or ageing pattern more than a new-leaf virus.",
            }),
          ),
        };
      },
    });
    expect(result.ok).toBe(true);
  });

  it("a new topic resets tomato context", () => {
    expect(
      shouldStartNewCase({
        message: "Help me prepare a cashflow for the bank",
        activeCrop: "celery",
        activeIntent: "crop_problem",
      }),
    ).toBe(true);
  });
});

describe("U12–U14 trends", () => {
  function member(overrides: Partial<TrendClusterInput>): TrendClusterInput {
    return {
      caseId: "c1",
      sessionKey: "s1",
      country: "Trinidad and Tobago",
      region: "Couva",
      crop: "celery",
      variety: null,
      symptoms: ["yellowing"],
      suspectedIssue: "yellowing",
      createdAt: "2026-09-01T00:00:00.000Z",
      agronomistReviewed: false,
      diagnosisConfirmed: false,
      positiveOutcome: false,
      rejected: false,
      ...overrides,
    };
  }

  it("one case does not create a trusted trend", () => {
    expect(aggregateCluster([member({ caseId: "c1", sessionKey: "s1" })])).toBeNull();
  });

  it("multiple unique similar cases can create a candidate trend", () => {
    const trend = aggregateCluster([
      member({ caseId: "c1", sessionKey: "a" }),
      member({ caseId: "c2", sessionKey: "b", createdAt: "2026-09-02T00:00:00.000Z" }),
    ]);
    expect(trend?.trendStatus).toBe("emerging");
    expect(trend?.uniqueSessionCount).toBe(2);
  });

  it("staff-rejected case does not improve trend confidence", () => {
    const withRejected = scoreTrend({
      uniqueSessionCount: 3,
      caseCount: 3,
      reviewedCaseCount: 0,
      confirmedCaseCount: 0,
      positiveOutcomeCount: 0,
      staffReviewed: false,
      rejected: true,
    });
    expect(withRejected.confidenceScore).toBe(0);
    expect(withRejected.status).toBe("rejected");
    expect(
      aggregateCluster([
        member({ caseId: "c1", sessionKey: "a", rejected: true }),
        member({ caseId: "c2", sessionKey: "b", rejected: true }),
      ]),
    ).toBeNull();
  });
});

describe("U15–U17 persistence, guest mode, photos", () => {
  it("guest persistence still writes case and messages", async () => {
    setCasePersistenceModeForTests("memory");
    const persisted = await persistConversationTurn({
      identity: guest(),
      userMessage: "My celery leaves are yellow but there are no spots.",
      assistantText: "Check older versus younger leaves.",
      payload: mockCase({
        preliminaryAssessment: "Check older versus younger leaves.",
      }),
    });
    expect(persisted.caseId).toBeTruthy();
    const messages = await listCaseMessages(persisted.caseId);
    expect(messages).toHaveLength(2);
  });

  it("guest mode still creates an anonymous case", async () => {
    const record = await createCropCase({
      anonymousSessionId: guest().guestSessionId,
      accessState: "guest",
      message: "Celery yellowing",
    });
    expect(record.userId).toBeNull();
    expect(record.anonymousSessionId).toBe(guest().guestSessionId);
  });

  it("photo upload still stores a private case photo", async () => {
    const record = await createCropCase({
      anonymousSessionId: guest().guestSessionId,
      message: "Celery photo",
    });
    await addCasePhoto({
      caseId: record.id,
      ownerSessionId: guest().guestSessionId,
      storagePath: `${guest().guestSessionId}/${record.id}/leaf.jpg`,
      mimeType: "image/jpeg",
      fileSizeBytes: 800,
    });
    const photos = await listCasePhotos(record.id);
    expect(photos).toHaveLength(1);
  });
});

describe("staff-rejected case is excluded from trend learning", () => {
  it("a rejected case plus one other unique case does not become trusted", async () => {
    setCasePersistenceModeForTests("memory");
    const a = await createCropCase({
      anonymousSessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      message: "Celery yellowing in Couva",
      profile: { country: "Trinidad and Tobago", district: "Couva" },
    });
    await updateCaseFromConversation(a.id, "exclude", {
      diagnosisIncorrect: true,
      includeInTrendLearning: false,
      knowledgeState: "rejected",
    });
    const b = await createCropCase({
      anonymousSessionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      message: "Celery yellowing in Couva",
      profile: { country: "Trinidad and Tobago", district: "Couva" },
    });
    const updatedA = await getCropCase(a.id);
    const updatedB = await getCropCase(b.id);
    await ingestCaseForTrends(updatedA!);
    await ingestCaseForTrends(updatedB!);
    const trends = await listCaseTrends();
    expect(trends.every((item) => item.uniqueSessionCount < 2)).toBe(true);
  });
});
