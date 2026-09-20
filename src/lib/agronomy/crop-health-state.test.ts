import { describe, expect, it } from "vitest";
import {
  emptyCropHealthState,
  mergeCropHealthState,
  suspectedCausesFromRanked,
} from "./crop-health-state";
import { rankDiagnosticCauses } from "./causes";

describe("crop-health case state", () => {
  it("keeps a structured internal record for a meaningful crop-health case", () => {
    const state = mergeCropHealthState(emptyCropHealthState(), {
      country: "Guyana",
      farmingArea: "Berbice",
      crop: "sweet pepper",
      symptoms: ["leaf spot"],
      diagnosticConfidence: "possible",
      suspectedCauses: suspectedCausesFromRanked(
        rankDiagnosticCauses("Sweet pepper leaves have spots after rain in Berbice"),
      ),
    });
    expect(state.country).toBe("Guyana");
    expect(state.farmingArea).toBe("Berbice");
    expect(state.crop).toBe("sweet pepper");
    expect(state.suspectedCauses.length).toBeGreaterThan(0);
    expect(state.suspectedCauses.length).toBeLessThanOrEqual(3);
    expect(state.confirmedDiagnosis).toBeNull();
  });

  it("does not let a later empty update wipe known facts", () => {
    const first = mergeCropHealthState(emptyCropHealthState(), {
      country: "Jamaica",
      farmingArea: "St Catherine",
      crop: "tomato",
    });
    const next = mergeCropHealthState(first, { crop: null, symptoms: [] });
    expect(next.country).toBe("Jamaica");
    expect(next.farmingArea).toBe("St Catherine");
    expect(next.crop).toBe("tomato");
  });
});
