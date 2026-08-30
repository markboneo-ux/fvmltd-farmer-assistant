import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { emptyRegionalContext } from "@/lib/agronomy/case-schema";
import type { AgronomicCasePayload } from "@/lib/agronomy/case-schema";
import { runAgronomicCase } from "@/lib/agronomy/runCase";
import { extractKnownFacts, questionAsksForKnownFact } from "@/lib/agronomy/tomato-protocol";
import { applyIrreversibleActionGuards, mentionsPrematureDestruction, wiltCheckCopy } from "./irreversible";
import { containsHeavyJargon, isSimpleLanguage, simplifyFarmerLanguage } from "./language";
import { mapTurnToCasePatch } from "./map-case";
import {
  FARMER_PRIVACY_ANSWER,
  isPrivacyOrLearningQuestion,
  mentionsFalseNoStoreClaim,
} from "./privacy";
import {
  formatSimilarCasesForModel,
  getCaseById,
  getCaseMessages,
  getCaseOutcomes,
  getCaseReviews,
  getDueFollowUp,
  getSimilarCases,
  recordCaseOutcome,
  recordCaseReview,
  resetMemoryStoreForTests,
  upsertAgronomyCase,
} from "./store";
import type { AgronomyCaseRecord } from "./types";

function mockCase(
  overrides: Partial<AgronomicCasePayload> = {},
): AgronomicCasePayload {
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

function seedCase(
  overrides: Partial<AgronomyCaseRecord> & { sessionId: string },
): AgronomyCaseRecord {
  return upsertAgronomyCase(overrides);
}

beforeEach(() => {
  resetMemoryStoreForTests();
});

describe("TEST A — simple language", () => {
  const farmer = "My tomato plants just dropping down.";

  it("answers in simple farmer language with no heavy jargon", async () => {
    const result = await runAgronomicCase({
      message: farmer,
      mode: "quick_help",
      skipRegionalTools: true,
      profile: { sessionId: "test-a" },
      createResponse: async () => ({
        id: "resp_test_a",
        output_text: JSON.stringify(
          mockCase({
            preliminaryAssessment:
              "Inspect for symptoms consistent with vascular pathogens. High pathogen pressure and substrate saturation may be the etiological agent.",
            nextQuestion: "Assess root-zone saturation.",
            checksToday: ["Inspect for symptoms consistent with vascular pathogens"],
          }),
        ),
      }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const visible = [
      result.case.preliminaryAssessment,
      result.case.nextQuestion,
      ...result.case.checksToday,
    ].join(" ");

    expect(isSimpleLanguage(visible)).toBe(true);
    expect(containsHeavyJargon(visible)).toBe(false);
    expect(visible).not.toMatch(
      /pathogen pressure|etiological agent|physiological disorder|vector dynamics|substrate saturation/i,
    );
    expect(visible.toLowerCase()).toMatch(/stem|brown|wet|soil|wilt/);
  });

  it("rewrites jargon phrases into familiar words", () => {
    expect(
      simplifyFarmerLanguage(
        "Inspect for symptoms consistent with vascular pathogens.",
      ),
    ).toMatch(/look for signs/i);
    expect(simplifyFarmerLanguage("Assess root-zone saturation.")).toMatch(
      /check whether the soil is staying wet/i,
    );
  });
});

describe("TEST B — no premature destruction", () => {
  const farmer = "My tomatoes are wilting.";

  it("does not tell the farmer to destroy or remove plants immediately", async () => {
    const result = await runAgronomicCase({
      message: farmer,
      mode: "quick_help",
      skipRegionalTools: true,
      profile: { sessionId: "test-b" },
      createResponse: async () => ({
        id: "resp_test_b",
        output_text: JSON.stringify(
          mockCase({
            preliminaryAssessment:
              "This is bacterial wilt. Destroy the affected plants immediately and remove the rest of the crop.",
            nextQuestion: "Have you already pulled up the plants?",
            safeActionsNow: [
              "Destroy affected plants",
              "Apply fungicide today",
            ],
            checksToday: [],
          }),
        ),
      }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const visible = [
      result.case.preliminaryAssessment,
      result.case.nextQuestion,
      ...result.case.safeActionsNow,
    ].join(" ");

    expect(mentionsPrematureDestruction(visible)).toBe(false);
    expect(visible).not.toMatch(/\b(destroy|abandon)\b/i);
    expect(result.case.safeActionsNow.join(" ")).not.toMatch(
      /destroy|fungicide|pesticide/i,
    );
    expect(result.case.preliminaryAssessment).toContain(
      "Bacterial wilt is one possibility",
    );
    expect(result.case.nextQuestion.toLowerCase()).toMatch(
      /stem|inside|brown/,
    );
    expect(result.case.checksToday.join(" ").toLowerCase()).toMatch(
      /stem|brown|wet/,
    );
  });

  it("uses the preferred wilt check copy", () => {
    const guarded = applyIrreversibleActionGuards(
      mockCase({
        preliminaryAssessment: "Isolate and destroy wilted plants now.",
      }),
      { vagueSymptom: true, wiltReported: true },
    );
    expect(guarded.preliminaryAssessment).toBe(wiltCheckCopy());
  });
});

describe("TEST C — conversation memory", () => {
  const farmer = "I am in Couva growing 3 acres of Ruby tomato.";
  const later = "What treatment should I use for the yellowing?";

  it("still knows location, acreage, crop and variety several turns later", async () => {
    const facts = extractKnownFacts(`${farmer}\n${later}`);
    expect(facts.district).toBe("couva");
    expect(facts.areaPlanted).toMatch(/3 acres/);
    expect(facts.crop).toBe("tomato");
    expect(facts.variety).toBe("ruby");
    expect(questionAsksForKnownFact("What crop are you growing?", facts)).toBe(
      true,
    );
    expect(questionAsksForKnownFact("What variety is this?", facts)).toBe(true);
    expect(questionAsksForKnownFact("How many acres is the field?", facts)).toBe(
      true,
    );
    expect(
      questionAsksForKnownFact("Which district is the farm in?", facts),
    ).toBe(true);

    let seenInstructions = "";
    const result = await runAgronomicCase({
      message: later,
      history: [
        { role: "user", content: farmer },
        {
          role: "assistant",
          content:
            "Thanks. I will keep Couva, the 3 acres, and Ruby tomato in mind.",
        },
      ],
      mode: "quick_help",
      skipRegionalTools: true,
      profile: { sessionId: "test-c", country: "Trinidad and Tobago" },
      createResponse: async (params) => {
        seenInstructions = String(params.instructions);
        return {
          id: "resp_test_c",
          output_text: JSON.stringify(
            mockCase({
              preliminaryAssessment:
                "Yellowing on tomato can come from water, nutrition, or whiteflies. I will not re-ask the crop or location.",
              nextQuestion: "What crop are you growing?",
            }),
          ),
        };
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(seenInstructions.toLowerCase()).toContain("couva");
    expect(seenInstructions.toLowerCase()).toContain("ruby");
    expect(seenInstructions.toLowerCase()).toContain("3 acres");
    expect(seenInstructions.toLowerCase()).toContain("tomato");
    expect(result.case.nextQuestion).not.toMatch(/what crop|which variety|how many acres|which district/i);
    expect(result.caseId).toBeTruthy();
    const stored = getCaseById(result.caseId as string);
    expect(stored?.district).toBe("couva");
    expect(stored?.variety).toBe("ruby");
    expect(stored?.areaPlanted).toMatch(/3 acres/);
    expect(stored?.crop).toBe("tomato");
  });
});

describe("TEST D — learning system stores records separately", () => {
  it("stores recommendation, action taken, 7-day outcome and agronomist correction separately", async () => {
    const result = await runAgronomicCase({
      message: "Tomato leaves turning yellow in Couva.",
      mode: "quick_help",
      skipRegionalTools: true,
      profile: { sessionId: "test-d", country: "Trinidad and Tobago" },
      createResponse: async () => ({
        id: "resp_test_d",
        output_text: JSON.stringify(
          mockCase({
            preliminaryAssessment:
              "Yellowing can come from wet soil, hungry plants, or insects under the leaves.",
            checksToday: [
              "Turn a few leaves over and look for tiny white insects",
            ],
            safeActionsNow: ["Hold new sprays until we know more"],
          }),
        ),
      }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const caseId = result.caseId as string;
    expect(caseId).toBeTruthy();

    const savedCase = getCaseById(caseId);
    expect(savedCase?.actionsRecommended.join(" ")).toMatch(/leaves|sprays/i);

    const outcome = recordCaseOutcome({
      caseId,
      cropOutcome: "improved",
      actionsTaken: "I stopped watering so often and turned the leaves over.",
      daysAfterRecommendation: 7,
    });

    const review = recordCaseReview({
      caseId,
      verdict: "partly_correct",
      confirmedDiagnosis: "Magnesium deficiency after heavy rain",
      recommendedCorrection:
        "Check older leaves for interveinal yellowing before blaming whiteflies.",
      requiresLabConfirmation: false,
    });

    const messages = getCaseMessages(caseId);
    const outcomes = getCaseOutcomes(caseId);
    const reviews = getCaseReviews(caseId);

    expect(messages.some((row) => row.role === "user")).toBe(true);
    expect(messages.some((row) => row.role === "assistant")).toBe(true);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].id).toBe(outcome.id);
    expect(outcomes[0].daysAfterRecommendation).toBe(7);
    expect(outcomes[0].actionsTaken).toMatch(/stopped watering/i);
    expect(reviews).toHaveLength(1);
    expect(reviews[0].id).toBe(review.id);
    expect(reviews[0].verdict).toBe("partly_correct");
    expect(reviews[0].confirmedDiagnosis).toBe(
      "Magnesium deficiency after heavy rain",
    );

    const historicalAi = messages.find((row) => row.role === "assistant");
    expect(historicalAi?.content).toContain("Yellowing can come from wet soil");
    expect(historicalAi?.content).not.toContain("Magnesium deficiency");
    expect(getCaseById(caseId)?.confirmedDiagnosis).toBe(
      "Magnesium deficiency after heavy rain",
    );
  });
});

describe("TEST E — similar case retrieval ranking", () => {
  it("ranks reviewed + successful-outcome cases above unreviewed cases", () => {
    seedCase({
      id: "unreviewed-wilt",
      sessionId: "farmer-a",
      farmerId: "secret-farmer-id",
      country: "Trinidad and Tobago",
      district: "couva",
      crop: "tomato",
      variety: "ruby",
      symptoms: "wilting after rain",
      problemReported: "tomatoes wilting",
    });

    seedCase({
      id: "reviewed-success",
      sessionId: "farmer-b",
      farmerId: "another-secret-id",
      country: "Trinidad and Tobago",
      district: "couva",
      crop: "tomato",
      variety: "ruby",
      symptoms: "wilting after rain",
      problemReported: "tomatoes wilting",
      confirmedDiagnosis: "bacterial wilt later confirmed",
    });
    recordCaseOutcome({
      caseId: "reviewed-success",
      cropOutcome: "improved",
      actionsTaken: "Improved drainage and held sprays",
      daysAfterRecommendation: 7,
    });
    recordCaseReview({
      caseId: "reviewed-success",
      verdict: "correct",
      confirmedDiagnosis: "bacterial wilt later confirmed",
    });

    const ranked = getSimilarCases({
      country: "Trinidad and Tobago",
      district: "couva",
      crop: "tomato",
      variety: "ruby",
      symptoms: "wilting after rain",
    });

    expect(ranked.length).toBeGreaterThanOrEqual(2);
    expect(ranked[0].reviewed).toBe(true);
    expect(ranked[0].outcome).toBe("improved");
    expect(ranked[0].confirmedDiagnosis).toMatch(/bacterial wilt/i);
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
    expect(JSON.stringify(ranked)).not.toMatch(/secret-farmer|another-secret/);

    const formatted = formatSimilarCasesForModel(ranked);
    expect(formatted).toMatch(/agronomist-reviewed/);
    expect(formatted).not.toMatch(/secret-farmer|another-secret/);
  });
});

describe("TEST F — brand", () => {
  it("has no official logo file; documents the exact upload slot", () => {
    const svg = resolve(process.cwd(), "public/brand/farmersvaluemart-logo.svg");
    const png = resolve(process.cwd(), "public/brand/farmersvaluemart-logo.png");
    const readme = resolve(process.cwd(), "public/brand/README.md");
    expect(existsSync(svg)).toBe(false);
    expect(existsSync(png)).toBe(false);
    expect(existsSync(readme)).toBe(true);
    const readmeText = readFileSync(readme, "utf8");
    expect(readmeText).toContain("public/brand/farmersvaluemart-logo.svg");
    expect(readmeText).toContain("public/brand/farmersvaluemart-logo.png");

    const logoComponent = readFileSync(
      resolve(process.cwd(), "src/components/BrandLogo.tsx"),
      "utf8",
    );
    expect(logoComponent).toContain("/brand/farmersvaluemart-logo.svg");
    expect(logoComponent).toContain("placeholder");
  });

  it("keeps developer text off the production farmer header", () => {
    const guest = readFileSync(
      resolve(process.cwd(), "src/components/GuestAIChat.tsx"),
      "utf8",
    );
    const chat = readFileSync(
      resolve(process.cwd(), "src/components/FarmerCaseChat.tsx"),
      "utf8",
    );
    const layout = readFileSync(
      resolve(process.cwd(), "src/app/layout.tsx"),
      "utf8",
    );
    const lab = readFileSync(
      resolve(process.cwd(), "src/app/ai-lab/page.tsx"),
      "utf8",
    );

    expect(guest).toContain("Farmersvaluemart AI");
    expect(guest).toContain("Your Caribbean farming assistant");
    expect(guest).toContain("showDiagnostics={false}");
    expect(guest).not.toMatch(/Developer lab/);
    expect(chat).toContain("BrandLogo");
    expect(chat).toContain("Looking at your photo");
    expect(chat).toContain("Take Photo");
    expect(chat).toContain("Choose Photo");
    expect(chat).toMatch(/max-w-3xl/);
    expect(chat).toMatch(/min-h-dvh/);
    expect(layout).toMatch(/Inter/);
    expect(layout).toMatch(/font-inter/);
    expect(lab).toMatch(/Developer lab/);
    expect(lab).toMatch(/showDiagnostics/);
  });
});

describe("TEST G — privacy", () => {
  const farmer = "Do you store my data or learn from individual conversations?";

  it("accurately describes storage and does not claim it never stores information", async () => {
    expect(isPrivacyOrLearningQuestion(farmer)).toBe(true);
    expect(mentionsFalseNoStoreClaim(FARMER_PRIVACY_ANSWER)).toBe(false);

    const result = await runAgronomicCase({
      message: farmer,
      mode: "quick_help",
      skipRegionalTools: true,
      profile: { sessionId: "test-g" },
      createResponse: async () => {
        throw new Error("privacy questions must not call the model");
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.case.preliminaryAssessment).toBe(FARMER_PRIVACY_ANSWER);
    expect(result.case.preliminaryAssessment).toMatch(/saved securely/i);
    expect(result.case.preliminaryAssessment).toMatch(
      /do not retrain myself from a single conversation/i,
    );
    expect(result.case.preliminaryAssessment).toMatch(
      /privacy settings and your consent/i,
    );
    expect(mentionsFalseNoStoreClaim(result.case.preliminaryAssessment)).toBe(
      false,
    );
    expect(result.case.preliminaryAssessment).not.toMatch(
      /i don['’]t store personal data/i,
    );
  });
});

describe("follow-up scheduling", () => {
  it("schedules a 7-day follow-up on actionable cases", () => {
    const patch = mapTurnToCasePatch({
      sessionId: "follow-1",
      facts: extractKnownFacts("My tomatoes are wilting."),
      payload: mockCase({
        checksToday: ["Cut one stem"],
        safeActionsNow: ["Hold sprays"],
      }),
      farmerMessage: "My tomatoes are wilting.",
    });
    const saved = upsertAgronomyCase(patch);
    expect(saved.followUpDueAt).toBeTruthy();
    const dueAt = new Date(saved.followUpDueAt as string).getTime();
    const sixDays = Date.now() + 6 * 24 * 60 * 60 * 1000;
    const eightDays = Date.now() + 8 * 24 * 60 * 60 * 1000;
    expect(dueAt).toBeGreaterThan(sixDays);
    expect(dueAt).toBeLessThan(eightDays);
    expect(getDueFollowUp("follow-1")).toBeNull();
    expect(
      getDueFollowUp("follow-1", new Date(dueAt + 1000))?.id,
    ).toBe(saved.id);
  });
});
