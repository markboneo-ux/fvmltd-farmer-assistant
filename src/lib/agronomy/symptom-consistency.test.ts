import { describe, expect, it } from "vitest";
import { extractKnownFacts } from "./tomato-protocol";
import {
  alignNarrativeToObservedSymptoms,
  extractSymptomAttributes,
  hasStaleSymptomWording,
} from "./symptom-consistency";

describe("symptom consistency", () => {
  it("extracts small brown spots on the lower leaves from the Couva prompt", () => {
    const text =
      "My tomato leaves in Couva are developing small brown spots on the lower leaves.";
    const facts = extractKnownFacts(text);
    const attrs = extractSymptomAttributes({
      facts,
      text,
      weatherSignals: ["prolonged_wetness"],
    });
    expect(attrs.crop).toBe("tomato");
    expect(attrs.symptomType).toBe("spots");
    expect(attrs.colour).toBe("brown");
    expect(attrs.size).toBe("small");
    expect(attrs.location).toBe("lower leaves");
    expect(attrs.wetFromFarmer).toBe(false);
    expect(attrs.weatherDerivedWet).toBe(true);
    expect(attrs.farmerPhrase?.toLowerCase()).toMatch(/small brown spots on the lower leaves/);
  });

  it("does not let a yellow-spot template overwrite brown spots", () => {
    const text =
      "My tomato leaves in Couva are developing small brown spots on the lower leaves.";
    const facts = extractKnownFacts(text);
    const attrs = extractSymptomAttributes({
      facts,
      text,
      weatherSignals: ["prolonged_wetness"],
    });
    const template =
      "On tomato, yellow spots on the lower leaves after a wet week make a foliar disease more likely.";
    expect(hasStaleSymptomWording(template, attrs)).toBe(true);
    const aligned = alignNarrativeToObservedSymptoms(template, attrs);
    expect(aligned.toLowerCase()).toMatch(/small brown spots/);
    expect(aligned.toLowerCase()).not.toMatch(/yellow spots/);
    expect(aligned.toLowerCase()).not.toMatch(/after a wet week/);
    expect(aligned.toLowerCase()).toMatch(/recent conditions that have been wet/);
  });
});
