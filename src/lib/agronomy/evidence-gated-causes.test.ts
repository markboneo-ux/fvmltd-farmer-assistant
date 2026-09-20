import { describe, expect, it } from "vitest";
import { extractKnownFacts } from "./tomato-protocol";
import { extractObservedEvidence } from "./evidence-hierarchy";
import { rankDiagnosticCauses } from "./causes";
import {
  admitEvidenceGatedCauses,
  applyAdmittedCauseContract,
  extractNamedCausesFromProse,
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

  it("scrubs every first-turn visible field when the model dumps lesion/spray prose", () => {
    const facts = extractKnownFacts(COUVA);
    const evidence = extractObservedEvidence({ facts, text: facts.rawText });
    const assessment = [
      "Cercospora / frogeye leaf spot is most likely.",
      "Bacterial leaf spot is also possible.",
      "Pale-centred spots versus greasy water-soaked lesions.",
      "IF A SPRAY IS NEEDED",
      "Mancozeb- or chlorothalonil-class protectants for a fungal leaf spot, or copper spray classes for bacterial leaf spot.",
    ].join(" ");
    const payload = {
      mode: "quick_help" as const,
      stage: "assessment" as const,
      questionId: "",
      questionType: "" as const,
      nextQuestion: "Are the spots round with a pale centre, or greasy and water-soaked?",
      quickReplies: [],
      preliminaryAssessment: assessment,
      severity: "unknown" as const,
      checksToday: [
        "Are spots round with a pale centre, or greasy and water-soaked?",
        "Look for fungal vs bacterial leaf spots",
      ],
      safeActionsNow: [
        "If a spray is needed, use Mancozeb- or chlorothalonil-class protectants",
        "Copper spray classes for bacterial leaf spot",
      ],
      actionsToAvoid: [
        "Do not mix fungal and bacterial leaf spot products until pale-centred versus greasy water-soaked spots are known",
      ],
      photoRecommended: true,
      escalationRecommended: false,
      regionalContext: { country: null, district: null, productDataAsOf: null, weatherDataAsOf: null },
      weatherRisks: [],
      verifiedInputOptions: [],
      internalMissingInformation: [],
      likelyCauses: [],
      rankedCauses: [],
      diagnosisWhy: assessment,
      whatWouldChangeDiagnosis: ["Pale-centred spots would raise Cercospora"],
      monitorNext: "Watch for greasy water-soaked spots.",
      sprayGuidanceText:
        "If a spray is needed\nMancozeb. Chlorothalonil. Copper spray classes.",
    };
    expect(extractNamedCausesFromProse(payload).join(" ").toLowerCase()).toMatch(
      /cercospora|bacterial leaf spot/,
    );
    const gated = admitEvidenceGatedCauses({
      incoming: [],
      evidence,
      facts,
      crop: facts.crop,
    });
    const next = applyAdmittedCauseContract(payload, {
      admitted: gated.admitted,
      rawModelCauses: extractNamedCausesFromProse(payload),
      evidence,
      facts,
    });
    const visible = [
      next.preliminaryAssessment,
      next.diagnosisWhy,
      ...next.checksToday,
      ...next.safeActionsNow,
      ...next.actionsToAvoid,
      ...(next.whatWouldChangeDiagnosis ?? []),
      next.monitorNext,
      next.nextQuestion,
      next.sprayGuidanceText,
      ...(next.admittedCauses ?? []).map((cause) => `${cause.label} ${cause.why} ${cause.increasesIf}`),
    ]
      .join("\n")
      .toLowerCase();
    expect(visible).not.toMatch(
      /cercospora|frogeye|bacterial leaf spot|fungal leaf spot|pale[- ]centr|greasy|water[\s-]?soaked|mancozeb|chlorothalonil|copper spray classes|if a spray is needed/,
    );
    expect(next.sprayGuidanceText).toBeNull();
    expect((next.admittedCauses ?? []).map((cause) => cause.label).join(" ").toLowerCase()).toMatch(
      /aphid|sucking|nutrient/,
    );
    expect(facts.crop).toBe("pepper");
    expect(facts.district?.toLowerCase()).toBe("couva");
    expect(evidence.symptoms).toEqual(expect.arrayContaining(["leaf curl", "yellowing"]));
    expect(evidence.symptoms).not.toContain("spots");
  });

  it("does not treat a disease name alone as lesion evidence", () => {
    expect(farmerReportedLesions("Cercospora / frogeye leaf spot")).toBe(false);
    expect(
      farmerReportedLesions(
        "cannot determine whether lesions, insects, or a nutrient pattern are present",
      ),
    ).toBe(false);
    expect(farmerReportedLesions("Sweet peppers have leaf spots")).toBe(true);
  });

  it("treats an uncertain photo as no lesion evidence", () => {
    const facts = extractKnownFacts(COUVA);
    const evidence = extractObservedEvidence({
      facts,
      text: facts.rawText,
      hasPhotos: true,
      photoFindings: [],
    });
    expect(
      hasLesionEvidence({
        evidence,
        facts,
        photoFindings: [],
        hasPhotos: true,
      }),
    ).toBe(false);
  });
});
