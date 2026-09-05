import { describe, expect, it } from "vitest";
import { emptyRegionalContext, type AgronomicCasePayload } from "./case-schema";
import {
  applyDiagnosticPlaybook,
  playbookFor,
} from "./diagnosis";
import { extractKnownFacts } from "./tomato-protocol";

function payload(overrides: Partial<AgronomicCasePayload> = {}): AgronomicCasePayload {
  return {
    mode: "quick_help",
    stage: "assessment",
    questionId: "",
    questionType: "",
    preliminaryAssessment: "Could be heat, nutrient imbalance or watering.",
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

describe("diagnostic playbook", () => {
  it("gives celery burning a ranked differential instead of one cause", () => {
    const facts = extractKnownFacts("My celery is burning up.");
    const result = applyDiagnosticPlaybook(payload(), {
      facts,
      intent: "crop_problem",
    });
    expect(result.likelyCauses?.length).toBeGreaterThanOrEqual(3);
    expect(result.likelyCauses?.join(" ").toLowerCase()).toMatch(/root|stress|potassium|spray/);
    expect(result.preliminaryAssessment.toLowerCase()).toMatch(/tips?|edges?|spots/);
    expect(result.checksToday.length).toBeGreaterThanOrEqual(2);
    expect(result.nextQuestion.toLowerCase()).toMatch(/tips?|edges?|spots/);
    expect(result.preliminaryAssessment.toLowerCase()).not.toMatch(/72-hour|disease-pressure alert/);
  });

  it("gives home gardeners simpler celery language", () => {
    const facts = extractKnownFacts(
      "My backyard celery in pots on the porch is burning up.",
    );
    expect(playbookFor(facts, "HOME_GARDENER")?.id).toBe("celery_burn_home");
    const result = applyDiagnosticPlaybook(payload(), {
      facts,
      farmerLevel: "HOME_GARDENER",
      intent: "crop_problem",
    });
    expect(result.preliminaryAssessment.toLowerCase()).not.toMatch(/\bfrac\b|\bec\b|phytotoxicity/);
    expect(result.likelyCauses?.join(" ").toLowerCase()).toMatch(/watering|fertilizer|spray/);
  });

  it("gives technical users a deeper celery differential", () => {
    const facts = extractKnownFacts(
      "Celery foliar necrosis. Differential for tip burn vs Cercospora. Check EC and FRAC if we spray.",
    );
    expect(facts.farmerLevel).toBe("TECHNICAL_USER");
    const result = applyDiagnosticPlaybook(payload(), {
      facts,
      farmerLevel: "TECHNICAL_USER",
      intent: "crop_problem",
    });
    expect(result.likelyCauses?.join(" ")).toMatch(/EC|Cercospora|phytotoxicity|K or Ca/i);
    expect(result.checksToday.join(" ")).toMatch(/EC|pH|FRAC|lesion/i);
  });
});
