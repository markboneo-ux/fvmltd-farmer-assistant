import { describe, expect, it } from "vitest";
import type { AgronomicCasePayload } from "./case-schema";
import {
  applyCommercialSafetyGuards,
  CRITICAL_CASE_FACTS,
  mentionsPrematureFertilizer,
  mentionsSandOrGravel,
} from "./tomato-protocol";

function basePayload(
  overrides: Partial<AgronomicCasePayload> = {},
): AgronomicCasePayload {
  return {
    stage: "questioning",
    caseSummary: "Commercial tomato field stunted in Trinidad.",
    nextQuestion: "Does the soil stay wet after irrigation?",
    missingCriticalInformation: ["drainage"],
    redFlags: [],
    likelyCauses: ["nitrogen deficiency", "root disease"],
    checksToday: ["Check roots"],
    safeActionsNow: ["Apply fertilizer today"],
    actionsToAvoid: [],
    escalationReason: "",
    ...overrides,
  };
}

describe("tomato-protocol", () => {
  it("lists all critical facts to collect", () => {
    expect(CRITICAL_CASE_FACTS).toEqual(
      expect.arrayContaining([
        "country",
        "district",
        "crop",
        "variety",
        "plant age",
        "commercial or home production",
        "production environment",
        "area planted",
        "symptom onset",
        "leaves affected",
        "field distribution",
        "soil or growing medium",
        "irrigation",
        "drainage",
        "fertilizer history",
        "spray history",
        "recent weather",
        "root observations",
        "photo availability",
      ]),
    );
  });

  it("detects sand/gravel recommendations", () => {
    expect(mentionsSandOrGravel("Add sand to the soil to improve drainage")).toBe(
      true,
    );
    expect(mentionsSandOrGravel("Observe drainage for two days")).toBe(false);
  });

  it("detects premature fertilizer advice", () => {
    expect(mentionsPrematureFertilizer("Apply fertilizer now for stunting")).toBe(
      true,
    );
  });

  it("strips sand advice and clears interview diagnosis lists", () => {
    const guarded = applyCommercialSafetyGuards(
      basePayload({
        stage: "intake",
        safeActionsNow: [
          "Add gravel to the field to fix drainage",
          "Walk the field edges",
        ],
        likelyCauses: ["everything"],
        checksToday: ["dig holes"],
      }),
    );

    expect(guarded.safeActionsNow).toEqual([]);
    expect(guarded.likelyCauses).toEqual([]);
    expect(guarded.checksToday).toEqual([]);
    expect(
      guarded.actionsToAvoid.some((item) => /sand or gravel/i.test(item)),
    ).toBe(true);
    expect(guarded.nextQuestion.length).toBeGreaterThan(0);
  });

  it("blocks premature fertilizer during questioning", () => {
    const guarded = applyCommercialSafetyGuards(
      basePayload({
        stage: "questioning",
        safeActionsNow: ["Apply NPK fertilizer because plants are stunted"],
      }),
    );

    expect(guarded.safeActionsNow).toEqual([]);
    expect(
      guarded.actionsToAvoid.some((item) => /fertilizer solely/i.test(item)),
    ).toBe(true);
  });
});
