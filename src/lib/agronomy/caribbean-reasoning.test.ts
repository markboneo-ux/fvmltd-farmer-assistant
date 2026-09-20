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

describe("Couva sweet pepper curling/yellowing case continuity", () => {
  const turn1 =
    "My sweet pepper plants in Couva have some leaves curling and yellowing. It started a few days ago.";
  const turn2 = "I really want to make sure my sweet peppers survive.";
  const lesionLeak =
    /cercospora|frogeye|bacterial leaf spot|pale[- ]centr|greasy|water-?soaked specks?|fungal vs bacterial|if a spray is needed/i;

  function rendered(result: Awaited<ReturnType<typeof runAgronomicCase>>): string {
    if (!result.ok) return "";
    return farmerRenderedAnswer(result.case);
  }

  function assertEvidenceSupportedState(
    result: Awaited<ReturnType<typeof runAgronomicCase>>,
    options?: { hasPhotos?: boolean },
  ) {
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const state = result.case.cropHealthState;
    expect(state).toBeTruthy();
    expect(state?.observedSymptoms.join(" ")).toMatch(/curl|yellow/i);
    expect(state?.observedSymptoms.join(" ").toLowerCase()).not.toMatch(/\b(spots?|lesions?|leaf_spot)\b/);
    expect(state?.notReportedSymptoms).toEqual(expect.arrayContaining(["spots"]));
    const causeBlob = [
      ...(state?.suspectedCauses ?? []).map((cause) => cause.label),
      state?.suspectedCause,
      state?.suspectedDiseaseOrDisorder,
      ...(result.case.likelyCauses ?? []),
      ...(result.case.rankedCauses ?? []).map((cause) => cause.label),
    ]
      .join(" ")
      .toLowerCase();
    expect(causeBlob).not.toMatch(/cercospora|frogeye|bacterial leaf spot/);
    expect(causeBlob).not.toMatch(/\bleaf[- ]spot\b/);
    for (const cause of state?.suspectedCauses ?? []) {
      expect(cause.evidenceSource).toMatch(
        /farmer_report|photo_finding|weather_support|prior_confirmed_case_fact/,
      );
      expect(cause.evidenceFact?.length).toBeGreaterThan(0);
    }
    const text = rendered(result).toLowerCase();
    expect(text).not.toMatch(lesionLeak);
    expect(text).not.toMatch(/if they are visible/);
    expect((text.match(/if a spray is needed/g) ?? []).length).toBe(0);
    expect(result.case.sprayGuidanceText).toBeFalsy();
    expect(text).not.toMatch(/remove yellowing leaves|remove affected (leaves|plants)|pick off|strip .{0,30}leaves/);
    expect((result.case.nextQuestion.match(/\?/g) ?? []).length).toBe(1);
    if (options?.hasPhotos) {
      const findings = (state?.photoFindings ?? []).join(" ").toLowerCase();
      expect(findings).not.toMatch(/if they are visible/);
      expect(text).toMatch(/the photo|visible |cannot determine/);
    }
    expect(result.causeDebug?.causes.length).toBeGreaterThan(0);
    expect(result.causeDebug?.lesionEvidence).toBe(false);
  }

  it("keeps only evidence-supported causes across the three Couva turns", async () => {
    const first = await runAgronomicCase({
      message: turn1,
      skipRegionalTools: true,
      createResponse: async () => ({
        id: "couva-pepper-1",
        output_text: mockJson({
          preliminaryAssessment:
            "If a spray is needed I need a closer look at the spots — pale centre versus greasy water-soaked. Waterlogging is the main cause.",
          sprayGuidanceText:
            "If a spray is needed\nI need a closer look at the spots — pale centre versus greasy water-soaked.",
          likelyCauses: ["Waterlogging", "Cercospora / frogeye leaf spot", "Bacterial leaf spot"],
          nextQuestion: "Just to confirm, are you farming in Trinidad and Tobago?",
          diagnosisConfidence: "possible",
        }),
      }),
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    assertEvidenceSupportedState(first);
    expect(first.case.cropHealthState?.crop).toMatch(/pepper/);
    expect(first.case.cropHealthState?.farmingArea?.toLowerCase()).toBe("couva");
    expect(first.case.cropHealthState?.country).toBe("Trinidad and Tobago");
    const firstText = rendered(first).toLowerCase();
    expect(firstText).not.toMatch(/just to confirm, are you farming in trinidad/);
    expect(first.case.likelyCauses?.join(" ").toLowerCase()).not.toMatch(/waterlog/);
    expect(first.case.likelyCauses?.join(" ").toLowerCase()).toMatch(/aphid|nutrient/);
    expect(first.causeDebug?.rawModelCauses.join(" ").toLowerCase()).toMatch(/cercospora|bacterial leaf spot/);
    expect(first.causeDebug?.admittedCauses.join(" ").toLowerCase()).not.toMatch(/cercospora|bacterial leaf spot/);
    expect(first.case.nextQuestion.toLowerCase()).toMatch(/underside|insect|mite|older lower leaves|newest curled/);

    const second = await runAgronomicCase({
      message: turn2,
      history: [
        { role: "user", content: turn1 },
        { role: "assistant", content: rendered(first) },
      ],
      activeCase: {
        crop: "pepper",
        conversationIntent: "crop_problem",
        farmerProblemText: turn1,
        country: "Trinidad and Tobago",
        district: "Couva",
        cropHealthState: first.case.cropHealthState,
      },
      skipRegionalTools: true,
      createResponse: async () => ({
        id: "couva-pepper-2",
        output_text: mockJson({
          preliminaryAssessment:
            "To keep sweet peppers healthy, water regularly, feed with a balanced fertilizer, and prune for airflow.",
          likelyCauses: [],
          nextQuestion: "Are you growing them in pots or in the ground?",
        }),
      }),
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    assertEvidenceSupportedState(second);
    expect(second.case.cropHealthState?.crop).toMatch(/pepper/);
    expect(second.case.agronomicMode).not.toBe("GENERAL_CROP_MANAGEMENT");
    const secondText = rendered(second).toLowerCase();
    expect(secondText).toMatch(/curl|yellow/);
    expect(secondText).not.toMatch(/water regularly, feed with a balanced fertilizer/);
    expect(secondText).toMatch(/do not add extra fertilizer yet/);
    expect(second.case.likelyCauses?.join(" ").toLowerCase()).toMatch(/aphid|nutrient/);
    expect(second.case.nextQuestion.toLowerCase()).toMatch(/underside|insect|mite|older lower leaves|newest curled/);
    expect(second.case.cropHealthState?.farmerIntent).toBe("reassurance_same_case");

    const third = await runAgronomicCase({
      message: "Here is a photo of the leaves.",
      images: [{ mimeType: "image/jpeg", base64: "aaaa", fileName: "leaf.jpg" }],
      history: [
        { role: "user", content: turn1 },
        { role: "assistant", content: rendered(first) },
        { role: "user", content: turn2 },
        { role: "assistant", content: rendered(second) },
      ],
      activeCase: {
        crop: "pepper",
        conversationIntent: "crop_problem",
        farmerProblemText: turn1,
        country: "Trinidad and Tobago",
        district: "Couva",
        cropHealthState: {
          ...second.case.cropHealthState!,
          photoFindings: ["cupped new leaves", "uneven yellowing", "no discrete spots visible"],
          suspectedCauses: second.case.cropHealthState?.suspectedCauses ?? [],
        },
      },
      skipRegionalTools: true,
      createResponse: async () => ({
        id: "couva-pepper-3",
        output_text: mockJson({
          preliminaryAssessment:
            "The photo makes Cercospora / frogeye leaf spot more likely because it shows cupping, uneven yellowing, or insects if they are visible. If a spray is needed, separate fungal vs bacterial spots. Pale-centred spots raise Cercospora; greasy water-soaked specks raise bacterial leaf spot.",
          sprayGuidanceText:
            "If a spray is needed\nIF THE SPOTS FIT A FUNGAL LEAF SPOT\nMancozeb. IF THE SPOTS FIT A BACTERIAL LEAF SPOT\nCopper.",
          likelyCauses: ["Cercospora / frogeye leaf spot", "Bacterial leaf spot"],
          safeActionsNow: [
            "Remove yellowing leaves",
            "Ensure balanced fertilization",
            "Remove affected plants because this may be a virus",
          ],
          diagnosisConfidence: "possible",
          nextQuestion:
            "Are insects present under the curled new leaves? Is yellowing worse on old leaves or new growth?",
        }),
      }),
    });
    expect(third.ok).toBe(true);
    if (!third.ok) return;
    assertEvidenceSupportedState(third, { hasPhotos: true });
    const thirdText = rendered(third).toLowerCase();
    expect(third.case.cropHealthState?.crop).toMatch(/pepper/);
    expect(thirdText).not.toMatch(/do not remove whole plants|remove whole plants unless/);
    expect(thirdText).toMatch(/do not add extra fertilizer yet/);
    expect(third.case.nextQuestion.toLowerCase()).toMatch(
      /underside of the curled new leaves|newest curled leaves or the older lower leaves/,
    );
    expect(third.case.likelyCauses?.join(" ").toLowerCase()).toMatch(/aphid|nutrient/);
    expect(third.case.likelyCauses?.join(" ").toLowerCase()).not.toMatch(/cercospora|waterlog|bacterial leaf spot/);
  });
});

describe("Couva 3-turn farmer-visible payload (ChatAssistantMessage contract)", () => {
  const turn1 =
    "My sweet pepper plants in Couva have some leaves curling and yellowing. It started a few days ago.";
  const turn2 = "I really want to make sure my sweet peppers survive.";
  const forbiddenVisible =
    /cercospora|bacterial leaf spot|fungal leaf spot|pale[- ]centr|water-?soaked|greasy specks?|mancozeb|chlorothalonil|copper spray classes|if a spray is needed|remove whole plants|destroy (the )?plants|plant removal/i;

  it("renders only admittedCauses after an uncertain photo, with no lesion or spray language", async () => {
    const first = await runAgronomicCase({
      message: turn1,
      skipRegionalTools: true,
      createResponse: async () => ({
        id: "couva-visible-1",
        output_text: mockJson({
          preliminaryAssessment:
            "If a spray is needed I need a closer look at the spots — pale centre versus greasy water-soaked.",
          sprayGuidanceText:
            "If a spray is needed\nIF THE SPOTS FIT A FUNGAL LEAF SPOT\nMancozeb. IF THE SPOTS FIT A BACTERIAL LEAF SPOT\nCopper.",
          likelyCauses: ["Cercospora / frogeye leaf spot", "Bacterial leaf spot"],
          diagnosisWhy: "Cercospora / frogeye leaf spot versus bacterial leaf spot.",
          whatWouldChangeDiagnosis: ["Pale-centred spots would raise Cercospora"],
          nextQuestion: "Just to confirm, are you farming in Trinidad and Tobago?",
        }),
      }),
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = await runAgronomicCase({
      message: turn2,
      history: [
        { role: "user", content: turn1 },
        { role: "assistant", content: farmerRenderedAnswer(first.case) },
      ],
      activeCase: {
        crop: "pepper",
        conversationIntent: "crop_problem",
        farmerProblemText: turn1,
        country: "Trinidad and Tobago",
        district: "Couva",
        cropHealthState: first.case.cropHealthState,
      },
      skipRegionalTools: true,
      createResponse: async () => ({
        id: "couva-visible-2",
        output_text: mockJson({
          preliminaryAssessment: "To keep sweet peppers healthy, water regularly.",
          likelyCauses: [],
          nextQuestion: "Are you growing them in pots or in the ground?",
        }),
      }),
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    const third = await runAgronomicCase({
      message: "Here is a photo of the leaves.",
      images: [{ mimeType: "image/jpeg", base64: "aaaa", fileName: "leaf.jpg" }],
      history: [
        { role: "user", content: turn1 },
        { role: "assistant", content: farmerRenderedAnswer(first.case) },
        { role: "user", content: turn2 },
        { role: "assistant", content: farmerRenderedAnswer(second.case) },
      ],
      activeCase: {
        crop: "pepper",
        conversationIntent: "crop_problem",
        farmerProblemText: turn1,
        country: "Trinidad and Tobago",
        district: "Couva",
        cropHealthState: {
          ...second.case.cropHealthState!,
          photoFindings: [],
        },
      },
      skipRegionalTools: true,
      createResponse: async () => ({
        id: "couva-visible-3",
        output_text: mockJson({
          preliminaryAssessment:
            "The photo makes Cercospora / frogeye leaf spot more likely. If a spray is needed, separate fungal vs bacterial spots. Pale-centred spots raise Cercospora; greasy water-soaked specks raise bacterial leaf spot.",
          sprayGuidanceText:
            "If a spray is needed\nIF THE SPOTS FIT A FUNGAL LEAF SPOT\nMancozeb. IF THE SPOTS FIT A BACTERIAL LEAF SPOT\nCopper.",
          likelyCauses: ["Cercospora / frogeye leaf spot", "Bacterial leaf spot"],
          rankedCauses: [
            {
              category: "fungal disease",
              label: "Cercospora / frogeye leaf spot",
              rank: 1,
              why: "pale-centred spots",
              increasesIf: "pale-centred spots",
              decreasesIf: "no spots",
            },
          ],
          safeActionsNow: [
            "Remove affected plants because this may be a virus",
          ],
          actionsToAvoid: ["Do not remove whole plants unless the virus is confirmed."],
          whatWouldChangeDiagnosis: [
            "Pale-centred spots would raise Cercospora",
            "Greasy specks would raise bacterial leaf spot",
          ],
          diagnosisWhy:
            "Cercospora / frogeye leaf spot and bacterial leaf spot. Pale-centred versus water-soaked greasy specks.",
          nextQuestion:
            "Are insects present under the curled new leaves? Is yellowing worse on old leaves or new growth?",
        }),
      }),
    });
    expect(third.ok).toBe(true);
    if (!third.ok) return;

    const visible = farmerRenderedAnswer(third.case);
    expect(visible.toLowerCase()).toMatch(/curl|yellow/);
    expect(third.case.nextQuestion.toLowerCase()).toMatch(
      /underside|insect|mite|older lower leaves|newest curled/,
    );
    expect((third.case.nextQuestion.match(/\?/g) ?? []).length).toBe(1);
    expect(visible).not.toMatch(forbiddenVisible);
    expect(visible.toLowerCase()).not.toMatch(/mancozeb|chlorothalonil|copper-based/);
    expect(visible).toMatch(/cannot determine whether lesions, insects, or a nutrient pattern are present/i);

    expect(third.case.rawModelCauses?.join(" ").toLowerCase()).toMatch(/cercospora|bacterial leaf spot/);
    expect((third.case.admittedCauses ?? []).map((cause) => cause.label).join(" ").toLowerCase()).not.toMatch(
      /cercospora|bacterial leaf spot|fungal leaf spot/,
    );
    expect((third.case.admittedCauses ?? []).map((cause) => cause.label).join(" ").toLowerCase()).toMatch(
      /aphid|sucking|nutrient/,
    );
    expect(third.causeDebug?.rawModelCauses.join(" ").toLowerCase()).toMatch(/cercospora/);
    expect(third.causeDebug?.admittedCauses.join(" ").toLowerCase()).not.toMatch(/cercospora/);
    expect(third.case.sprayGuidanceText).toBeFalsy();
    expect(third.case.admittedCauses?.some((cause) => /cercospora|bacterial leaf spot/i.test(cause.label))).toBe(
      false,
    );
  });
});

describe("Couva first-turn live-shaped schema (weather on, no likelyCauses)", () => {
  const turn1 =
    "My sweet pepper plants in Couva have some leaves curling and yellowing. It started a few days ago.";
  const forbiddenVisible =
    /cercospora|frogeye|bacterial leaf spot|fungal leaf spot|pale[- ]centr|greasy|water[\s-]?soaked|mancozeb|chlorothalonil|copper spray classes|if a spray is needed/i;

  function allVisible(result: Awaited<ReturnType<typeof runAgronomicCase>>): string {
    if (!result.ok) return "";
    const payload = result.case;
    return [
      farmerRenderedAnswer(payload),
      payload.preliminaryAssessment,
      payload.diagnosisWhy,
      ...(payload.checksToday ?? []),
      ...(payload.safeActionsNow ?? []),
      ...(payload.actionsToAvoid ?? []),
      ...(payload.whatWouldChangeDiagnosis ?? []),
      payload.monitorNext,
      payload.nextQuestion,
      payload.sprayGuidanceText,
      payload.weatherBrief,
      ...(payload.weatherRisks ?? []).map((risk) => `${risk.diseaseOrPest} ${risk.recommendedChecks.join(" ")} ${risk.preventiveActions.join(" ")}`),
      ...(payload.admittedCauses ?? []).map(
        (cause) => `${cause.label} ${cause.why} ${cause.increasesIf} ${cause.decreasesIf}`,
      ),
    ]
      .filter(Boolean)
      .join("\n");
  }

  it("does not leak lesion or spray language from schema-only first-turn model JSON", async () => {
    const first = await runAgronomicCase({
      message: turn1,
      createResponse: async () => ({
        id: "couva-first-turn-live",
        output_text: mockJson({
          stage: "assessment",
          preliminaryAssessment: [
            "WHAT I THINK IS MOST LIKELY",
            "Cercospora / frogeye leaf spot, with bacterial leaf spot also possible.",
            "WHY",
            "Pale-centred spots versus greasy water-soaked lesions.",
            "OTHER POSSIBILITIES",
            "A fungal leaf spot versus bacterial leaf spot.",
            "CHECK THIS NOW",
            "Are spots round with a pale centre, or greasy and water-soaked?",
            "WHAT TO DO TODAY",
            "Scout before you spray.",
            "IF A SPRAY IS NEEDED",
            "Mancozeb- or chlorothalonil-class protectants for a fungal leaf spot, or copper spray classes for bacterial leaf spot. Separate fungal vs bacterial sprays.",
          ].join("\n"),
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
          nextQuestion: "Are the spots round with a pale centre, or greasy and water-soaked?",
        }),
      }),
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    expect(first.causeDebug?.extractedSymptoms).toEqual(
      expect.arrayContaining(["leaf curl", "yellowing"]),
    );
    expect(first.causeDebug?.extractedSymptoms?.join(" ").toLowerCase()).not.toMatch(/\bspots?\b/);
    expect(first.causeDebug?.rawModelCauses.join(" ").toLowerCase()).toMatch(
      /cercospora|bacterial leaf spot/,
    );
    expect(first.causeDebug?.playbookSelectedCauses?.join(" ").toLowerCase()).toMatch(/aphid|nutrient/);
    expect(first.causeDebug?.playbookSelectedCauses?.join(" ").toLowerCase()).not.toMatch(
      /cercospora|bacterial leaf spot/,
    );
    expect(first.causeDebug?.preGateRankedCauses?.join(" ").toLowerCase()).not.toMatch(
      /cercospora|bacterial leaf spot/,
    );
    expect(first.causeDebug?.admittedCauses.join(" ").toLowerCase()).toMatch(/aphid|nutrient/);
    expect(first.causeDebug?.admittedCauses.join(" ").toLowerCase()).not.toMatch(
      /cercospora|bacterial leaf spot/,
    );
    expect(first.causeDebug?.sprayIntent).toBe(false);
    expect(first.causeDebug?.pesticideTarget).toBe(false);
    expect(first.causeDebug?.finalVisibleCauses?.join(" ").toLowerCase()).toMatch(/aphid|nutrient/);
    expect(first.causeDebug?.finalVisibleCauses?.join(" ").toLowerCase()).not.toMatch(
      /cercospora|bacterial leaf spot/,
    );

    expect(first.case.cropHealthState?.crop).toMatch(/pepper/);
    expect(first.case.cropHealthState?.farmingArea?.toLowerCase()).toBe("couva");
    expect(first.case.sprayGuidanceText).toBeFalsy();
    expect(first.case.cropHealthState?.observedSymptoms.join(" ").toLowerCase()).not.toMatch(
      /\b(spots?|lesions?)\b/,
    );

    const visible = allVisible(first);
    expect(visible).not.toMatch(forbiddenVisible);
    expect(visible.toLowerCase()).toMatch(/curl|yellow/);
    expect(first.case.nextQuestion.toLowerCase()).toMatch(
      /underside|insect|mite|older lower leaves|newest curled/,
    );
  });
});
