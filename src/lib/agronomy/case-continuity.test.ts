import { describe, expect, it } from "vitest";
import { extractKnownFacts } from "./tomato-protocol";
import { extractObservedEvidence } from "./evidence-hierarchy";
import {
  applyAuthoritativeCaseValidation,
  establishedPesticideTarget,
  farmerIntentFromMessage,
  isDiagnosticContinuityFollowUp,
  oneFollowUpQuestion,
  photoChangedRankingLine,
  sprayDiscussionJustified,
  spotsAreObserved,
  stripUnobservedSpotLanguage,
  VIRUS_ROGUE_CAUTION,
} from "./case-continuity";
import { emptyRegionalContext, type AgronomicCasePayload } from "./case-schema";
import { farmingAreaUniquelyImpliesCountry } from "@/lib/weather/geocode";

function payload(overrides: Partial<AgronomicCasePayload> = {}): AgronomicCasePayload {
  return {
    mode: "quick_help",
    stage: "assessment",
    questionId: "",
    questionType: "",
    preliminaryAssessment: "Working assessment.",
    severity: "medium",
    nextQuestion: "Are insects present under the curled new leaves?",
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

describe("case continuity helpers", () => {
  it("treats survive / what should I do as the same diagnostic case", () => {
    expect(isDiagnosticContinuityFollowUp("I really want to make sure my sweet peppers survive.")).toBe(
      true,
    );
    expect(isDiagnosticContinuityFollowUp("What should I do?")).toBe(true);
    expect(isDiagnosticContinuityFollowUp("Is this serious?")).toBe(true);
    expect(farmerIntentFromMessage("I really want to make sure my sweet peppers survive.", false)).toBe(
      "reassurance_same_case",
    );
  });

  it("does not justify a spray section for curling/yellowing without a spray ask", () => {
    const facts = extractKnownFacts(
      "My sweet pepper plants in Couva have some leaves curling and yellowing.",
    );
    const evidence = extractObservedEvidence({ facts, text: facts.rawText });
    expect(spotsAreObserved(evidence, null, facts)).toBe(false);
    expect(
      sprayDiscussionJustified({
        asksForSpray: false,
        evidence,
        diagnosisConfidence: "possible",
      }),
    ).toBe(false);
  });

  it("strips stale pale-centre spot spray language when spots were never reported", () => {
    const cleaned = stripUnobservedSpotLanguage(
      "I need a closer look at the spots — pale centre versus greasy water-soaked.",
      false,
    );
    expect(cleaned.toLowerCase()).not.toMatch(/pale centre versus greasy water-soaked/);
    expect(cleaned.toLowerCase()).not.toMatch(/i need a closer look at the spots/);
  });

  it("keeps one follow-up question", () => {
    expect(
      oneFollowUpQuestion(
        "Are insects present under the curled new leaves? Is yellowing worse on old leaves or new growth?",
      ),
    ).toBe("Are insects present under the curled new leaves?");
  });

  it("resolves Couva uniquely to Trinidad and Tobago", () => {
    expect(farmingAreaUniquelyImpliesCountry("Couva")).toBe("Trinidad and Tobago");
  });

  it("states concrete photo findings without hypothetical visibility", () => {
    const line = photoChangedRankingLine({
      photoFindings: ["cupped new leaves", "uneven yellowing"],
      causes: ["Aphids or other sucking insects", "Nutrient shortage or uneven feeding"],
    });
    expect(line.toLowerCase()).toMatch(/the photo shows|cannot prove a virus/);
    expect(line.toLowerCase()).not.toMatch(/if they are visible/);
    expect(photoChangedRankingLine({ photoFindings: [], causes: [] }).toLowerCase()).toMatch(
      /cannot determine/,
    );
    expect(photoChangedRankingLine({ photoFindings: [], causes: [] }).toLowerCase()).not.toMatch(
      /if they are visible/,
    );
  });

  it("rejects invented spots and unjustified spray from a generated payload", () => {
    const facts = extractKnownFacts(
      "My sweet pepper plants in Couva have some leaves curling and yellowing.",
    );
    const evidence = extractObservedEvidence({ facts, text: facts.rawText });
    const next = applyAuthoritativeCaseValidation(
      payload({
        preliminaryAssessment:
          "If a spray is needed I need a closer look at the spots — pale centre versus greasy water-soaked.",
        sprayGuidanceText: "If a spray is needed\nPale centre versus greasy water-soaked.",
        nextQuestion:
          "Are insects present under the curled new leaves? Is yellowing worse on old leaves or new growth?",
        diagnosisConfidence: "possible",
      }),
      { facts, evidence, hasPhotos: false },
    );
    expect(next.sprayGuidanceText).toBeFalsy();
    expect(next.preliminaryAssessment.toLowerCase()).not.toMatch(/pale centre versus greasy water-soaked/);
    expect((next.nextQuestion.match(/\?/g) ?? []).length).toBe(1);
    expect(VIRUS_ROGUE_CAUTION).not.toMatch(/Do not remove whole plants unless/);
    expect(VIRUS_ROGUE_CAUTION).toMatch(/destructive step|confirm/i);
    expect(
      establishedPesticideTarget({ evidence, facts }),
    ).toBe(false);
    expect(next.likelyCauses?.join(" ").toLowerCase()).not.toMatch(/cercospora|bacterial leaf spot/);
  });
});
