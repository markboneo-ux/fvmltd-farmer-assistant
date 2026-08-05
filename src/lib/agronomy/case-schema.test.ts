import { describe, expect, it } from "vitest";
import {
  CASE_STAGES,
  isCaseStage,
  isInterviewStage,
  parseCasePayload,
} from "./case-schema";

describe("case-schema", () => {
  it("includes all required stages", () => {
    expect(CASE_STAGES).toEqual([
      "intake",
      "questioning",
      "assessment",
      "action_plan",
      "follow_up",
      "resolved",
      "human_review",
    ]);
  });

  it("validates stages", () => {
    expect(isCaseStage("intake")).toBe(true);
    expect(isCaseStage("human_review")).toBe(true);
    expect(isCaseStage("diagnosis")).toBe(false);
  });

  it("marks intake and questioning as interview stages", () => {
    expect(isInterviewStage("intake")).toBe(true);
    expect(isInterviewStage("questioning")).toBe(true);
    expect(isInterviewStage("assessment")).toBe(false);
  });

  it("parses a valid structured payload", () => {
    const payload = parseCasePayload({
      stage: "questioning",
      caseSummary: "Commercial tomato field stunted in Trinidad.",
      nextQuestion: "How old are the plants?",
      missingCriticalInformation: ["plant age", "drainage"],
      redFlags: [],
      likelyCauses: [],
      checksToday: [],
      safeActionsNow: [],
      actionsToAvoid: [],
      escalationReason: "",
    });

    expect(payload.stage).toBe("questioning");
    expect(payload.nextQuestion).toBe("How old are the plants?");
    expect(payload.missingCriticalInformation).toContain("plant age");
  });

  it("rejects invalid stage", () => {
    expect(() =>
      parseCasePayload({
        stage: "guessing",
        caseSummary: "x",
        nextQuestion: "",
        missingCriticalInformation: [],
        redFlags: [],
        likelyCauses: [],
        checksToday: [],
        safeActionsNow: [],
        actionsToAvoid: [],
        escalationReason: "",
      }),
    ).toThrow(/invalid stage/i);
  });
});
