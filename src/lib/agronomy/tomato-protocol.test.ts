import { describe, expect, it } from "vitest";
import type { AgronomicCasePayload } from "./case-schema";
import { emptyRegionalContext } from "./case-schema";
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
    questionId: "q_1_field_distribution",
    questionType: "field_distribution",
    preliminaryAssessment: "Tomato whiteflies reported.",
    severity: "unknown",
    nextQuestion: WHITEFLY_QUICK_SEQUENCE[0],
    quickReplies: ["Few plants", "Patches", "Most of field", "Not sure"],
    checksToday: [],
    safeActionsNow: [],
    actionsToAvoid: [],
    photoRecommended: false,
    escalationRecommended: false,
    regionalContext: emptyRegionalContext(),
    weatherRisks: [],
    verifiedInputOptions: [],
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

  it("uses profile country so country is not re-asked", () => {
    const facts = extractKnownFacts("Tomato whiteflies", {
      country: "Trinidad and Tobago",
      district: "Chaguanas",
    });
    expect(facts.country).toBe("Trinidad and Tobago");
    expect(facts.district).toBe("Chaguanas");
    expect(
      questionAsksForKnownFact("Which country is the farm in?", facts),
    ).toBe(true);
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

  it("assigns soil_type quick replies for soil questions", () => {
    const guarded = applyCommercialSafetyGuards(
      basePayload({
        nextQuestion: "What soil type are the tomatoes growing in?",
        quickReplies: ["Few plants", "Patches"],
      }),
      {
        mode: "full_crop_check",
        questionsAskedBeforeThisTurn: 1,
        knownFacts: extractKnownFacts("Tomato whiteflies"),
      },
    );

    expect(guarded.questionType).toBe("soil_type");
    expect(guarded.quickReplies).toEqual([
      "Clay",
      "Loam",
      "Sandy",
      "Raised-bed mix",
      "Soilless medium",
      "Not sure",
    ]);
    expect(guarded.questionId).toMatch(/soil_type/);
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

  it("blocks chemical recommendation from vague interview symptoms", () => {
    const guarded = applyCommercialSafetyGuards(
      basePayload({
        stage: "questioning",
        safeActionsNow: ["Spray imidacloprid insecticide today"],
      }),
      {
        mode: "quick_help",
        questionsAskedBeforeThisTurn: 0,
        knownFacts: extractKnownFacts("Tomato leaves look odd"),
      },
    );

    expect(
      guarded.safeActionsNow.join(" ").toLowerCase(),
    ).not.toMatch(/imidacloprid|insecticide/);
  });
});
