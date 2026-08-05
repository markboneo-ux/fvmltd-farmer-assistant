import { describe, expect, it } from "vitest";
import type { AgronomicCasePayload } from "./case-schema";
import { parseCaseRequestBody, runAgronomicCase } from "./runCase";
import {
  mentionsPrematureFertilizer,
  mentionsSandOrGravel,
} from "./tomato-protocol";

/** Exact acceptance transcript from the product brief. */
export const ACCEPTANCE_TRANSCRIPT = [
  "My commercial tomato field is stunted in Trinidad.",
  "It affects almost the entire field.",
  "The lower leaves are yellow and new leaves are small.",
  "The soil stays wet for two days after irrigation.",
  "The plants are six weeks old.",
  "I incorporated well-composted manure before planting.",
] as const;

function mockCase(
  overrides: Partial<AgronomicCasePayload> &
    Pick<AgronomicCasePayload, "stage" | "caseSummary" | "nextQuestion">,
): AgronomicCasePayload {
  return {
    missingCriticalInformation: [],
    redFlags: [],
    likelyCauses: [],
    checksToday: [],
    safeActionsNow: [],
    actionsToAvoid: [],
    escalationReason: "",
    ...overrides,
  };
}

describe("parseCaseRequestBody", () => {
  it("reads message, history, and previousResponseId", () => {
    const parsed = parseCaseRequestBody({
      message: "Hello",
      previousResponseId: "resp_123",
      messages: [
        { role: "user", content: "First" },
        { role: "assistant", content: "Second" },
      ],
    });

    expect(parsed.message).toBe("Hello");
    expect(parsed.previousResponseId).toBe("resp_123");
    expect(parsed.history).toHaveLength(2);
  });
});

describe("runAgronomicCase with mocked Responses API", () => {
  it("asks one question at a time during intake", async () => {
    const result = await runAgronomicCase({
      message: ACCEPTANCE_TRANSCRIPT[0],
      createResponse: async (params) => {
        expect(params.store).toBe(true);
        expect(params.previous_response_id).toBeUndefined();
        expect(params.text).toMatchObject({
          format: { type: "json_schema", strict: true },
        });

        return {
          id: "resp_intake_1",
          model: "gpt-4o",
          output_text: JSON.stringify(
            mockCase({
              stage: "intake",
              caseSummary:
                "Commercial tomato field reported stunted in Trinidad.",
              nextQuestion:
                "Does the stunting appear in patches, low spots, or almost the entire field?",
              missingCriticalInformation: [
                "field distribution",
                "plant age",
                "irrigation",
                "drainage",
              ],
            }),
          ),
        };
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.case.stage).toBe("intake");
    expect(result.case.nextQuestion.split("?").length).toBe(2);
    expect(result.case.likelyCauses).toEqual([]);
    expect(result.responseId).toBe("resp_intake_1");
  });

  it("preserves previous_response_id across turns and retains supplied facts", async () => {
    const retainedFacts: string[] = [];
    let previousId: string | null = null;
    const history: { role: "user" | "assistant"; content: string }[] = [];

    const scripted: AgronomicCasePayload[] = [
      mockCase({
        stage: "intake",
        caseSummary:
          "Commercial tomato field is stunted in Trinidad. Crop: tomato. Production: commercial.",
        nextQuestion: "Which parts of the field are most affected?",
        missingCriticalInformation: ["field distribution", "plant age"],
      }),
      mockCase({
        stage: "questioning",
        caseSummary:
          "Commercial tomato field in Trinidad is stunted across almost the entire field.",
        nextQuestion: "Which leaves are most affected — older, newer, or both?",
        missingCriticalInformation: ["leaves affected", "plant age", "drainage"],
      }),
      mockCase({
        stage: "questioning",
        caseSummary:
          "Commercial tomato field in Trinidad is stunted across almost the entire field. Lower leaves yellow; new leaves small.",
        nextQuestion: "How long does the soil stay wet after irrigation?",
        missingCriticalInformation: ["drainage", "plant age", "irrigation"],
      }),
      mockCase({
        stage: "questioning",
        caseSummary:
          "Commercial tomato field in Trinidad is stunted across almost the entire field. Lower leaves yellow; new leaves small. Soil stays wet for two days after irrigation.",
        nextQuestion: "How old are the plants?",
        missingCriticalInformation: ["plant age", "fertilizer history", "roots"],
      }),
      mockCase({
        stage: "questioning",
        caseSummary:
          "Commercial tomato field in Trinidad, plants six weeks old, stunted across almost the entire field. Lower leaves yellow; new leaves small. Soil stays wet for two days after irrigation.",
        nextQuestion: "What fertilizer or manure was used before or after planting?",
        missingCriticalInformation: ["fertilizer history", "root observations"],
      }),
      mockCase({
        stage: "assessment",
        caseSummary:
          "Commercial tomato field in Trinidad, plants six weeks old, stunted across almost the entire field. Lower leaves yellow; new leaves small. Soil stays wet for two days after irrigation. Well-composted manure was incorporated before planting.",
        nextQuestion: "",
        missingCriticalInformation: ["root observations", "photo availability"],
        likelyCauses: [
          "Possible waterlogging or poor drainage limiting root function",
          "Possible nutrient uptake stress secondary to wet soil — not confirmed",
        ],
        checksToday: [
          "Dig carefully beside a few plants and observe root color and smell",
          "Compare low spots versus any slightly higher areas for standing water",
        ],
        safeActionsNow: [
          "Pause irrigation until the topsoil begins to dry between waterings",
          "Improve surface drainage outlets if water ponds",
        ],
        actionsToAvoid: [
          "Do not add sand or gravel to the established commercial field",
          "Do not apply fertilizer solely because plants are stunted",
        ],
        redFlags: ["Nearly whole-field stunting with prolonged wet soil"],
      }),
    ];

    for (let i = 0; i < ACCEPTANCE_TRANSCRIPT.length; i += 1) {
      const farmerLine = ACCEPTANCE_TRANSCRIPT[i];
      const result = await runAgronomicCase({
        message: farmerLine,
        history,
        previousResponseId: previousId,
        createResponse: async (params) => {
          if (i === 0) {
            expect(params.previous_response_id).toBeUndefined();
          } else {
            expect(params.previous_response_id).toBe(previousId);
          }
          return {
            id: `resp_turn_${i + 1}`,
            model: "gpt-4o",
            output_text: JSON.stringify(scripted[i]),
          };
        },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      previousId = result.responseId;
      retainedFacts.push(result.case.caseSummary);

      history.push({ role: "user", content: farmerLine });
      history.push({
        role: "assistant",
        content: JSON.stringify(result.case),
      });

      if (result.case.stage === "intake" || result.case.stage === "questioning") {
        expect(result.case.nextQuestion.length).toBeGreaterThan(0);
        expect(result.case.nextQuestion.includes("?")).toBe(true);
        // Exactly one question mark for a single question.
        expect(result.case.nextQuestion.split("?").length - 1).toBe(1);
        expect(result.case.likelyCauses).toEqual([]);
      }

      const combinedAdvice = [
        ...result.case.safeActionsNow,
        ...result.case.checksToday,
        result.case.caseSummary,
      ].join(" ");

      expect(mentionsSandOrGravel(combinedAdvice)).toBe(false);
      if (result.case.stage === "intake" || result.case.stage === "questioning") {
        expect(mentionsPrematureFertilizer(combinedAdvice)).toBe(false);
      }
    }

    const finalSummary = retainedFacts[retainedFacts.length - 1];
    expect(finalSummary).toMatch(/Trinidad/i);
    expect(finalSummary).toMatch(/entire field/i);
    expect(finalSummary).toMatch(/yellow/i);
    expect(finalSummary).toMatch(/wet/i);
    expect(finalSummary).toMatch(/six weeks/i);
    expect(finalSummary).toMatch(/manure/i);

    // Cautious assessment only after enough evidence (final scripted turn).
    const last = await runAgronomicCase({
      message: "Please summarize what you think so far.",
      history,
      previousResponseId: previousId,
      createResponse: async () => ({
        id: "resp_assessment",
        model: "gpt-4o",
        output_text: JSON.stringify(scripted[5]),
      }),
    });

    expect(last.ok).toBe(true);
    if (!last.ok) return;
    expect(last.case.stage).toBe("assessment");
    expect(last.case.likelyCauses.length).toBeGreaterThan(0);
    expect(
      last.case.actionsToAvoid.some((item) => /sand or gravel/i.test(item)),
    ).toBe(true);
    expect(
      last.case.actionsToAvoid.some((item) => /fertilizer solely/i.test(item)),
    ).toBe(true);
    expect(mentionsSandOrGravel(last.case.safeActionsNow.join(" "))).toBe(
      false,
    );
  });

  it("falls back to conversation history when previous_response_id is absent", async () => {
    let sawHistory = false;

    const result = await runAgronomicCase({
      message: ACCEPTANCE_TRANSCRIPT[1],
      history: [
        { role: "user", content: ACCEPTANCE_TRANSCRIPT[0] },
        {
          role: "assistant",
          content: "Stage: intake\nNext question: Which parts are affected?",
        },
      ],
      createResponse: async (params) => {
        const input = params.input as { role: string; content: string }[];
        expect(Array.isArray(input)).toBe(true);
        expect(input.length).toBe(3);
        sawHistory = input.some((item) =>
          item.content.includes(ACCEPTANCE_TRANSCRIPT[0]),
        );
        return {
          id: "resp_history",
          model: "gpt-4o",
          output_text: JSON.stringify(
            mockCase({
              stage: "questioning",
              caseSummary:
                "Commercial tomato field in Trinidad stunted across almost the entire field.",
              nextQuestion: "Which leaves are yellowing?",
              missingCriticalInformation: ["leaves affected"],
            }),
          ),
        };
      },
    });

    expect(result.ok).toBe(true);
    expect(sawHistory).toBe(true);
  });

  it("strips unsafe sand recommendations from model output", async () => {
    const result = await runAgronomicCase({
      message: ACCEPTANCE_TRANSCRIPT[0],
      createResponse: async () => ({
        id: "resp_unsafe",
        model: "gpt-4o",
        output_text: JSON.stringify(
          mockCase({
            stage: "assessment",
            caseSummary: "Wet commercial tomato field in Trinidad.",
            nextQuestion: "",
            likelyCauses: ["Drainage stress"],
            safeActionsNow: ["Add sand to the soil to improve drainage"],
            checksToday: ["Inspect roots"],
          }),
        ),
      }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.case.safeActionsNow.some((item) => mentionsSandOrGravel(item)),
    ).toBe(false);
    expect(
      result.case.actionsToAvoid.some((item) => /sand or gravel/i.test(item)),
    ).toBe(true);
  });
});
