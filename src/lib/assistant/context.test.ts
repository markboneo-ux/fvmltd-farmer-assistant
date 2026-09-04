import { describe, expect, it } from "vitest";
import { mentionsTomato } from "./crops";
import { resolveTurnContext } from "./context";
import { buildCashflowTurn } from "./cashflow";

describe("conversation context — no tomato contamination", () => {
  it("does not carry tomato into a cucumber problem", () => {
    const turn = resolveTurnContext({
      message: "My cucumber leaves have spots",
      history: [
        { role: "user", content: "Tomato whiteflies" },
        { role: "assistant", content: "Are they on a few plants or most of the field?" },
      ],
    });
    expect(turn.resetHistory).toBe(true);
    expect(turn.knownFacts.crop).toBe("cucumber");
    expect(turn.allowedCrops).toContain("cucumber");
    expect(turn.allowedCrops).not.toContain("tomato");
  });

  it("does not carry tomato into a bag-cost question", () => {
    const turn = resolveTurnContext({
      message: "How much will 18 bags at $240 cost?",
      history: [{ role: "user", content: "My tomato plants are wilting" }],
      activeCase: { crop: "tomato", conversationIntent: "crop_problem" },
    });
    expect(turn.resetHistory).toBe(true);
    expect(turn.knownFacts.crop).toBeNull();
    expect(turn.classified.intent).toBe("simple_math");
  });

  it("does not carry tomato into a cashflow request", () => {
    const turn = resolveTurnContext({
      message: "Help me make a cashflow for my farm",
      history: [{ role: "user", content: "Tomato wilt in Couva" }],
      activeCase: { crop: "tomato", conversationIntent: "crop_problem" },
    });
    expect(turn.resetHistory).toBe(true);
    expect(turn.classified.intent).toBe("cashflow");
    expect(turn.knownFacts.crop).toBeNull();
  });

  it("keeps tomato on a genuine tomato follow-up", () => {
    const turn = resolveTurnContext({
      message: "The soil stays wet after watering.",
      history: [{ role: "user", content: "Tomato wilt" }],
      activeCase: { crop: "tomato", conversationIntent: "crop_problem" },
    });
    expect(turn.resetHistory).toBe(false);
    expect(turn.knownFacts.crop).toBe("tomato");
  });

  it("asks for the crop when a problem is described without one", () => {
    const turn = resolveTurnContext({
      message: "The leaves have yellow spots and some plants are wilting",
    });
    expect(turn.knownFacts.crop).toBeNull();
    expect(turn.askForCrop).toBe(true);
  });
});

describe("cashflow assistant", () => {
  it("asks one missing question and does not invent numbers or mention tomato", () => {
    const turn = buildCashflowTurn({
      message: "Help me make a cashflow for my farm",
    });
    expect(turn.farmerText.toLowerCase()).toMatch(/crop|enterprise/);
    expect(turn.farmerText.toLowerCase()).not.toContain("tomato");
    expect(mentionsTomato(turn.farmerText)).toBe(false);
    expect(turn.readyForTable).toBe(false);
  });

  it("continues cashflow after the farmer names the crop", () => {
    const turn = resolveTurnContext({
      message: "Hot pepper on 2 acres",
      history: [
        { role: "user", content: "Help me make a cashflow for my farm" },
        {
          role: "assistant",
          content: "What crop or enterprise is this cashflow for?",
        },
      ],
      activeCase: { crop: null, conversationIntent: "cashflow" },
    });
    expect(turn.resetHistory).toBe(false);
    expect(turn.classified.intent).toBe("cashflow");
    expect(turn.knownFacts.crop).toBe("pepper");
    expect(turn.allowedCrops).not.toContain("tomato");
  });

  it("does not keep tomato in a cashflow follow-up after a tomato case", () => {
    const turn = resolveTurnContext({
      message: "Hot pepper on 2 acres",
      history: [
        { role: "user", content: "My tomato plants are wilting" },
        { role: "user", content: "Help me make a cashflow for my farm" },
        {
          role: "assistant",
          content: "What crop or enterprise is this cashflow for?",
        },
      ],
      activeCase: { crop: null, conversationIntent: "cashflow" },
    });
    expect(turn.classified.intent).toBe("cashflow");
    expect(turn.knownFacts.crop).toBe("pepper");
    expect(turn.allowedCrops).not.toContain("tomato");
  });

  it("builds totals from supplied figures only", () => {
    const turn = buildCashflowTurn({
      history: [
        { role: "user", content: "Cashflow for pepper on 2 acres" },
        { role: "assistant", content: "What yield do you expect?" },
      ],
      message:
        "Yield 800 bags, selling price $40 per bag, labour 4000, fertilizer 2500, plant in January, 4 month cycle",
    });
    expect(turn.draft.crop).toBe("pepper");
    expect(turn.farmerText).toMatch(/\$32,000/);
    expect(turn.farmerText).toMatch(/MONTH \| CASH IN \| CASH OUT \| NET CASH FLOW/);
    expect(turn.farmerText.toLowerCase()).not.toContain("tomato");
  });
});
