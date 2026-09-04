import { describe, expect, it } from "vitest";
import { tryFarmerCalculation } from "./calculator";

describe("farmer calculator", () => {
  it("multiplies bags by price", () => {
    const result = tryFarmerCalculation("How much will 18 bags at $240 cost?");
    expect(result.handled).toBe(true);
    if (!result.handled || !result.ok) throw new Error("expected calculation");
    expect(result.resultValue).toBe(4320);
    expect(result.farmerText).toMatch(/18 bags × \$240 = \$4,320/);
    expect(result.farmerText.toLowerCase()).not.toContain("tomato");
  });

  it("multiplies bags by kg", () => {
    const result = tryFarmerCalculation(
      "I harvested 48 bags at 22 kg each, how many kg?",
    );
    expect(result.handled).toBe(true);
    if (!result.handled || !result.ok) throw new Error("expected calculation");
    expect(result.resultValue).toBe(1056);
    expect(result.farmerText).toMatch(/48 bags × 22 kg = 1,056 kg/);
  });

  it("calculates revenue from weight and price", () => {
    const result = tryFarmerCalculation(
      "If I sell 1,250 lb at $8 per lb, what is the revenue?",
    );
    expect(result.handled).toBe(true);
    if (!result.handled || !result.ok) throw new Error("expected calculation");
    expect(result.resultValue).toBe(10000);
  });

  it("asks for the missing fertilizer rate", () => {
    const result = tryFarmerCalculation("How much fertilizer do I need for 2 acres?");
    expect(result.handled).toBe(true);
    if (!result.handled || result.ok) throw new Error("expected clarification");
    expect(result.farmerText.toLowerCase()).toMatch(/rate|per acre/);
  });
});
