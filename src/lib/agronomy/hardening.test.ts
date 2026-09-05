import { describe, expect, it } from "vitest";
import {
  countryReliableForLocalFacts,
  extractRegionAndCountry,
  resolveLocationConfidence,
  shouldConfirmCountry,
} from "@/lib/assistant/farmer-context";
import { extractKnownFacts } from "./tomato-protocol";
import { assignDiagnosisConfidence } from "./diagnosis-confidence";
import { evaluateDiagnosisQuality, needsDiagnosisRewrite } from "./response-quality";
import { emptyRegionalContext, type AgronomicCasePayload } from "./case-schema";
import { applyDiagnosticPlaybook, playbookFor } from "./diagnosis";
import { researchTargetsForNeed } from "@/lib/research/trusted-sources";
import { trendClusterKey, sameTrendCountry } from "@/lib/trends/types";
import { trendsMatchFarmerQuery } from "@/lib/trends/engine";
import { extractWorkingCase, highestValueMissingQuestion } from "./working-case";
import { sanitizeUnverifiedPesticideClaims, verifyPesticideForCountry } from "@/lib/research/pesticides";

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

describe("location confidence", () => {
  it("marks a spoken country as explicit", () => {
    const facts = extractKnownFacts("I'm in Trinidad. My celery looks like it is burning from the edges.");
    expect(facts.country).toBe("Trinidad and Tobago");
    expect(facts.locationConfidence).toBe("explicit");
    expect(countryReliableForLocalFacts(facts.locationConfidence)).toBe(true);
  });

  it("marks a region-implied country as inferred, not confirmed", () => {
    const located = extractRegionAndCountry("Berbice celery");
    expect(located.country).toBe("Guyana");
    expect(located.countryFromRegion).toBe(true);
    expect(
      resolveLocationConfidence({
        spokenCountry: located.country,
        countryFromRegion: true,
      }),
    ).toBe("conversation_inferred");
    expect(
      shouldConfirmCountry({
        country: "Guyana",
        confidence: "conversation_inferred",
        asksForProducts: true,
      }),
    ).toBe(true);
  });

  it("treats a registered profile country as confirmed for local facts", () => {
    const facts = extractKnownFacts("My celery is burning up.", {
      country: "Guyana",
      countrySource: "registered",
    });
    expect(facts.locationConfidence).toBe("profile_confirmed");
    expect(countryReliableForLocalFacts(facts.locationConfidence)).toBe(true);
    expect(
      shouldConfirmCountry({
        country: "Guyana",
        confidence: "profile_confirmed",
        asksForProducts: true,
      }),
    ).toBe(false);
  });

  it("does not treat a continuing inferred country as confirmed", () => {
    const facts = extractKnownFacts("What fungicide can I use?", {
      country: "Guyana",
      countrySource: "continuing",
    });
    expect(facts.locationConfidence).toBe("conversation_inferred");
    expect(countryReliableForLocalFacts(facts.locationConfidence)).toBe(false);
    expect(
      shouldConfirmCountry({
        country: "Guyana",
        confidence: facts.locationConfidence,
        asksForProducts: true,
      }),
    ).toBe(true);
  });
});

describe("farmer-level depth for the same celery problem", () => {
  const message = "My celery is burning up.";

  it("changes the actual diagnosis, not just a few words", () => {
    const home = applyDiagnosticPlaybook(payload(), {
      facts: { ...extractKnownFacts(message), farmerLevel: "HOME_GARDENER" },
      farmerLevel: "HOME_GARDENER",
      intent: "crop_problem",
    });
    const small = applyDiagnosticPlaybook(payload(), {
      facts: { ...extractKnownFacts("I farm a small plot of celery that is burning") },
      farmerLevel: "SMALL_FARMER",
      intent: "crop_problem",
    });
    const commercial = applyDiagnosticPlaybook(payload(), {
      facts: { ...extractKnownFacts("I am a commercial farmer with 3 acres of celery burning") },
      farmerLevel: "COMMERCIAL_FARMER",
      intent: "crop_problem",
    });
    const technical = applyDiagnosticPlaybook(payload(), {
      facts: extractKnownFacts(
        "Celery foliar necrosis. Differential for tip burn vs Cercospora. Check EC and FRAC if we spray.",
      ),
      farmerLevel: "TECHNICAL_USER",
      intent: "crop_problem",
    });
    const agronomist = applyDiagnosticPlaybook(payload(), {
      facts: { ...extractKnownFacts(message), farmerLevel: "AGRONOMIST" },
      farmerLevel: "AGRONOMIST",
      intent: "crop_problem",
    });

    expect(playbookFor(extractKnownFacts(message), "HOME_GARDENER")?.id).toBe("celery_burn_home");
    expect(playbookFor(extractKnownFacts(message), "SMALL_FARMER")?.id).toBe("celery_burn_small");
    expect(home.likelyCauses?.join(" ")).not.toEqual(agronomist.likelyCauses?.join(" "));
    expect(home.likelyCauses?.join(" ")).not.toEqual(small.likelyCauses?.join(" "));
    expect(home.preliminaryAssessment.toLowerCase()).not.toMatch(/\bfrac\b|\bepidemiolog|\bqo[il]\b/);
    expect(small.preliminaryAssessment.toLowerCase()).toMatch(/bed|field-management|scout/i);
    expect(small.preliminaryAssessment.toLowerCase()).not.toMatch(/\bfrac\b|\bepidemiolog/);
    expect(commercial.preliminaryAssessment.toLowerCase()).toMatch(/yield|harvest|resistance|production/);
    expect(technical.likelyCauses?.join(" ")).toMatch(/EC|Cercospora|phytotoxicity/i);
    expect(agronomist.preliminaryAssessment).toMatch(/FRAC|epidemiolog|Cercospora apii/i);
    expect(agronomist.checksToday.join(" ")).toMatch(/FRAC|pycnidia|EC/i);
  });
});

describe("diagnosis quality and confidence", () => {
  it("flags a generic thin crop answer", () => {
    const quality = evaluateDiagnosisQuality(
      payload({
        preliminaryAssessment: "It may be a disease. Monitor it.",
        intent: "crop_problem",
      }),
      { intent: "crop_problem" },
    );
    expect(quality.adequate).toBe(false);
    expect(needsDiagnosisRewrite(payload({
      preliminaryAssessment: "Could be heat, watering or nutrients. Check your plants.",
      intent: "crop_problem",
    }), { intent: "crop_problem" })).toBe(true);

    const shaped = applyDiagnosticPlaybook(
      payload({
        preliminaryAssessment: "Could be heat, watering or nutrients. Check your plants.",
        intent: "crop_problem",
      }),
      {
        facts: extractKnownFacts("My celery is burning up."),
        farmerLevel: "SMALL_FARMER",
        intent: "crop_problem",
      },
    );
    expect(evaluateDiagnosisQuality(shaped, {
      intent: "crop_problem",
      facts: extractKnownFacts("My celery is burning up."),
    }).adequate).toBe(true);
    expect(needsDiagnosisRewrite(shaped, {
      intent: "crop_problem",
      facts: extractKnownFacts("My celery is burning up."),
    })).toBe(false);
  });

  it("never confirms from AI or photo inference alone", () => {
    expect(
      assignDiagnosisConfidence({
        claimed: "confirmed",
        photoOnly: true,
        causeCount: 3,
        evidenceCount: 1,
      }),
    ).not.toBe("confirmed");
    expect(
      assignDiagnosisConfidence({
        labResult: true,
      }),
    ).toBe("confirmed");
  });
});

describe("pesticide fallback and trend geography", () => {
  it("does not use Trinidad registration as Guyana proof", () => {
    const targets = researchTargetsForNeed(
      "Guyana",
      "pesticide_registration",
      "pesticide_registration",
    );
    expect(
      targets.some(
        (source) =>
          source.country === "Trinidad and Tobago" &&
          source.category === "pesticide_registration",
      ),
    ).toBe(false);

    const verification = verifyPesticideForCountry({
      country: "Guyana",
      crop: "celery",
      activeIngredient: "azoxystrobin",
    });
    const text = sanitizeUnverifiedPesticideClaims(
      "This is registered in Trinidad, therefore you can use it.",
      verification,
    );
    expect(text.toLowerCase()).not.toMatch(/therefore you can use it/);
    expect(text).toMatch(/haven't verified registration for celery in Guyana/i);
  });

  it("does not merge unknown-country cases into Trinidad trends", () => {
    expect(sameTrendCountry(null, "Trinidad and Tobago")).toBe(false);
    expect(sameTrendCountry(null, "")).toBe(true);
    const unknownKey = trendClusterKey({
      country: null,
      region: null,
      crop: "celery",
      variety: null,
      symptomCluster: "leaf burn",
      suspectedIssue: null,
    });
    const trinidadKey = trendClusterKey({
      country: "Trinidad and Tobago",
      region: null,
      crop: "celery",
      variety: null,
      symptomCluster: "leaf burn",
      suspectedIssue: null,
    });
    expect(unknownKey).not.toBe(trinidadKey);
    expect(
      trendsMatchFarmerQuery(
        {
          crop: "celery",
          region: null,
          country: "Trinidad and Tobago",
          symptomCluster: "leaf burn",
          suspectedIssue: null,
        },
        { crop: "celery", country: null, symptoms: ["leaf burn"] },
      ),
    ).toBe(false);
  });
});

describe("working case follow-up", () => {
  it("asks one high-value missing fact, not a questionnaire", () => {
    const facts = extractKnownFacts("My celery is burning up.");
    const working = extractWorkingCase(facts);
    expect(working.crop).toBe("celery");
    expect(working.country).toBeNull();
    expect(
      highestValueMissingQuestion({
        working,
        diagnostic: true,
      }),
    ).toMatch(/tips|edges|spots/i);
    expect(
      highestValueMissingQuestion({
        working: extractWorkingCase(
          extractKnownFacts("Tomato whiteflies across most of the field"),
        ),
        diagnostic: true,
      }),
    ).not.toMatch(/tips|edges|spots/i);
  });
});
