import { describe, expect, it } from "vitest";
import type { AgronomicCasePayload } from "./case-schema";
import { isGuidanceStage } from "./case-schema";
import { parseCaseRequestBody, runAgronomicCase } from "./runCase";
import { WHITEFLY_QUICK_SEQUENCE } from "./tomato-protocol";

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
    preliminaryAssessment: "Farmer reported a crop problem.",
    severity: "unknown",
    nextQuestion: "Are they affecting a few plants, patches, or most of the field?",
    quickReplies: [
      "Few plants",
      "Patches",
      "Most of field",
      "Not sure",
      "Upload a photo",
      "Start full crop check",
    ],
    checksToday: [],
    safeActionsNow: [],
    actionsToAvoid: [],
    photoRecommended: true,
    escalationRecommended: false,
    internalMissingInformation: ["variety", "district", "acreage"],
    ...overrides,
  };
}

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
});

describe("Quick Help acceptance transcripts", () => {
  it("Tomato whiteflies — preferred sequence, ≤3 questions, no re-ask of crop", async () => {
    const scripted = [
      mockCase({
        preliminaryAssessment: "Tomato whiteflies reported by farmer.",
        nextQuestion: WHITEFLY_QUICK_SEQUENCE[0],
        internalMissingInformation: ["distribution", "leaf symptoms"],
      }),
      mockCase({
        preliminaryAssessment:
          "Tomato whiteflies across most of the field.",
        nextQuestion: WHITEFLY_QUICK_SEQUENCE[1],
        stage: "questioning",
      }),
      mockCase({
        stage: "assessment",
        preliminaryAssessment:
          "Preliminary guidance: whitefly pressure looks significant. Confirm sticky leaves and recent sprays. This is preliminary only.",
        severity: "high",
        nextQuestion: "Can you upload a clear photo of the underside of a leaf?",
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

    for (let i = 0; i < farmerTurns.length; i += 1) {
      const result = await runAgronomicCase({
        message: farmerTurns[i],
        history,
        previousResponseId: previousId,
        mode: "quick_help",
        createResponse: async (params) => {
          expect(String(params.instructions)).toMatch(/quick_help/i);
          expect(String(params.instructions)).toMatch(/tomato/i);
          expect(String(params.instructions)).toMatch(/whiteflies/i);
          // Must not instruct to collect country first.
          expect(String(params.instructions)).toMatch(
            /do NOT ask first unless location/i,
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

      // Never show a long questionnaire — internal missing stays internal.
      expect(result.case.internalMissingInformation).toBeDefined();

      if (result.case.stage === "intake" || result.case.stage === "questioning") {
        questionsAsked += 1;
        expect(result.case.nextQuestion.includes("?")).toBe(true);
        expect(result.case.nextQuestion.toLowerCase()).not.toMatch(
          /what crop|which crop/,
        );
        expect(result.case.nextQuestion.toLowerCase()).not.toMatch(
          /country|district/,
        );
        expect(result.case.quickReplies.length).toBeGreaterThan(0);
      }

      previousId = result.responseId;
      history.push({ role: "user", content: farmerTurns[i] });
      history.push({
        role: "assistant",
        content: `Stage: ${result.case.stage}\nNext question: ${result.case.nextQuestion}`,
      });
    }

    expect(questionsAsked).toBeLessThanOrEqual(3);

    const last = history.length;
    expect(last).toBeGreaterThan(0);

    // Final guidance turn
    const finalAssistant = await runAgronomicCase({
      message: "No sprays this week",
      history,
      previousResponseId: previousId,
      mode: "quick_help",
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
    expect(
      finalAssistant.case.quickReplies.some((item) =>
        /full crop check/i.test(item),
      ),
    ).toBe(true);
  });

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
        expect(result.case.nextQuestion.toLowerCase()).not.toMatch(/pepper/);
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
    const result = await runAgronomicCase({
      message: "Cucumber plants suddenly wilting",
      mode: "quick_help",
      createResponse: async () => ({
        id: "resp_wilt",
        output_text: JSON.stringify(
          mockCase({
            stage: "questioning",
            preliminaryAssessment: "Cucumber sudden wilt reported.",
            nextQuestion:
              "Are they affecting a few plants, patches, or most of the field?",
            severity: "high",
          }),
        ),
      }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.case.nextQuestion.toLowerCase()).not.toMatch(
      /country|district|variety/,
    );

    // After enough answers / forced guidance
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
    // 3 prior assistant questions → force guidance / escalation
    expect(isGuidanceStage(guided.case.stage)).toBe(true);
    expect(guided.case.escalationRecommended).toBe(true);
    expect(guided.case.checksToday.length).toBeGreaterThan(0);
    expect(guided.case.preliminaryAssessment.toLowerCase()).toContain(
      "preliminary",
    );
  });

  it("Tomatoes stunted across whole field — no sand, no premature fertilizer, guidance without full history", async () => {
    const result = await runAgronomicCase({
      message: "Tomatoes are stunted across the whole field",
      history: [
        {
          role: "user",
          content: "Tomatoes are stunted across the whole field",
        },
        {
          role: "assistant",
          content: "Stage: questioning\nNext question: wet soil?",
        },
        { role: "user", content: "Soil stays wet" },
        {
          role: "assistant",
          content: "Stage: questioning\nNext question: roots?",
        },
        { role: "user", content: "Roots look brown" },
        {
          role: "assistant",
          content: "Stage: questioning\nNext question: manure?",
        },
      ],
      mode: "quick_help",
      createResponse: async () => ({
        id: "resp_stunt",
        output_text: JSON.stringify(
          mockCase({
            stage: "questioning",
            nextQuestion: "Which district is the farm in?",
            preliminaryAssessment: "Need more history.",
            safeActionsNow: ["Add sand to improve drainage"],
            internalMissingInformation: [
              "variety",
              "district",
              "acreage",
              "fertilizer history",
            ],
          }),
        ),
      }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(isGuidanceStage(result.case.stage)).toBe(true);
    expect(result.case.safeActionsNow.join(" ").toLowerCase()).not.toMatch(
      /sand|gravel/,
    );
    expect(result.case.safeActionsNow.join(" ").toLowerCase()).not.toMatch(
      /apply fertilizer|fertiliser now/,
    );
    expect(result.case.checksToday.length).toBeGreaterThan(0);
    // Guidance not withheld for missing variety/district/acreage
    expect(result.case.preliminaryAssessment.length).toBeGreaterThan(20);
  });

  it("Start full crop check switches mode", async () => {
    const result = await runAgronomicCase({
      message: "Start full crop check",
      mode: "quick_help",
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
