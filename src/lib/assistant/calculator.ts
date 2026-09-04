/**
 * Deterministic farmer calculations. Used instead of the crop-diagnosis
 * workflow when the question is arithmetic or a unit conversion.
 */

export type FarmerCalculation =
  | {
      handled: true;
      ok: true;
      calculationType: string;
      expression: string;
      resultLabel: string;
      resultValue: number;
      unit: string | null;
      farmerText: string;
    }
  | {
      handled: true;
      ok: false;
      calculationType: string;
      farmerText: string;
    }
  | {
      handled: false;
    };

function parseNumber(raw: string): number | null {
  const cleaned = raw.replace(/,/g, "").trim();
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) {
    return value.toLocaleString("en-US");
  }
  const rounded = Math.round(value * 100) / 100;
  return rounded.toLocaleString("en-US", {
    minimumFractionDigits: rounded % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function money(value: number): string {
  return `$${formatNumber(value)}`;
}

function success(options: {
  calculationType: string;
  expression: string;
  resultValue: number;
  unit?: string | null;
  resultLabel?: string;
  extra?: string;
}): FarmerCalculation {
  const unit = options.unit ?? null;
  const resultLabel = options.resultLabel ?? (unit ? `${formatNumber(options.resultValue)} ${unit}` : formatNumber(options.resultValue));
  const farmerText = [
    options.expression,
    extraLine(options.extra),
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    handled: true,
    ok: true,
    calculationType: options.calculationType,
    expression: options.expression,
    resultLabel,
    resultValue: options.resultValue,
    unit,
    farmerText,
  };
}

function extraLine(extra?: string): string {
  return extra?.trim() ?? "";
}

function clarify(calculationType: string, farmerText: string): FarmerCalculation {
  return {
    handled: true,
    ok: false,
    calculationType,
    farmerText,
  };
}

export function tryFarmerCalculation(message: string): FarmerCalculation {
  const text = message.trim();
  const lower = text.toLowerCase();

  const bagsKg = text.match(
    /(\d[\d,]*(?:\.\d+)?)\s*bags?\s*(?:at|x|×|times|of|each)?\s*(\d[\d,]*(?:\.\d+)?)\s*kg/i,
  );
  if (bagsKg) {
    const bags = parseNumber(bagsKg[1]);
    const kg = parseNumber(bagsKg[2]);
    if (bags != null && kg != null) {
      const total = bags * kg;
      return success({
        calculationType: "bags_to_kg",
        expression: `${formatNumber(bags)} bags × ${formatNumber(kg)} kg = ${formatNumber(total)} kg`,
        resultValue: total,
        unit: "kg",
      });
    }
  }

  const bagsPrice = text.match(
    /(\d[\d,]*(?:\.\d+)?)\s*bags?\s*(?:at|for|x|×)?\s*\$?\s*(\d[\d,]*(?:\.\d+)?)/i,
  );
  if (bagsPrice && /\$|cost|price|how much/i.test(text)) {
    const bags = parseNumber(bagsPrice[1]);
    const price = parseNumber(bagsPrice[2]);
    if (bags != null && price != null) {
      const total = bags * price;
      return success({
        calculationType: "bags_times_price",
        expression: `${formatNumber(bags)} bags × ${money(price)} = ${money(total)}`,
        resultValue: total,
        unit: null,
        resultLabel: money(total),
      });
    }
  }

  const weightPrice = text.match(
    /(\d[\d,]*(?:\.\d+)?)\s*(lb|lbs|pounds?|kg)\s*(?:at|for|x|×)\s*\$?\s*(\d[\d,]*(?:\.\d+)?)\s*(?:per\s*(lb|lbs|pound|kg))?/i,
  );
  if (weightPrice) {
    const qty = parseNumber(weightPrice[1]);
    const price = parseNumber(weightPrice[3]);
    const unit = /kg/i.test(weightPrice[2]) ? "kg" : "lb";
    if (qty != null && price != null) {
      const total = qty * price;
      return success({
        calculationType: "weight_times_price",
        expression: `${formatNumber(qty)} ${unit} × ${money(price)} per ${unit} = ${money(total)}`,
        resultValue: total,
        resultLabel: money(total),
      });
    }
  }

  const sellAt = text.match(
    /sell(?:ing)?\s+(\d[\d,]*(?:\.\d+)?)\s*(lb|lbs|pounds?|kg)?\s+at\s*\$?\s*(\d[\d,]*(?:\.\d+)?)\s*(?:per\s*(lb|kg))?/i,
  );
  if (sellAt) {
    const qty = parseNumber(sellAt[1]);
    const price = parseNumber(sellAt[3]);
    const unit = sellAt[2] ? (/kg/i.test(sellAt[2]) ? "kg" : "lb") : null;
    if (qty != null && price != null) {
      const total = qty * price;
      const unitBit = unit ? ` ${unit}` : "";
      return success({
        calculationType: "revenue",
        expression: `${formatNumber(qty)}${unitBit} × ${money(price)}${unit ? ` per ${unit}` : ""} = ${money(total)} revenue`,
        resultValue: total,
        resultLabel: money(total),
      });
    }
  }

  const trays = text.match(
    /(\d[\d,]*(?:\.\d+)?)\s*trays?\s*(?:x|×|times|with|of)?\s*(\d[\d,]*(?:\.\d+)?)\s*cells?/i,
  );
  if (trays) {
    const t = parseNumber(trays[1]);
    const cells = parseNumber(trays[2]);
    if (t != null && cells != null) {
      const total = t * cells;
      return success({
        calculationType: "trays_times_cells",
        expression: `${formatNumber(t)} trays × ${formatNumber(cells)} cells = ${formatNumber(total)} seedlings`,
        resultValue: total,
        unit: "seedlings",
      });
    }
  }

  const percent = text.match(
    /(\d[\d,]*(?:\.\d+)?)\s*%\s*(?:of)\s*\$?\s*(\d[\d,]*(?:\.\d+)?)/i,
  );
  if (percent) {
    const pct = parseNumber(percent[1]);
    const base = parseNumber(percent[2]);
    if (pct != null && base != null) {
      const total = (pct / 100) * base;
      return success({
        calculationType: "percentage",
        expression: `${formatNumber(pct)}% of ${formatNumber(base)} = ${formatNumber(total)}`,
        resultValue: total,
      });
    }
  }

  const lbToKg = text.match(
    /(\d[\d,]*(?:\.\d+)?)\s*(lb|lbs|pounds?)\s+(?:to|in|into)\s+kg/i,
  );
  if (lbToKg) {
    const lb = parseNumber(lbToKg[1]);
    if (lb != null) {
      const kg = Math.round(lb * 0.453592 * 100) / 100;
      return success({
        calculationType: "unit_conversion",
        expression: `${formatNumber(lb)} lb × 0.453592 = ${formatNumber(kg)} kg`,
        resultValue: kg,
        unit: "kg",
      });
    }
  }

  const kgToLb = text.match(
    /(\d[\d,]*(?:\.\d+)?)\s*kg\s+(?:to|in|into)\s+(lb|lbs|pounds?)/i,
  );
  if (kgToLb) {
    const kg = parseNumber(kgToLb[1]);
    if (kg != null) {
      const lb = Math.round(kg / 0.453592 * 100) / 100;
      return success({
        calculationType: "unit_conversion",
        expression: `${formatNumber(kg)} kg ÷ 0.453592 = ${formatNumber(lb)} lb`,
        resultValue: lb,
        unit: "lb",
      });
    }
  }

  const acreHa = text.match(
    /(\d[\d,]*(?:\.\d+)?)\s*acres?\s+(?:to|in|into)\s+(hectares?|ha)/i,
  );
  if (acreHa) {
    const acres = parseNumber(acreHa[1]);
    if (acres != null) {
      const ha = Math.round(acres * 0.404686 * 1000) / 1000;
      return success({
        calculationType: "unit_conversion",
        expression: `${formatNumber(acres)} acres × 0.404686 = ${formatNumber(ha)} ha`,
        resultValue: ha,
        unit: "ha",
      });
    }
  }

  const fertilizer = text.match(
    /(?:how much|what)\s+(?:fertilizer|fertiliser).{0,40}?(\d[\d,]*(?:\.\d+)?)\s*(acres?|hectares?|ha)\b/i,
  );
  const fertilizerAlt = text.match(
    /(\d[\d,]*(?:\.\d+)?)\s*(acres?|hectares?|ha).{0,40}?(?:fertilizer|fertiliser)/i,
  );
  if (fertilizer || fertilizerAlt) {
    return clarify(
      "fertilizer_rate",
      "I can work that out. What rate are you using per acre — for example 2 bags of NPK per acre — and which fertilizer?",
    );
  }

  const yieldPerAcre = text.match(
    /(\d[\d,]*(?:\.\d+)?)\s*(?:bags?|kg|lb|lbs)\s*(?:per|\/)\s*acre.{0,20}?(\d[\d,]*(?:\.\d+)?)\s*acres?/i,
  );
  const yieldAlt = text.match(
    /(\d[\d,]*(?:\.\d+)?)\s*acres?.{0,30}?(\d[\d,]*(?:\.\d+)?)\s*(bags?|kg|lb)\s*(?:per|\/)\s*acre/i,
  );
  if (yieldPerAcre) {
    const per = parseNumber(yieldPerAcre[1]);
    const acres = parseNumber(yieldPerAcre[2]);
    if (per != null && acres != null) {
      const total = per * acres;
      return success({
        calculationType: "yield_per_acre",
        expression: `${formatNumber(acres)} acres × ${formatNumber(per)} per acre = ${formatNumber(total)}`,
        resultValue: total,
      });
    }
  }
  if (yieldAlt) {
    const acres = parseNumber(yieldAlt[1]);
    const per = parseNumber(yieldAlt[2]);
    const unit = yieldAlt[3];
    if (acres != null && per != null) {
      const total = acres * per;
      return success({
        calculationType: "yield_per_acre",
        expression: `${formatNumber(acres)} acres × ${formatNumber(per)} ${unit} per acre = ${formatNumber(total)} ${unit}`,
        resultValue: total,
        unit,
      });
    }
  }

  const simpleTimes = text.match(
    /(\d[\d,]*(?:\.\d+)?)\s*(?:x|×|times)\s*(\d[\d,]*(?:\.\d+)?)/i,
  );
  if (simpleTimes && /\b(how much|how many|what is|total|cost)\b/i.test(text)) {
    const a = parseNumber(simpleTimes[1]);
    const b = parseNumber(simpleTimes[2]);
    if (a != null && b != null) {
      const total = a * b;
      return success({
        calculationType: "arithmetic",
        expression: `${formatNumber(a)} × ${formatNumber(b)} = ${formatNumber(total)}`,
        resultValue: total,
      });
    }
  }

  if (
    /\b(how much|how many|what is the (cost|total|revenue))\b/i.test(lower) &&
    /\d/.test(lower) &&
    (/\bbags?\b/.test(lower) || /\b\$/.test(text) || /\b(lb|kg|acre)\b/.test(lower))
  ) {
    return clarify(
      "arithmetic",
      "I can calculate that. Please confirm the two numbers and the units — for example 18 bags at $240 each, or 48 bags at 22 kg each.",
    );
  }

  return { handled: false };
}

export function formatCalculationReply(calc: FarmerCalculation): string {
  if (!calc.handled) return "";
  if (!calc.ok) return calc.farmerText;
  return [
    calc.farmerText,
    "If a unit is different from what you meant, tell me and I will redo it.",
  ].join("\n\n");
}
