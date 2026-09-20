import { describe, expect, it } from "vitest";
import { buildDifferentialDiagnosis, isLowDiagnosticConfidence } from "./differential";
import { shouldBlockDestructiveAction } from "@/lib/cases/destructive";
import { extractKnownFacts } from "./tomato-protocol";

describe("differential diagnosis", () => {
  it("keeps 1–3 causes with evidence and does not confirm from AI alone", () => {
    const facts = extractKnownFacts(
      "I'm in Trinidad. My celery is burning from the edges.",
    );
    const result = buildDifferentialDiagnosis({ text: facts.rawText, facts });
    expect(result.hypotheses.length).toBeGreaterThan(0);
    expect(result.hypotheses.length).toBeLessThanOrEqual(3);
    expect(result.confirmedDiagnosis).toBeNull();
    expect(result.hypotheses[0]?.evidenceFor.length).toBeGreaterThan(0);
    expect(result.diagnosticConfidence).not.toBe("confirmed");
  });

  it("blocks destructive action at low confidence", () => {
    const check = shouldBlockDestructiveAction({
      recommendation: "Pull out and dump the plants",
      observedFacts: ["plants wilting"],
      confidence: "unknown",
    });
    expect(check.blocked).toBe(true);
    expect(isLowDiagnosticConfidence("possible")).toBe(true);
  });
});
