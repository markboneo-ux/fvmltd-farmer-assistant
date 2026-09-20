import { describe, expect, it } from "vitest";
import { extractKnownFacts } from "./tomato-protocol";
import { extractObservedEvidence } from "./evidence-hierarchy";
import { rankDiagnosticCauses } from "./causes";
import {
  admitEvidenceGatedCauses,
  farmerReportedLesions,
  hasLesionEvidence,
  isLesionSpecificDisease,
  sanitizePhotoFindings,
  trustedPhotoFindings,
} from "./evidence-gated-causes";

const COUVA =
  "My sweet pepper plants in Couva have some leaves curling and yellowing. It started a few days ago.";

describe("evidence-gated causes", () => {
  it("does not treat curling/yellowing as lesion evidence", () => {
    const facts = extractKnownFacts(COUVA);
    const evidence = extractObservedEvidence({ facts, text: facts.rawText });
    expect(evidence.symptoms).toEqual(expect.arrayContaining(["leaf curl", "yellowing"]));
    expect(evidence.symptoms).not.toContain("spots");
    expect(farmerReportedLesions(facts.rawText)).toBe(false);
    expect(hasLesionEvidence({ evidence, facts })).toBe(false);
  });

  it("rejects Cercospora and bacterial leaf spot without lesion evidence", () => {
    const facts = extractKnownFacts(COUVA);
    const evidence = extractObservedEvidence({ facts, text: facts.rawText });
    const gated = admitEvidenceGatedCauses({
      incoming: ["Cercospora / frogeye leaf spot", "Bacterial leaf spot", "Waterlogging"],
      evidence,
      facts,
      crop: "pepper",
    });
    const labels = gated.admitted.map((cause) => cause.label).join(" ").toLowerCase();
    expect(labels).not.toMatch(/cercospora|frogeye|bacterial leaf spot|waterlog/);
    expect(labels).toMatch(/aphid|sucking/);
    expect(gated.rejected.some((item) => /cercospora/i.test(item.label))).toBe(true);
    for (const cause of gated.admitted) {
      expect(cause.evidenceSource).toMatch(
        /farmer_report|photo_finding|weather_support|prior_confirmed_case_fact/,
      );
      expect(cause.evidenceFact.length).toBeGreaterThan(0);
    }
  });

  it("does not rank lesion-specific pepper diseases from curl/yellow text", () => {
    const facts = extractKnownFacts(COUVA);
    const evidence = extractObservedEvidence({ facts, text: facts.rawText });
    const causes = rankDiagnosticCauses(facts.rawText, { crop: facts.crop, facts, evidence });
    expect(causes.map((item) => item.label).join(" ").toLowerCase()).not.toMatch(
      /cercospora|bacterial leaf spot|frogeye/,
    );
    expect(causes.map((item) => item.label).join(" ").toLowerCase()).toMatch(/aphid|nutrient/);
  });

  it("keeps Cercospora when the farmer reported leaf spots", () => {
    const text = "Sweet peppers in Grenada have leaf spots. What spray can I use?";
    const facts = extractKnownFacts(text);
    const evidence = extractObservedEvidence({ facts, text });
    expect(hasLesionEvidence({ evidence, facts })).toBe(true);
    expect(isLesionSpecificDisease("Cercospora / frogeye leaf spot")).toBe(true);
    const gated = admitEvidenceGatedCauses({
      incoming: ["Cercospora / frogeye leaf spot", "Bacterial leaf spot"],
      evidence,
      facts,
      crop: "pepper",
    });
    expect(gated.admitted.map((cause) => cause.label).join(" ").toLowerCase()).toMatch(
      /cercospora|bacterial/,
    );
  });

  it("drops hypothetical and disease-name photo findings", () => {
    expect(
      sanitizePhotoFindings([
        "photo_attached",
        "cupping, uneven yellowing, or insects if they are visible",
        "Cercospora / frogeye leaf spot",
        "visible curling of new leaves",
        "no discrete spots visible",
      ]),
    ).toEqual(["visible curling of new leaves", "no discrete spots visible"]);
  });

  it("does not trust model lesion claims when the farmer never reported spots", () => {
    expect(
      trustedPhotoFindings({
        raw: ["pale-centred spots visible", "cupped new leaves"],
        farmerReportedLesions: false,
      }),
    ).toEqual(["cupped new leaves"]);
  });
});
