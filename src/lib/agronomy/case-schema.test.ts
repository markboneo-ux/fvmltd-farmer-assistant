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

  it("parses the revised structured payload", () => {
    const payload = parseCasePayload({
      mode: "quick_help",
      stage: "questioning",
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
    expect(payload.photoRecommended).toBe(true);
    expect(payload.internalMissingInformation).toContain("spray history");
    expect(isInterviewStage(payload.stage)).toBe(true);
    expect(isGuidanceStage(payload.stage)).toBe(false);
  });

  it("rejects invalid mode or severity", () => {
    expect(() =>
      parseCasePayload({
        mode: "chat",
        stage: "intake",
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
