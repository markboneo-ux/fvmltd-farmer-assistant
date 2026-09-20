import { describe, expect, it, beforeEach } from "vitest";
import { emptyRegionalContext, type AgronomicCasePayload } from "./case-schema";
import { rankDiagnosticCauses } from "./causes";
import { agronomicModeFor } from "./case-modes";
import { extractObservedEvidence } from "./evidence-hierarchy";
import { applyDiagnosticPlaybook, playbookFor } from "./diagnosis";
import { applyQualityCorrection, evaluateConsistency } from "./response-quality";
import { sanitizeCertaintyLanguage, overclaimsConfirmation } from "./certainty-language";
import { buildSprayGuidance, SPRAY_NEEDED_HEADING, FUNGAL_LEAF_SPOT_HEADING, BACTERIAL_LEAF_SPOT_HEADING, NARROW_SPRAY_TARGET } from "./chemical-guidance";
import { extractKnownFacts, applyCommercialSafetyGuards } from "./tomato-protocol";
import { extractLastCrop } from "@/lib/assistant/crops";
import { runAgronomicCase } from "./runCase";
import { shouldBlockDestructiveAction, SOFT_LEAF_REMOVAL } from "@/lib/cases/destructive";
import { farmerRenderedAnswer } from "@/lib/chat/visible-reply";
import { QUICK_REPLIES_BY_TYPE } from "./question-types";
import { setWeatherProviderForTests, buildMockHumidRainyForecast } from "@/lib/weather/get-forecast";

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
    safeActionsNow: ["Remove affected leaves"],
    actionsToAvoid: [],
    photoRecommended: false,
    escalationRecommended: false,
    regionalContext: emptyRegionalContext(),
    weatherRisks: [],
    verifiedInputOptions: [],
    internalMissingInformation: [],
    rankedCauses: [
      {
        category: "environmental stress",
        label: "Heat, wind, or weather stress",
        rank: 1,
        why: "weather",
        increasesIf: "heat",
        decreasesIf: "mild days",
      },
    ],
    likelyCauses: [
      "Root-zone stress (water, drainage, or salt buildup)",
      "Nutrient imbalance or fertilizer injury",
      "Foliar disease or insect damage",
    ],
    ...overrides,
  };
}

function mockJson(overrides: Partial<AgronomicCasePayload> = {}) {
  return JSON.stringify(
    payload({
      preliminaryAssessment: "Working assessment for the farmer.",
      likelyCauses: [],
      rankedCauses: [],
      safeActionsNow: [],
      ...overrides,
    }),
  );
}

beforeEach(() => {
  setWeatherProviderForTests({
    name: "mock-humid-rainy",
    async getForecast(location) {
      return buildMockHumidRainyForecast(location);
    },
  });
});

describe("evidence hierarchy and modes", () => {
  it("treats an explicit whitefly report as observed pest management", () => {
    const facts = extractKnownFacts(
      "Whiteflies under my Scotch bonnet leaves in St Elizabeth.",
    );
    expect(extractLastCrop(facts.rawText)).toBe("pepper");
    expect(facts.crop).toBe("pepper");
    expect(facts.suspectedIssue).toBe("whiteflies");
    const evidence = extractObservedEvidence({ facts, text: facts.rawText });
    expect(evidence.observedPest).toBe("whiteflies");
    expect(agronomicModeFor({ evidence, facts })).toBe("OBSERVED_PEST_MANAGEMENT");
    const causes = rankDiagnosticCauses(facts.rawText, { crop: facts.crop, facts, evidence });
    expect(causes.map((item) => item.label).join(" ").toLowerCase()).toMatch(/whitefl/);
    expect(causes.map((item) => item.label).join(" ")).not.toMatch(/Heat, wind, or weather stress/);
    expect(causes.map((item) => item.label).join(" ")).not.toMatch(/Root-zone stress/);
  });

  it("ranks tomato lower-leaf spots after rain as foliar disease, not generic root/nutrient first", () => {
    const text = "My tomatoes in Couva have yellow spots on the lower leaves after a week of rain.";
    const facts = extractKnownFacts(text);
    expect(facts.crop).toBe("tomato");
    expect(facts.district?.toLowerCase()).toMatch(/couva/);
    const evidence = extractObservedEvidence({ facts, text });
    expect(evidence.wetFromFarmer).toBe(true);
    const causes = rankDiagnosticCauses(text, { crop: "tomato", facts, evidence });
    expect(causes[0]?.label.toLowerCase()).toMatch(/septoria|early blight|bacterial/);
    expect(causes.map((item) => item.label).join(" ").toLowerCase()).not.toMatch(/root-zone stress/);
    expect(causes.map((item) => item.label).join(" ").toLowerCase()).not.toMatch(/nutrient imbalance/);
    const book = playbookFor(facts, "SMALL_FARMER");
    expect(book?.id).toMatch(/tomato_foliar/);
    expect(book?.likelyCauses.join(" ").toLowerCase()).toMatch(/septoria|early blight/);
    expect(book?.actionsToday.join(" ").toLowerCase()).not.toMatch(/remove affected leaves/);
  });

  it("answers a Grenada spray question with unverified local classes, not a regulator-only brush-off", () => {
    const facts = extractKnownFacts(
      "Sweet peppers in Grenada have leaf spots. What spray can I use?",
    );
    expect(facts.country).toBe("Grenada");
    expect(facts.asksForProducts).toBe(true);
    const shaped = applyDiagnosticPlaybook(payload({ likelyCauses: [] }), {
      facts,
      intent: "pest_disease",
    });
    expect(shaped.likelyCauses?.join(" ").toLowerCase()).toMatch(/cercospora|bacterial/);
    expect(shaped.likelyCauses?.join(" ").toLowerCase()).not.toMatch(/root-zone stress/);
    const spray = buildSprayGuidance({
      country: "Grenada",
      crop: "pepper",
      target: "leaf spots",
      asksForSpray: true,
      diagnosisConfidence: "possible",
      likelyCauses: ["Cercospora / frogeye leaf spot", "Bacterial leaf spot"],
    });
    expect(spray?.farmerText).toMatch(/I could not verify a current Grenada registration for this exact use/);
    expect(spray?.farmerText).toContain(FUNGAL_LEAF_SPOT_HEADING);
    expect(spray?.farmerText).toContain(BACTERIAL_LEAF_SPOT_HEADING);
    expect(spray?.farmerText.toLowerCase()).toMatch(/mancozeb|chlorothalonil/);
    expect(spray?.farmerText.toLowerCase()).toMatch(/copper/);
    expect(spray?.farmerText).toContain(NARROW_SPRAY_TARGET);
    expect(spray?.farmerText.toLowerCase()).not.toMatch(/avoid spraying until the cause is confirmed/);
    expect(spray?.farmerText.toLowerCase()).not.toMatch(/^check with the regulator\.?$/);
    expect(spray?.localRegistrationVerified).toBe(false);
  });

  it("treats bacterial streaming as presumptive, not confirmation, and blocks pulling the field", () => {
    const facts = extractKnownFacts(
      "Hot peppers in Cayo are wilting overnight. Should I pull the whole field?",
    );
    expect(facts.crop).toBe("pepper");
    expect(facts.suddenWilt || /wilt/.test(facts.rawText)).toBe(true);
    const book = playbookFor(facts, null);
    expect(book?.id).toMatch(/wilt/);
    expect(book?.checks.join(" ").toLowerCase()).toMatch(/strong field evidence|much more likely/);
    expect(book?.checks.join(" ").toLowerCase()).not.toMatch(/confirm bacterial wilt/);
    expect(book?.actionsToday.join(" ").toLowerCase()).toMatch(/do not pull the whole field/);
    expect(
      overclaimsConfirmation("A bacterial streaming test would confirm bacterial wilt."),
    ).toBe(true);
    expect(
      sanitizeCertaintyLanguage("A bacterial streaming test would confirm bacterial wilt.").toLowerCase(),
    ).toMatch(/much more likely/);
    expect(
      sanitizeCertaintyLanguage("A bacterial streaming test would confirm bacterial wilt.").toLowerCase(),
    ).not.toMatch(/confirm bacterial wilt/);
    const blocked = shouldBlockDestructiveAction({
      recommendation: "Pull the whole field",
      observedFacts: ["plants wilting overnight"],
      confidence: "unknown",
    });
    expect(blocked.blocked).toBe(true);
  });
});

describe("quality evaluator correction pass", () => {
  it("drops generic ranked causes when whiteflies were observed", () => {
    const facts = extractKnownFacts(
      "Whiteflies under my Scotch bonnet leaves in St Elizabeth.",
    );
    const corrected = applyQualityCorrection(payload(), { facts });
    expect(corrected.agronomicMode).toBe("OBSERVED_PEST_MANAGEMENT");
    expect(corrected.rankedCauses ?? []).toEqual([]);
    expect(corrected.likelyCauses?.join(" ").toLowerCase()).toMatch(/whitefl/);
    expect(corrected.likelyCauses?.join(" ")).not.toMatch(/Heat, wind/);
    expect(corrected.safeActionsNow.join(" ").toLowerCase()).not.toMatch(/remove affected leaves/);
    expect(evaluateConsistency({ payload: corrected, facts }).reasons).not.toContain(
      "observed_pest_overridden",
    );
  });

  it("replaces generic tomato cards with crop-specific causes", () => {
    const facts = extractKnownFacts(
      "My tomatoes in Couva have yellow spots on the lower leaves after a week of rain.",
    );
    const corrected = applyQualityCorrection(payload(), { facts });
    expect(corrected.likelyCauses?.join(" ").toLowerCase()).toMatch(/septoria|early blight|bacterial/);
    expect(corrected.likelyCauses?.join(" ").toLowerCase()).not.toMatch(/root-zone stress/);
    expect(corrected.preliminaryAssessment.toLowerCase()).toMatch(/septoria|early blight|foliar disease/);
  });
});

describe("live case shaping through runAgronomicCase", () => {
  it("A: Couva tomato spots are tomato-specific after playbook + correction", async () => {
    const result = await runAgronomicCase({
      message:
        "My tomatoes in Couva have yellow spots on the lower leaves after a week of rain.",
      skipRegionalTools: true,
      createResponse: async () => ({
        id: "couva",
        output_text: mockJson(),
      }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.case.likelyCauses?.join(" ").toLowerCase()).toMatch(/septoria|early blight|bacterial/);
    expect(result.case.likelyCauses?.join(" ").toLowerCase()).not.toMatch(/root-zone stress/);
    expect(result.case.safeActionsNow.join(" ").toLowerCase()).not.toMatch(/remove affected leaves/);
    expect(result.case.agronomicMode).toBe("SUSPECTED_DISEASE_DIAGNOSIS");
  });

  it("B: Grenada pepper spray question keeps a useful unverified-class answer", async () => {
    const result = await runAgronomicCase({
      message: "Sweet peppers in Grenada have leaf spots. What spray can I use?",
      skipRegionalTools: true,
      createResponse: async () => ({
        id: "grenada",
        output_text: mockJson({
          preliminaryAssessment: "Leaf spots on pepper can be fungal or bacterial.",
        }),
      }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.case.sprayGuidanceText).toMatch(
      /I could not verify a current Grenada registration for this exact use/,
    );
    const rendered = farmerRenderedAnswer(result.case);
    expect(rendered).toMatch(new RegExp(SPRAY_NEEDED_HEADING, "i"));
    expect(rendered).toMatch(/I could not verify a current Grenada registration for this exact use/);
    expect(rendered).toContain(FUNGAL_LEAF_SPOT_HEADING);
    expect(rendered).toContain(BACTERIAL_LEAF_SPOT_HEADING);
    expect(rendered.toLowerCase()).toMatch(/mancozeb|chlorothalonil/);
    expect(rendered.toLowerCase()).toMatch(/copper/);
    expect(rendered).toContain(NARROW_SPRAY_TARGET);
    expect(rendered.toLowerCase()).not.toMatch(/avoid spraying until the cause is confirmed/);
    expect(rendered.toLowerCase()).toMatch(/not verified/);
    expect(result.case.likelyCauses?.join(" ").toLowerCase()).toMatch(/cercospora|bacterial/);
  });

  it("C: Belize sudden wilt does not confirm from streaming or pull the field", async () => {
    const result = await runAgronomicCase({
      message: "Hot peppers in Cayo are wilting overnight. Should I pull the whole field?",
      skipRegionalTools: true,
      createResponse: async () => ({
        id: "cayo",
        output_text: mockJson({
          preliminaryAssessment:
            "A bacterial streaming test would confirm bacterial wilt. Pull the whole field.",
          checksToday: ["A streaming test would confirm bacterial wilt"],
          safeActionsNow: ["Pull the whole field"],
        }),
      }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const blob = [
      result.case.preliminaryAssessment,
      ...result.case.checksToday,
      ...result.case.safeActionsNow,
    ]
      .join(" ")
      .toLowerCase();
    expect(blob).not.toMatch(/confirm bacterial wilt/);
    expect(blob).toMatch(/much more likely|strong field evidence|do not pull/);
    expect(result.case.safeActionsNow.join(" ").toLowerCase()).not.toMatch(/pull the whole field/);
  });

  it("D: Jamaica scotch bonnet whiteflies stay in pest-management mode", async () => {
    const result = await runAgronomicCase({
      message: "Whiteflies under my Scotch bonnet leaves in St Elizabeth.",
      skipRegionalTools: true,
      createResponse: async () => ({
        id: "jam",
        output_text: mockJson({
          preliminaryAssessment: "This could be heat, wind, or weather stress.",
          rankedCauses: [
            {
              category: "environmental stress",
              label: "Heat, wind, or weather stress",
              rank: 1,
              why: "weather",
              increasesIf: "heat",
              decreasesIf: "mild",
            },
          ],
        }),
      }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.case.agronomicMode).toBe("OBSERVED_PEST_MANAGEMENT");
    expect((result.case.rankedCauses ?? []).map((item) => item.label).join(" ")).not.toMatch(
      /Heat, wind/,
    );
    expect(result.case.likelyCauses?.join(" ").toLowerCase()).toMatch(/whitefl/);
    expect(result.case.preliminaryAssessment.toLowerCase()).toMatch(/whitefl/);
    expect(result.case.preliminaryAssessment.toLowerCase()).not.toMatch(
      /^this could be heat, wind, or weather stress/,
    );
  });
});

describe("preview remaining live-case gaps", () => {
  it("requires the final rendered Grenada spray answer to contain an If a spray is needed section", async () => {
    const result = await runAgronomicCase({
      message: "Sweet peppers in Grenada have leaf spots. What spray can I use?",
      skipRegionalTools: true,
      createResponse: async () => ({
        id: "grenada-rendered",
        output_text: mockJson({
          preliminaryAssessment:
            "Leaf spots on sweet pepper can be Cercospora or a bacterial spot. Do not buy an unverified product yet.",
          diagnosisWhy:
            "Leaf spots on sweet pepper can be Cercospora or a bacterial spot. Do not buy an unverified product yet.",
          likelyCauses: ["Cercospora leaf spot", "Bacterial leaf spot"],
          checksToday: ["Look for a yellow halo", "Check whether spots are greasy"],
          safeActionsNow: ["Keep leaves drier if you can"],
          actionsToAvoid: ["Do not spray an unnamed mix"],
        }),
      }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rendered = farmerRenderedAnswer(result.case);
    expect(rendered).toMatch(/If a spray is needed/i);
    expect(rendered).toMatch(/I could not verify a current Grenada registration for this exact use/);
    expect(rendered).toContain(FUNGAL_LEAF_SPOT_HEADING);
    expect(rendered).toContain(BACTERIAL_LEAF_SPOT_HEADING);
    expect(rendered.toLowerCase()).toMatch(/mancozeb|copper/);
    expect(rendered).not.toMatch(/^Check with the regulator\.?$/m);
    expect(rendered.toLowerCase()).not.toMatch(/avoid spraying until the cause is confirmed/);
  });

  it("regenerates only quick replies when the follow-up is about lesion type but chips are symptom location", () => {
    const question = "Are the spots small with dark centres or do they have rings?";
    const guarded = applyCommercialSafetyGuards(
      payload({
        stage: "assessment",
        preliminaryAssessment: "On tomato, separate true leaf spots from even yellowing.",
        nextQuestion: question,
        questionType: "symptom_location",
        quickReplies: QUICK_REPLIES_BY_TYPE.symptom_location,
        likelyCauses: ["Septoria leaf spot", "Early blight"],
        checksToday: ["Look at the spot centres"],
        safeActionsNow: ["Hold extra fertilizer"],
      }),
      {
        mode: "quick_help",
        questionsAskedBeforeThisTurn: 1,
        knownFacts: extractKnownFacts(
          "My tomatoes in Couva have yellow spots on the lower leaves after a week of rain.",
        ),
        intent: "pest_disease",
      },
    );
    expect(guarded.nextQuestion).toBe(question);
    expect(guarded.quickReplies).toEqual([
      "Small dark-centred spots",
      "Rings / target-like spots",
      "Water-soaked spots",
      "Something else",
      "Not sure",
    ]);
    expect(guarded.quickReplies.join(" ")).not.toMatch(/Lower leaves|New leaves|Whole plant/);
  });

  it("softens leaf-removal wording at low or moderate confidence instead of stripping it", () => {
    const facts = extractKnownFacts(
      "My tomatoes in Couva have yellow spots on the lower leaves after a week of rain.",
    );
    const corrected = applyQualityCorrection(
      payload({
        diagnosisConfidence: "possible",
        safeActionsNow: ["Remove severely affected leaves if necessary."],
        preliminaryAssessment: "Remove severely affected leaves if necessary. Then scout the bed.",
      }),
      { facts },
    );
    expect(corrected.safeActionsNow.join(" ")).toContain(SOFT_LEAF_REMOVAL);
    expect(corrected.safeActionsNow.join(" ").toLowerCase()).not.toMatch(
      /remove severely affected leaves/,
    );
    expect(
      `${corrected.preliminaryAssessment} ${corrected.safeActionsNow.join(" ")}`,
    ).not.toMatch(/remove severely affected leaves if necessary/i);
  });

  it("uses retrieved Couva weather when the farmer never mentioned rain", async () => {
    const message =
      "My tomato leaves in Couva are developing small brown spots on the lower leaves.";
    expect(message).not.toMatch(/\b(rain|weather|humid|forecast)\b/i);
    const result = await runAgronomicCase({
      message,
      createResponse: async () => ({
        id: "couva-no-rain",
        output_text: mockJson({
          stage: "assessment",
          preliminaryAssessment:
            "On tomato, separate true leaf spots from even yellowing. Septoria, early blight, and bacterial spot remain possible.",
          likelyCauses: ["Septoria leaf spot", "Early blight", "Bacterial spot or speck"],
          checksToday: ["Look at spot centres", "Check older versus new leaves"],
          safeActionsNow: ["Keep people from walking through wet plants"],
          nextQuestion: "Are the spots small with dark centres or do they have rings?",
        }),
      }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.weatherDebug?.resolvedLocation.farmingArea).toMatch(/couva/i);
    expect(result.weatherDebug?.providerResult).toBe("success");
    expect(result.weatherDebug?.recentPeriodAvailable).toBe(true);
    expect(result.weatherDebug?.forecastAvailable).toBe(true);
    expect(result.weatherDebug?.signals.length).toBeGreaterThan(0);
    expect(result.weatherDebug?.materiallyChangedDiagnosis).toBe(true);
    expect(result.case.weatherBrief).toMatch(/wet|humid|rain|leaf-disease/i);
    const rendered = farmerRenderedAnswer(result.case);
    expect(rendered).toMatch(/wet|humid|rain|leaf-disease|damp/i);
    expect(rendered.toLowerCase()).toMatch(/brown spots/);
    expect(rendered.toLowerCase()).not.toMatch(/yellow spots/);
  });

  it("never changes Couva brown spots to yellow spots in the visible reply", async () => {
    const message =
      "My tomato leaves in Couva are developing small brown spots on the lower leaves.";
    const result = await runAgronomicCase({
      message,
      createResponse: async () => ({
        id: "couva-brown-not-yellow",
        output_text: mockJson({
          stage: "assessment",
          preliminaryAssessment:
            "On tomato, yellow spots on the lower leaves after a wet week make a foliar disease more likely.",
          diagnosisWhy:
            "On tomato, yellow spots on the lower leaves after a wet week make a foliar disease more likely.",
          likelyCauses: ["Septoria leaf spot", "Early blight", "Bacterial spot or speck"],
          checksToday: ["Look at spot centres"],
          safeActionsNow: ["Keep people from walking through wet plants"],
        }),
      }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rendered = farmerRenderedAnswer(result.case);
    expect(rendered.toLowerCase()).toMatch(/brown spots/);
    expect(rendered.toLowerCase()).not.toMatch(/yellow spots/);
    expect(result.case.diagnosisWhy?.toLowerCase() ?? "").not.toMatch(/yellow spots/);
    expect(result.case.preliminaryAssessment.toLowerCase()).not.toMatch(/yellow spots/);
  });

  it("does not invent weather when retrieval fails", async () => {
    const { setWeatherProviderForTests } = await import("@/lib/weather/get-forecast");
    setWeatherProviderForTests({
      name: "mock-failing",
      async getForecast() {
        throw new Error("provider down");
      },
    });
    const result = await runAgronomicCase({
      message:
        "My tomato leaves in Couva are developing small brown spots on the lower leaves.",
      createResponse: async () => ({
        id: "couva-weather-fail",
        output_text: mockJson({
          stage: "assessment",
          preliminaryAssessment:
            "On tomato, separate true leaf spots from even yellowing.",
          likelyCauses: ["Septoria leaf spot", "Early blight"],
        }),
      }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.weatherDebug?.providerResult).toBe("failed");
    expect(result.case.weatherBrief).toBeFalsy();
    const rendered = farmerRenderedAnswer(result.case);
    expect(rendered.toLowerCase()).not.toMatch(/after a wet week|the crop has had a stretch of wet weather/);
  });

  it("asks Jamaica whitefly cases for an underside leaf photo, not a generic affected-leaf image", async () => {
    const result = await runAgronomicCase({
      message: "Whiteflies under my Scotch bonnet leaves in St Elizabeth.",
      skipRegionalTools: true,
      createResponse: async () => ({
        id: "jam-photo",
        output_text: mockJson({
          preliminaryAssessment: "You already found whiteflies.",
          photoRecommended: true,
          nextQuestion:
            "Can you send a close photo of the front of an affected leaf, including any spots?",
          likelyCauses: ["Whiteflies (observed)"],
        }),
      }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.case.nextQuestion).toBe(
      "Send a close photo of the underside of an affected leaf",
    );
  });
});
