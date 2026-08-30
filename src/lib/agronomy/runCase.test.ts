import { beforeEach, describe, expect, it } from "vitest";
import type { AgronomicCasePayload } from "./case-schema";
import { emptyRegionalContext, isGuidanceStage } from "./case-schema";
import { parseCaseRequestBody, runAgronomicCase } from "./runCase";
import { WHITEFLY_QUICK_SEQUENCE } from "./tomato-protocol";
import { setWeatherProviderForTests } from "@/lib/weather/get-forecast";
import { buildMockHumidRainyForecast } from "@/lib/weather/get-forecast";
import { resetCatalogueStoreToSeed } from "@/lib/regional-inputs/catalogue";
import { resetMemoryStoreForTests } from "@/lib/agronomy-memory/store";

export const TEST_PROMPTS = [
  "Tomato whiteflies",
  "My pepper leaves have holes",
  "Cucumber plants suddenly wilting",
  "Tomatoes are stunted across the whole field",
] as const;

function mockCase(
  overrides: Partial<AgronomicCasePayload> = {},
): AgronomicCasePayload {
  return {
    mode: "quick_help",
    stage: "questioning",
    questionId: "q_1_field_distribution",
    questionType: "field_distribution",
    preliminaryAssessment: "Farmer reported a crop problem.",
    severity: "unknown",
    nextQuestion: "Are they affecting a few plants, patches, or most of the field?",
    quickReplies: [
      "Few plants",
      "Patches",
      "Most of field",
      "Not sure",
    ],
    checksToday: [],
    safeActionsNow: [],
    actionsToAvoid: [],
    photoRecommended: true,
    escalationRecommended: false,
    regionalContext: emptyRegionalContext(),
    weatherRisks: [],
    verifiedInputOptions: [],
    internalMissingInformation: ["variety", "district", "acreage"],
    ...overrides,
  };
}

beforeEach(() => {
  resetMemoryStoreForTests();
  resetCatalogueStoreToSeed();
  setWeatherProviderForTests({
    name: "mock-humid-rainy",
    async getForecast(location) {
      return buildMockHumidRainyForecast(location);
    },
  });
});

describe("parseCaseRequestBody", () => {
  it("defaults mode to quick_help", () => {
    const parsed = parseCaseRequestBody({ message: "Tomato whiteflies" });
    expect(parsed.mode).toBe("quick_help");
  });

  it("reads explicit full_crop_check mode", () => {
    const parsed = parseCaseRequestBody({
      message: "Continue",
      mode: "full_crop_check",
    });
    expect(parsed.mode).toBe("full_crop_check");
  });

  it("parses profile country and images", () => {
    const parsed = parseCaseRequestBody({
      message: "Tomato whiteflies",
      profile: { country: "Trinidad and Tobago", district: "Arima" },
      images: [
        {
          mimeType: "image/jpeg",
          base64: "abc123",
          fileName: "leaf.jpg",
        },
      ],
    });
    expect(parsed.profile.country).toBe("Trinidad and Tobago");
    expect(parsed.images).toHaveLength(1);
  });
});

describe("TEST 1 — Conversation UX transcripts", () => {
  it("Tomato whiteflies — no long missing list, distribution first, ≤3 questions", async () => {
    const scripted = [
      mockCase({
        preliminaryAssessment: "Tomato whiteflies reported by farmer.",
        nextQuestion: WHITEFLY_QUICK_SEQUENCE[0],
        questionType: "field_distribution",
        questionId: "q_1_field_distribution",
        internalMissingInformation: ["distribution", "leaf symptoms", "variety", "acreage"],
      }),
      mockCase({
        preliminaryAssessment: "Tomato whiteflies across most of the field.",
        nextQuestion: WHITEFLY_QUICK_SEQUENCE[1],
        stage: "questioning",
        questionType: "open",
        questionId: "q_2_open",
      }),
      mockCase({
        stage: "assessment",
        preliminaryAssessment:
          "Preliminary guidance: whitefly pressure looks significant. Confirm sticky leaves and recent sprays. This is preliminary only.",
        severity: "high",
        nextQuestion: "Can you upload a clear photo of the underside of a leaf?",
        questionType: "photo_request",
        questionId: "q_3_photo_request",
        checksToday: [
          "Turn leaves over for tiny white insects",
          "Check for sticky residue or black mould",
        ],
        safeActionsNow: [
          "Scout early morning",
          "Avoid repeating the same spray blindly",
        ],
        actionsToAvoid: ["Do not mix insecticides into unapproved cocktails"],
        photoRecommended: true,
        escalationRecommended: true,
        quickReplies: ["Upload a photo", "Start full crop check"],
      }),
    ];

    const history: { role: "user" | "assistant"; content: string }[] = [];
    let previousId: string | null = null;
    let questionsAsked = 0;
    const farmerTurns = [
      "Tomato whiteflies",
      "Most of field",
      "Sticky leaves and tiny insects underneath",
    ];

    const transcript: string[] = [];

    for (let i = 0; i < farmerTurns.length; i += 1) {
      transcript.push(`Farmer: ${farmerTurns[i]}`);
      const result = await runAgronomicCase({
        message: farmerTurns[i],
        history,
        previousResponseId: previousId,
        mode: "quick_help",
        profile: { country: "Trinidad and Tobago" },
        skipRegionalTools: i < 2,
        createResponse: async (params) => {
          expect(String(params.instructions)).toMatch(/quick_help/i);
          expect(String(params.instructions)).toMatch(/tomato/i);
          expect(String(params.instructions)).toMatch(/whiteflies/i);
          expect(String(params.instructions)).toMatch(
            /do NOT ask first/i,
          );
          return {
            id: `resp_whitefly_${i + 1}`,
            model: "gpt-4o",
            output_text: JSON.stringify(scripted[i]),
          };
        },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Never expose a long missing-information questionnaire to farmers via stage content.
      expect(result.case.internalMissingInformation).toBeDefined();
      expect(result.case.preliminaryAssessment).not.toMatch(/variety.*district.*acreage/i);

      if (result.case.stage === "intake" || result.case.stage === "questioning") {
        questionsAsked += 1;
        expect(result.case.nextQuestion.includes("?")).toBe(true);
        expect(result.case.nextQuestion.toLowerCase()).not.toMatch(
          /what crop|which crop/,
        );
        expect(result.case.nextQuestion.toLowerCase()).not.toMatch(
          /country|district/,
        );
        expect(result.case.questionId).toBeTruthy();
        expect(result.case.questionType).toBeTruthy();
      }

      transcript.push(
        `Assistant: [${result.case.stage}] ${result.case.nextQuestion || result.case.preliminaryAssessment}`,
      );
      transcript.push(
        `Quick replies: ${result.case.quickReplies.join(" | ") || "(none)"}`,
      );

      previousId = result.responseId;
      history.push({ role: "user", content: farmerTurns[i] });
      history.push({
        role: "assistant",
        content: `Stage: ${result.case.stage}\nNext question: ${result.case.nextQuestion}`,
      });
    }

    expect(questionsAsked).toBeLessThanOrEqual(3);

    // First question concerns distribution/severity.
    expect(transcript[1].toLowerCase()).toMatch(/few plants|patches|most of the field|distribution|widespread|how many/);

    const finalAssistant = await runAgronomicCase({
      message: "No sprays this week",
      history,
      previousResponseId: previousId,
      mode: "quick_help",
      profile: { country: "Trinidad and Tobago" },
      createResponse: async () => ({
        id: "resp_whitefly_final",
        model: "gpt-4o",
        output_text: JSON.stringify(scripted[2]),
      }),
    });

    expect(finalAssistant.ok).toBe(true);
    if (!finalAssistant.ok) return;
    expect(isGuidanceStage(finalAssistant.case.stage)).toBe(true);
    expect(finalAssistant.case.preliminaryAssessment.toLowerCase()).toContain(
      "preliminary",
    );
    expect(finalAssistant.case.checksToday.length).toBeGreaterThan(0);
    expect(finalAssistant.case.regionalContext.country).toMatch(/trinidad/i);
    // Generic spray-history follow-up must not attach weather or product cards.
    expect(finalAssistant.case.weatherRisks).toEqual([]);
    expect(finalAssistant.case.verifiedInputOptions).toEqual([]);

    // Exact transcript for delivery summary.
    console.log("TEST 1 TRANSCRIPT\n" + transcript.join("\n"));
  });
});

describe("TEST 2 — Button correctness", () => {
  it("soil question returns only soil buttons", async () => {
    const result = await runAgronomicCase({
      message: "Loam",
      history: [
        { role: "user", content: "Tomato whiteflies" },
        {
          role: "assistant",
          content: "Stage: questioning\nNext question: distribution?",
        },
      ],
      mode: "full_crop_check",
      skipRegionalTools: true,
      createResponse: async () => ({
        id: "resp_soil",
        output_text: JSON.stringify(
          mockCase({
            mode: "full_crop_check",
            nextQuestion: "What soil type are the plants growing in?",
            quickReplies: ["Few plants", "Patches", "Most of field"],
          }),
        ),
      }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.case.questionType).toBe("soil_type");
    expect(result.case.quickReplies).toEqual([
      "Clay",
      "Loam",
      "Sandy",
      "Raised-bed mix",
      "Soilless medium",
      "Not sure",
    ]);
    expect(result.case.quickReplies).not.toContain("Few plants");
  });
});

describe("TEST 3 — Photo payload wiring", () => {
  it("includes images in the OpenAI request content", async () => {
    let captured: Record<string, unknown> = {};

    const result = await runAgronomicCase({
      message: "Tomato leaf problem",
      images: [
        {
          mimeType: "image/jpeg",
          base64: "dGVzdGltYWdl",
          fileName: "tomato-leaf.jpg",
        },
      ],
      skipRegionalTools: true,
      createResponse: async (params) => {
        captured = params;
        return {
          id: "resp_photo",
          output_text: JSON.stringify(
            mockCase({
              stage: "assessment",
              preliminaryAssessment:
                "Preliminary guidance: the leaf image is too distant for a reliable assessment. Please photograph the underside of an affected leaf closer.",
              nextQuestion:
                "Can you upload a closer photo of the underside of a leaf?",
              photoRecommended: true,
              escalationRecommended: true,
              checksToday: ["Photograph the leaf underside"],
              safeActionsNow: ["Hold sprays until a clearer photo is available"],
              actionsToAvoid: ["Do not mix pesticides into unapproved cocktails"],
            }),
          ),
        };
      },
    });

    expect(result.ok).toBe(true);
    expect(Object.keys(captured).length).toBeGreaterThan(0);
    const input = captured.input as Array<{ content: unknown }>;
    const last = input[input.length - 1];
    expect(Array.isArray(last.content)).toBe(true);
    const parts = last.content as Array<Record<string, unknown>>;
    expect(parts.some((part) => part.type === "input_image")).toBe(true);
    expect(String(captured.instructions)).toMatch(/blurry|underside|insufficient/i);
  });
});

describe("TEST 4 — Regional input verification via case route tools", () => {
  it("attaches verified Trinidad options and refuses invention", async () => {
    const result = await runAgronomicCase({
      message: "Ask about products for tomato whiteflies in Trinidad",
      mode: "quick_help",
      profile: { country: "Trinidad and Tobago" },
      createResponse: async () => ({
        id: "resp_products",
        output_text: JSON.stringify(
          mockCase({
            stage: "assessment",
            preliminaryAssessment:
              "Preliminary guidance: whiteflies reported. Product options must come from the verified catalogue.",
            nextQuestion: "",
            checksToday: ["Scout underside of leaves"],
            safeActionsNow: ["Use cultural and monitoring steps first"],
            actionsToAvoid: [
              "Do not mix pesticides into unapproved cocktails",
            ],
          }),
        ),
      }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.case.verifiedInputOptions.length).toBeGreaterThan(0);
    for (const option of result.case.verifiedInputOptions) {
      expect(option.registrationStatus).toBeTruthy();
      expect(option.availabilityStatus).toBeTruthy();
      expect(option.lastVerifiedAt || option.officialSource).toBeTruthy();
    }
  });
});

describe("TEST 4b — Tools stay off for generic chat", () => {
  it("does not attach weather or products for Tomatoes stunted", async () => {
    const result = await runAgronomicCase({
      message: "Tomatoes stunted",
      mode: "quick_help",
      profile: { country: "Trinidad and Tobago" },
      createResponse: async () => ({
        id: "resp_stunted",
        output_text: JSON.stringify(
          mockCase({
            stage: "assessment",
            preliminaryAssessment:
              "Stunting can come from root stress, waterlogging, nutrition, nematodes, disease or chemical injury.",
            nextQuestion:
              "Is it affecting the whole field, patches, or individual plants?",
            checksToday: ["Compare patches with healthier plants"],
            safeActionsNow: ["Check whether soil is waterlogged or bone dry"],
          }),
        ),
      }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.case.weatherRisks).toEqual([]);
    expect(result.case.verifiedInputOptions).toEqual([]);
  });
});

describe("TEST 5 — Weather risk via case route tools", () => {
  it("attaches weather-linked risk without false diagnosis", async () => {
    const result = await runAgronomicCase({
      message: "Tomato leaf spots after heavy rain",
      mode: "quick_help",
      profile: { country: "Trinidad and Tobago", district: "Chaguanas" },
      createResponse: async () => ({
        id: "resp_weather",
        output_text: JSON.stringify(
          mockCase({
            stage: "assessment",
            preliminaryAssessment:
              "Preliminary guidance: foliar symptoms after rain need field confirmation. This is not a confirmed diagnosis.",
            nextQuestion: "",
            checksToday: ["Inspect lower leaves"],
            safeActionsNow: ["Improve airflow where practical"],
            actionsToAvoid: ["Do not apply fungicide without verifying disease"],
          }),
        ),
      }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.case.weatherRisks.length).toBeGreaterThan(0);
    expect(result.case.weatherRisks[0].riskWindow).toBeTruthy();
    expect(result.case.weatherRisks[0].weatherDrivers.length).toBeGreaterThan(0);
    expect(result.case.weatherRisks[0].disclaimer.toLowerCase()).toMatch(
      /does not prove/,
    );
    expect(result.case.preliminaryAssessment.toLowerCase()).not.toMatch(
      /confirmed diagnosis of late blight/,
    );
  });
});

describe("TEST 6 — No data country", () => {
  it("states local verification failed for Jamaica", async () => {
    const result = await runAgronomicCase({
      message: "Ask about products for tomato whiteflies",
      mode: "quick_help",
      profile: { country: "Jamaica" },
      createResponse: async () => ({
        id: "resp_jm",
        output_text: JSON.stringify(
          mockCase({
            stage: "assessment",
            preliminaryAssessment:
              "Preliminary guidance: whiteflies reported on tomato.",
            nextQuestion: "",
            checksToday: ["Scout leaves"],
            safeActionsNow: ["Monitor and use cultural controls first"],
            actionsToAvoid: ["Do not invent local product brands"],
          }),
        ),
      }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.case.verifiedInputOptions).toEqual([]);
    expect(result.case.preliminaryAssessment).toMatch(
      /could not verify a locally registered and available product/i,
    );
  });
});

describe("TEST 7 — Safety", () => {
  it("strips unsafe tank mixes and vague chemical pushes", async () => {
    const result = await runAgronomicCase({
      message: "Tomato leaves look odd",
      mode: "quick_help",
      skipRegionalTools: true,
      createResponse: async () => ({
        id: "resp_safe",
        output_text: JSON.stringify(
          mockCase({
            stage: "questioning",
            nextQuestion:
              "Are they affecting a few plants, patches, or most of the field?",
            safeActionsNow: [
              "Mix insecticide and fungicide in one cocktail tank mix",
              "Spray a chemical immediately for the vague symptom",
            ],
          }),
        ),
      }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.case.safeActionsNow.join(" ").toLowerCase()).not.toMatch(
      /cocktail|tank mix|spray a chemical/,
    );
    expect(result.case.actionsToAvoid.join(" ").toLowerCase()).toMatch(
      /mix|cocktail|chemical|vague/,
    );
  });
});

describe("legacy acceptance transcripts", () => {
  it("My pepper leaves have holes — ≤3 questions then guidance", async () => {
    let turn = 0;
    const history: { role: "user" | "assistant"; content: string }[] = [];
    let previousId: string | null = null;
    const answers = [
      "My pepper leaves have holes",
      "Patches",
      "Not sure",
      "No sprays",
    ];

    let interviewQuestions = 0;

    for (const answer of answers) {
      const result = await runAgronomicCase({
        message: answer,
        history,
        previousResponseId: previousId,
        mode: "quick_help",
        skipRegionalTools: true,
        createResponse: async () => {
          turn += 1;
          if (turn <= 2) {
            return {
              id: `resp_pepper_${turn}`,
              output_text: JSON.stringify(
                mockCase({
                  preliminaryAssessment:
                    "Pepper leaves with holes. Crop: pepper.",
                  nextQuestion:
                    turn === 1
                      ? "Are they affecting a few plants, patches, or most of the field?"
                      : "Do you see caterpillars, beetles, or only the holes?",
                }),
              ),
            };
          }
          return {
            id: `resp_pepper_${turn}`,
            output_text: JSON.stringify(
              mockCase({
                stage: "assessment",
                severity: "medium",
                preliminaryAssessment:
                  "Preliminary guidance: chewing damage on pepper leaves is common from caterpillars or beetles. Inspect at dusk and check the underside of leaves.",
                nextQuestion: "",
                checksToday: ["Look under leaves for larvae or beetles"],
                safeActionsNow: ["Hand-pick visible caterpillars if few plants"],
                actionsToAvoid: ["Do not mix pesticides into unapproved cocktails"],
                photoRecommended: true,
                quickReplies: ["Upload a photo", "Start full crop check"],
              }),
            ),
          };
        },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      if (result.case.stage === "intake" || result.case.stage === "questioning") {
        interviewQuestions += 1;
      }

      previousId = result.responseId;
      history.push({ role: "user", content: answer });
      history.push({
        role: "assistant",
        content: `Stage: ${result.case.stage}\nNext question: ${result.case.nextQuestion}`,
      });
    }

    expect(interviewQuestions).toBeLessThanOrEqual(3);
  });

  it("Cucumber plants suddenly wilting — escalates with useful triage", async () => {
    const guided = await runAgronomicCase({
      message: "Most of field",
      history: [
        { role: "user", content: "Cucumber plants suddenly wilting" },
        {
          role: "assistant",
          content: "Stage: questioning\nNext question: distribution?",
        },
        { role: "user", content: "Most of field" },
        {
          role: "assistant",
          content: "Stage: questioning\nNext question: recent spray?",
        },
        { role: "user", content: "No spray" },
        {
          role: "assistant",
          content: "Stage: questioning\nNext question: photo?",
        },
      ],
      mode: "quick_help",
      skipRegionalTools: true,
      createResponse: async () => ({
        id: "resp_wilt_guide",
        output_text: JSON.stringify(
          mockCase({
            stage: "questioning",
            nextQuestion: "What variety are these cucumbers?",
            preliminaryAssessment: "Still gathering history.",
            checksToday: [],
            safeActionsNow: [],
          }),
        ),
      }),
    });

    expect(guided.ok).toBe(true);
    if (!guided.ok) return;
    expect(isGuidanceStage(guided.case.stage)).toBe(true);
    expect(guided.case.escalationRecommended).toBe(true);
    expect(guided.case.checksToday.length).toBeGreaterThan(0);
  });

  it("Start full crop check switches mode", async () => {
    const result = await runAgronomicCase({
      message: "Start full crop check",
      mode: "quick_help",
      skipRegionalTools: true,
      createResponse: async (params) => {
        expect(String(params.instructions)).toMatch(/full_crop_check/i);
        return {
          id: "resp_full",
          output_text: JSON.stringify(
            mockCase({
              mode: "full_crop_check",
              stage: "questioning",
              preliminaryAssessment:
                "Starting deeper crop check after Quick Help.",
              nextQuestion: "How old are the plants?",
            }),
          ),
        };
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.case.mode).toBe("full_crop_check");
  });
});
