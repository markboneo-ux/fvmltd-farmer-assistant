import { describe, expect, it } from "vitest";
import { extractKnownFacts } from "./tomato-protocol";
import { extractObservedEvidence } from "./evidence-hierarchy";
import {
  admitCauseIds,
  allowedCauseIds,
  causeIdFromLabel,
} from "./cause-catalog";
import {
  CONSERVATIVE_CURL_YELLOW_FALLBACK,
  extractPipelineObservations,
  renderFarmerPayloadFromPipeline,
  runFarmerCausePipeline,
} from "./farmer-pipeline";
import { emptyRegionalContext, type AgronomicCasePayload } from "./case-schema";

const COUVA =
  "My sweet pepper plants in Couva have some leaves curling and yellowing. It started a few days ago.";

function payload(overrides: Partial<AgronomicCasePayload> = {}): AgronomicCasePayload {
  return {
    mode: "quick_help",
    stage: "assessment",
    questionId: "",
    questionType: "",
    nextQuestion: "Are the spots round with a pale centre?",
    quickReplies: [],
    preliminaryAssessment:
      "Cercospora / frogeye leaf spot, with bacterial leaf spot also possible. Pale-centred versus greasy water-soaked lesions. IF A SPRAY IS NEEDED: mancozeb or chlorothalonil.",
    severity: "unknown",
    checksToday: ["Look for fungal vs bacterial leaf spots"],
    safeActionsNow: ["If a spray is needed, use Mancozeb"],
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

describe("structured allowlist pipeline", () => {
  it("does not allow Cercospora or bacterial leaf spot for Couva curl/yellow", () => {
    const facts = extractKnownFacts(COUVA);
    const evidence = extractObservedEvidence({ facts, text: facts.rawText });
    const obs = extractPipelineObservations({ facts, evidence });
    const allowed = allowedCauseIds(obs);
    const admitted = admitCauseIds(obs, allowed);

    expect(obs.lesionEvidence).toBe(false);
    expect(obs.curlReported).toBe(true);
    expect(obs.yellowingReported).toBe(true);
    expect(allowed).not.toContain("CERCOSPORA");
    expect(allowed).not.toContain("BACTERIAL_LEAF_SPOT");
    expect(allowed).not.toContain("FUNGAL_LEAF_SPOT");
    expect(allowed).not.toContain("VIRUS_SUSPECTED");
    expect(allowed).not.toContain("ROOT_WATER_STRESS");
    expect(allowed).toEqual(expect.arrayContaining(["APHIDS", "NUTRIENT_PATTERN"]));
    expect(admitted).toEqual(expect.arrayContaining(["APHIDS", "NUTRIENT_PATTERN"]));
    expect(admitted).not.toContain("CERCOSPORA");
  });

  it("maps dumped disease labels to IDs and discards them when not allowed", () => {
    expect(causeIdFromLabel("Cercospora / frogeye leaf spot")).toBe("CERCOSPORA");
    expect(causeIdFromLabel("Bacterial leaf spot")).toBe("BACTERIAL_LEAF_SPOT");
    const facts = extractKnownFacts(COUVA);
    const evidence = extractObservedEvidence({ facts, text: facts.rawText });
    const pipeline = runFarmerCausePipeline({
      facts,
      evidence,
      payload: payload({
        admittedCauseIds: ["CERCOSPORA", "BACTERIAL_LEAF_SPOT", "APHIDS"],
      }),
      modelJson: {
        admittedCauseIds: ["CERCOSPORA", "BACTERIAL_LEAF_SPOT", "APHIDS"],
        reasoningPerCause: [
          { causeId: "CERCOSPORA", why: "Pale-centred spots." },
          { causeId: "APHIDS", why: "Check undersides for sucking insects." },
        ],
        checks: ["Are spots round with a pale centre?"],
        immediateActions: ["If a spray is needed, use mancozeb"],
        nextQuestion: "Are the spots greasy or water-soaked?",
        photoRequest: false,
      },
    });
    expect(pipeline.allowedCauseIds).not.toContain("CERCOSPORA");
    expect(pipeline.admittedCauseIds).not.toContain("CERCOSPORA");
    expect(pipeline.discardedCauseIds.join(" ")).toMatch(/CERCOSPORA|BACTERIAL_LEAF_SPOT/);
    expect(pipeline.admittedCauseIds).toContain("APHIDS");
  });

  it("renders server-owned Couva text and never copies model disease prose", () => {
    const facts = extractKnownFacts(COUVA);
    const evidence = extractObservedEvidence({ facts, text: facts.rawText });
    const pipeline = runFarmerCausePipeline({ facts, evidence, payload: payload() });
    const next = renderFarmerPayloadFromPipeline(payload(), pipeline, {
      facts,
      modelJson: {
        admittedCauseIds: ["CERCOSPORA"],
        reasoningPerCause: [{ causeId: "CERCOSPORA", why: "Pale-centred Cercospora." }],
        checks: ["Look for greasy water-soaked lesions"],
        immediateActions: ["Use chlorothalonil"],
        nextQuestion: "Are the spots pale-centred?",
        photoRequest: false,
      },
    });
    const visible = [
      next.preliminaryAssessment,
      next.diagnosisWhy,
      ...next.checksToday,
      ...next.safeActionsNow,
      ...next.actionsToAvoid,
      next.nextQuestion,
      next.sprayGuidanceText,
      ...(next.admittedCauses ?? []).map((cause) => `${cause.label} ${cause.why}`),
    ]
      .join("\n")
      .toLowerCase();
    expect(visible).not.toMatch(
      /cercospora|bacterial leaf spot|fungal leaf spot|pale[- ]centr|greasy|water[\s-]?soaked|mancozeb|chlorothalonil|if a spray is needed/,
    );
    expect(next.preliminaryAssessment).toContain(CONSERVATIVE_CURL_YELLOW_FALLBACK);
    expect(next.nextQuestion.toLowerCase()).toMatch(/underside|insect|mite/);
    expect((next.nextQuestion.match(/\?/g) ?? []).length).toBe(1);
    expect(next.sprayGuidanceText).toBeNull();
    expect((next.admittedCauseIds ?? []).join(" ")).toMatch(/APHIDS|NUTRIENT_PATTERN/);
    expect(next.admittedCauseIds ?? []).not.toContain("CERCOSPORA");
  });

  it("uses the conservative fallback when no cause is admitted", () => {
    const facts = extractKnownFacts("Hello there");
    const evidence = extractObservedEvidence({ facts, text: facts.rawText });
    const pipeline = runFarmerCausePipeline({ facts, evidence });
    pipeline.admittedCauseIds = [];
    pipeline.admitted = [];
    const next = renderFarmerPayloadFromPipeline(payload(), pipeline, { facts });
    expect(next.preliminaryAssessment).toMatch(/enough evidence yet to name the problem/i);
    expect(next.preliminaryAssessment.toLowerCase()).not.toMatch(/cercospora|bacterial leaf spot/);
  });
});
