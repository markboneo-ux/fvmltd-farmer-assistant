import { describe, expect, it } from "vitest";
import {
  CASE_MODES,
  CASE_STAGES,
  isCaseMode,
  isCaseStage,
  isGuidanceStage,
  isInterviewStage,
  parseCasePayload,
  QUICK_HELP_MAX_QUESTIONS,
  stripMarkdownMarkers,
} from "./case-schema";

describe("case-schema rapid triage", () => {
  it("defines quick_help and full_crop_check modes", () => {
    expect(CASE_MODES).toEqual(["quick_help", "full_crop_check"]);
    expect(isCaseMode("quick_help")).toBe(true);
    expect(isCaseMode("full_crop_check")).toBe(true);
  });

  it("keeps all case stages", () => {
    expect(CASE_STAGES).toContain("assessment");
    expect(isCaseStage("human_review")).toBe(true);
  });

  it("caps Quick Help at three questions", () => {
    expect(QUICK_HELP_MAX_QUESTIONS).toBe(3);
  });

  it("parses the revised structured payload with questionId/type", () => {
    const payload = parseCasePayload({
      mode: "quick_help",
      stage: "questioning",
      questionId: "q_1_field_distribution",
      questionType: "field_distribution",
      preliminaryAssessment: "Tomato whiteflies reported.",
      severity: "unknown",
      nextQuestion:
        "Are they affecting a few plants, patches, or most of the field?",
      quickReplies: ["Few plants", "Patches", "Most of field", "Not sure"],
      checksToday: [],
      safeActionsNow: [],
      actionsToAvoid: [],
      photoRecommended: true,
      escalationRecommended: false,
      internalMissingInformation: ["spray history"],
    });

    expect(payload.mode).toBe("quick_help");
    expect(payload.questionId).toBe("q_1_field_distribution");
    expect(payload.questionType).toBe("field_distribution");
    expect(payload.photoRecommended).toBe(true);
    expect(payload.internalMissingInformation).toContain("spray history");
    expect(payload.weatherRisks).toEqual([]);
    expect(payload.verifiedInputOptions).toEqual([]);
    expect(isInterviewStage(payload.stage)).toBe(true);
    expect(isGuidanceStage(payload.stage)).toBe(false);
  });

  it("strips Markdown markers from farmer-facing text", () => {
    expect(stripMarkdownMarkers("### Heading\n**Bold** advice")).toBe(
      "Heading\nBold advice",
    );
  });

  it("rejects invalid mode or severity", () => {
    expect(() =>
      parseCasePayload({
        mode: "chat",
        stage: "intake",
        questionId: "",
        questionType: "",
        preliminaryAssessment: "x",
        severity: "low",
        nextQuestion: "",
        quickReplies: [],
        checksToday: [],
        safeActionsNow: [],
        actionsToAvoid: [],
        photoRecommended: false,
        escalationRecommended: false,
        internalMissingInformation: [],
      }),
    ).toThrow(/invalid mode/i);
  });
});
