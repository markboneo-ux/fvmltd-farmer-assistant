import { describe, expect, it } from "vitest";
import type { AgronomicCasePayload } from "./case-schema";
import {
  applyCommercialSafetyGuards,
  extractKnownFacts,
  mentionsPrematureFertilizer,
  mentionsSandOrGravel,
  questionAsksForKnownFact,
  WHITEFLY_QUICK_SEQUENCE,
} from "./tomato-protocol";

function basePayload(
  overrides: Partial<AgronomicCasePayload> = {},
): AgronomicCasePayload {
  return {
    mode: "quick_help",
    stage: "questioning",
    preliminaryAssessment: "Tomato whiteflies reported.",
    severity: "unknown",
    nextQuestion: WHITEFLY_QUICK_SEQUENCE[0],
    quickReplies: ["Few plants", "Patches", "Most of field", "Not sure"],
    checksToday: [],
    safeActionsNow: [],
    actionsToAvoid: [],
    photoRecommended: false,
    escalationRecommended: false,
    internalMissingInformation: ["variety", "district"],
    ...overrides,
  };
}

describe("tomato-protocol rapid triage", () => {
  it("extracts crop and whiteflies from a short prompt", () => {
    const facts = extractKnownFacts("Tomato whiteflies");
    expect(facts.crop).toBe("tomato");
    expect(facts.suspectedIssue).toBe("whiteflies");
  });

  it("does not treat known facts as askable again", () => {
    const facts = extractKnownFacts("Tomato whiteflies");
    expect(
      questionAsksForKnownFact("What crop are you growing?", facts),
    ).toBe(true);
    expect(
      questionAsksForKnownFact(WHITEFLY_QUICK_SEQUENCE[0], facts),
    ).toBe(false);
  });

  it("forces preliminary guidance after three Quick Help questions", () => {
    const guarded = applyCommercialSafetyGuards(
      basePayload({
        stage: "questioning",
        nextQuestion: "What variety is this?",
        checksToday: [],
        safeActionsNow: [],
      }),
      {
        mode: "quick_help",
        questionsAskedBeforeThisTurn: 3,
        knownFacts: extractKnownFacts("Tomato whiteflies"),
      },
    );

    expect(["assessment", "human_review", "action_plan"]).toContain(
      guarded.stage,
    );
    expect(guarded.preliminaryAssessment.toLowerCase()).toContain(
      "preliminary",
    );
    expect(guarded.checksToday.length).toBeGreaterThan(0);
    expect(guarded.safeActionsNow.length).toBeGreaterThan(0);
    expect(
      guarded.quickReplies.some((item) => /full crop check/i.test(item)),
    ).toBe(true);
  });

  it("strips sand advice and premature fertilizer", () => {
    const guarded = applyCommercialSafetyGuards(
      basePayload({
        stage: "assessment",
        preliminaryAssessment: "Whole-field stunting.",
        severity: "high",
        nextQuestion: "",
        safeActionsNow: [
          "Add sand to the soil",
          "Apply fertilizer now because plants are stunted",
        ],
      }),
      {
        mode: "quick_help",
        questionsAskedBeforeThisTurn: 2,
        knownFacts: extractKnownFacts(
          "Tomatoes are stunted across the whole field",
        ),
      },
    );

    expect(
      guarded.safeActionsNow.some((item) => mentionsSandOrGravel(item)),
    ).toBe(false);
    expect(
      guarded.safeActionsNow.some((item) => mentionsPrematureFertilizer(item)),
    ).toBe(false);
  });

  it("escalates sudden wilt", () => {
    const guarded = applyCommercialSafetyGuards(
      basePayload({
        stage: "assessment",
        preliminaryAssessment: "Sudden wilt reported.",
        severity: "high",
        nextQuestion: "",
      }),
      {
        mode: "quick_help",
        questionsAskedBeforeThisTurn: 2,
        knownFacts: extractKnownFacts("Cucumber plants suddenly wilting"),
      },
    );

    expect(guarded.escalationRecommended).toBe(true);
    expect(guarded.stage).toBe("human_review");
  });
});
