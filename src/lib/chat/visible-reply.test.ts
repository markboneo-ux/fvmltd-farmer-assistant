import { describe, expect, it } from "vitest";
import { emptyRegionalContext } from "@/lib/agronomy/case-schema";
import type { AgronomicCasePayload } from "@/lib/agronomy/case-schema";
import {
  buildFarmerVisibleReply,
  shouldUseDiagnosisLayout,
  stripGuidancePrefix,
} from "./visible-reply";

function payload(
  overrides: Partial<AgronomicCasePayload> = {},
): AgronomicCasePayload {
  return {
    mode: "quick_help",
    stage: "questioning",
    questionId: "q_1_field_distribution",
    questionType: "field_distribution",
    preliminaryAssessment:
      "Whiteflies usually gather underneath the leaves and can cause yellowing.",
    severity: "unknown",
    nextQuestion: "Are they on a few plants or throughout most of the crop?",
    quickReplies: ["Few plants", "Patches", "Most of field", "Not sure"],
    checksToday: [],
    safeActionsNow: [],
    actionsToAvoid: [],
    photoRecommended: false,
    escalationRecommended: false,
    regionalContext: emptyRegionalContext(),
    weatherRisks: [],
    verifiedInputOptions: [],
    internalMissingInformation: ["variety"],
    ...overrides,
  };
}

describe("farmer-visible reply", () => {
  it("combines useful prose with one follow-up and strips the guidance prefix", () => {
    const text = buildFarmerVisibleReply(
      payload({
        preliminaryAssessment:
          "Preliminary guidance: Whiteflies usually gather underneath the leaves.",
      }),
    );
    expect(text).toContain("Whiteflies usually gather");
    expect(text).toContain("few plants");
    expect(text).not.toMatch(/preliminary guidance:/i);
    expect(text).not.toMatch(/question 1 of/i);
    expect(stripGuidancePrefix("Preliminary guidance: Hello")).toBe("Hello");
  });

  it("keeps a straightforward answer as prose without a diagnosis layout", () => {
    expect(
      shouldUseDiagnosisLayout(
        payload({
          stage: "questioning",
          checksToday: [],
          safeActionsNow: [],
        }),
      ),
    ).toBe(false);
  });

  it("uses a compact diagnosis layout only for urgent guidance", () => {
    expect(
      shouldUseDiagnosisLayout(
        payload({
          stage: "assessment",
          checksToday: ["Turn leaves over"],
          safeActionsNow: ["Scout early morning"],
          preliminaryAssessment: "Preliminary guidance: whitefly pressure looks significant.",
          escalationRecommended: false,
        }),
      ),
    ).toBe(false);
    expect(
      shouldUseDiagnosisLayout(
        payload({
          stage: "human_review",
          escalationRecommended: true,
          checksToday: ["Cut one wilted stem"],
          safeActionsNow: ["Hold new sprays"],
        }),
      ),
    ).toBe(true);
  });
});
