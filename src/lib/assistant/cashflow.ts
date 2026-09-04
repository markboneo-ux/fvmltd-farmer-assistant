/**
 * Conversational farm cashflow helper. Collects missing facts one at a time
 * and never invents numbers.
 */

import { extractLastCrop } from "./crops";

export type CashflowDraft = {
  crop: string | null;
  acres: number | null;
  plantingMonth: string | null;
  cycleMonths: number | null;
  expectedYield: number | null;
  yieldUnit: string | null;
  sellingPrice: number | null;
  labourCost: number | null;
  fertilizerCost: number | null;
  chemicalCost: number | null;
  irrigationCost: number | null;
  transportCost: number | null;
  otherCost: number | null;
  loanRepayment: number | null;
  otherIncome: number | null;
};

export type CashflowTurn = {
  draft: CashflowDraft;
  missingField: keyof CashflowDraft | null;
  farmerText: string;
  readyForTable: boolean;
};

const EMPTY_DRAFT: CashflowDraft = {
  crop: null,
  acres: null,
  plantingMonth: null,
  cycleMonths: null,
  expectedYield: null,
  yieldUnit: null,
  sellingPrice: null,
  labourCost: null,
  fertilizerCost: null,
  chemicalCost: null,
  irrigationCost: null,
  transportCost: null,
  otherCost: null,
  loanRepayment: null,
  otherIncome: null,
};

function parseNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const value = Number(raw.replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}

function formatMoney(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return `$${rounded.toLocaleString("en-US", {
    minimumFractionDigits: rounded % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatQty(value: number): string {
  return value.toLocaleString("en-US");
}

export function extractCashflowDraft(
  text: string,
  previous: CashflowDraft = EMPTY_DRAFT,
): CashflowDraft {
  const combined = text;
  const lower = combined.toLowerCase();
  const next: CashflowDraft = { ...previous };

  const crop = extractLastCrop(combined);
  if (crop) next.crop = crop;

  const acres = combined.match(/(\d[\d,]*(?:\.\d+)?)\s*(acres?|hectares?|ha)\b/i);
  if (acres) {
    const value = parseNumber(acres[1]);
    if (value != null) {
      next.acres = /ha|hectare/i.test(acres[2])
        ? Math.round(value * 2.471 * 100) / 100
        : value;
    }
  }

  const month = combined.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i,
  );
  if (month) next.plantingMonth = month[1];

  const cycle = combined.match(
    /(\d[\d,]*(?:\.\d+)?)\s*(months?|weeks?)\s*(cycle|crop|season)?/i,
  );
  if (cycle) {
    const value = parseNumber(cycle[1]);
    if (value != null) {
      next.cycleMonths = /week/i.test(cycle[2])
        ? Math.max(1, Math.round(value / 4))
        : value;
    }
  }

  const yieldMatch =
    combined.match(
      /(?:yield|harvest|produce|expect(?:ing)?)\s*(?:of|is|about|around)?\s*(\d[\d,]*(?:\.\d+)?)\s*(bags?|kg|lb|lbs|pounds?)/i,
    ) ||
    combined.match(
      /(\d[\d,]*(?:\.\d+)?)\s*(bags?|kg|lb|lbs)\s*(?:per\s*acre|yield)/i,
    );
  if (yieldMatch) {
    next.expectedYield = parseNumber(yieldMatch[1]);
    next.yieldUnit = yieldMatch[2].toLowerCase();
  }

  const price =
    combined.match(
      /(?:sell(?:ing)? price|price|at)\s*\$?\s*(\d[\d,]*(?:\.\d+)?)\s*(?:per\s*(bag|kg|lb))?/i,
    ) || combined.match(/\$\s*(\d[\d,]*(?:\.\d+)?)\s*(?:per|\/)\s*(bag|kg|lb)/i);
  if (price && !/bags? at \$/i.test(combined)) {
    next.sellingPrice = parseNumber(price[1]);
  }
  const pricePer = combined.match(
    /(\d[\d,]*(?:\.\d+)?)\s*(?:dollars?|\$)\s*(?:per|a|\/)\s*(bag|kg|lb)/i,
  );
  if (pricePer) next.sellingPrice = parseNumber(pricePer[1]);

  const labelledCost = (
    label: RegExp,
    field: keyof CashflowDraft,
  ) => {
    const match = combined.match(
      new RegExp(
        `(?:${label.source})\\s*(?:cost|costs|is|of)?\\s*\\$?\\s*(\\d[\\d,]*(?:\\.\\d+)?)`,
        "i",
      ),
    );
    const value = parseNumber(match?.[1]);
    if (value != null) (next[field] as number | null) = value;
  };

  labelledCost(/labour|labor/, "labourCost");
  labelledCost(/fertilizer|fertiliser/, "fertilizerCost");
  labelledCost(/chemical|pesticide|spray/, "chemicalCost");
  labelledCost(/irrigation|water/, "irrigationCost");
  labelledCost(/transport|trucking|delivery/, "transportCost");
  labelledCost(/loan (?:repayment|payment)/, "loanRepayment");
  labelledCost(/other income/, "otherIncome");

  if (/\bother (cost|expense)/i.test(lower)) {
    const match = combined.match(
      /other (?:cost|expense)s?\s*(?:of|is)?\s*\$?\s*(\d[\d,]*(?:\.\d+)?)/i,
    );
    const value = parseNumber(match?.[1]);
    if (value != null) next.otherCost = value;
  }

  return next;
}

export function mergeCashflowDrafts(
  current: CashflowDraft,
  incoming: CashflowDraft,
): CashflowDraft {
  const next = { ...current };
  for (const key of Object.keys(EMPTY_DRAFT) as Array<keyof CashflowDraft>) {
    const value = incoming[key];
    if (value != null && value !== "") {
      (next[key] as CashflowDraft[typeof key]) = value;
    }
  }
  return next;
}

export function draftFromHistory(
  history: Array<{ role: string; content: string }>,
  message: string,
): CashflowDraft {
  let draft = { ...EMPTY_DRAFT };
  for (const item of history) {
    if (item.role !== "user") continue;
    draft = mergeCashflowDrafts(draft, extractCashflowDraft(item.content, draft));
  }
  return mergeCashflowDrafts(draft, extractCashflowDraft(message, draft));
}

const QUESTION_ORDER: Array<{
  field: keyof CashflowDraft;
  question: string;
}> = [
  { field: "crop", question: "What crop or enterprise is this cashflow for?" },
  {
    field: "acres",
    question: "How many acres or how large is this production?",
  },
  {
    field: "expectedYield",
    question: "What yield do you expect, with the unit — for example 800 bags or 12,000 kg?",
  },
  {
    field: "sellingPrice",
    question: "What selling price are you using, and per what unit?",
  },
  {
    field: "labourCost",
    question:
      "What are your main costs so far? Start with labour, if you have a figure.",
  },
  {
    field: "fertilizerCost",
    question: "How much do you expect to spend on fertilizer and chemicals?",
  },
  {
    field: "plantingMonth",
    question: "Which month do you plant, and about how many months until you sell?",
  },
];

function isFilled(draft: CashflowDraft, field: keyof CashflowDraft): boolean {
  if (field === "labourCost") {
    return (
      draft.labourCost != null ||
      draft.fertilizerCost != null ||
      draft.chemicalCost != null ||
      draft.irrigationCost != null ||
      draft.transportCost != null ||
      draft.otherCost != null
    );
  }
  if (field === "fertilizerCost") {
    return (
      draft.fertilizerCost != null ||
      draft.chemicalCost != null ||
      draft.labourCost != null
    );
  }
  return draft[field] != null && draft[field] !== "";
}

export function nextCashflowQuestion(draft: CashflowDraft): string | null {
  for (const item of QUESTION_ORDER) {
    if (!isFilled(draft, item.field)) return item.question;
  }
  return null;
}

export function directCost(draft: CashflowDraft): number {
  return (
    (draft.labourCost ?? 0) +
    (draft.fertilizerCost ?? 0) +
    (draft.chemicalCost ?? 0) +
    (draft.irrigationCost ?? 0) +
    (draft.transportCost ?? 0) +
    (draft.otherCost ?? 0)
  );
}

export function expectedRevenue(draft: CashflowDraft): number | null {
  if (draft.expectedYield == null || draft.sellingPrice == null) return null;
  return draft.expectedYield * draft.sellingPrice;
}

export function hasCoreCashflowNumbers(draft: CashflowDraft): boolean {
  return (
    draft.expectedYield != null &&
    draft.sellingPrice != null &&
    (draft.acres != null || Boolean(draft.crop))
  );
}

function monthNamesFrom(start: string, count: number): string[] {
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const index = months.findIndex(
    (name) => name.toLowerCase() === start.toLowerCase(),
  );
  if (index < 0) return [];
  const length = Math.max(1, Math.min(12, Math.round(count)));
  return Array.from({ length }, (_, offset) => months[(index + offset) % 12]);
}

export function buildCashflowTable(draft: CashflowDraft): string | null {
  const revenue = expectedRevenue(draft);
  if (revenue == null || !draft.plantingMonth) return null;
  const months = monthNamesFrom(draft.plantingMonth, draft.cycleMonths ?? 4);
  if (months.length === 0) return null;

  const costs = directCost(draft);
  const loan = draft.loanRepayment ?? 0;
  const otherIn = draft.otherIncome ?? 0;
  const harvestMonth = months[months.length - 1];
  const lines = ["MONTH | CASH IN | CASH OUT | NET CASH FLOW"];

  for (const month of months) {
    const isHarvest = month === harvestMonth;
    const cashIn = (isHarvest ? revenue : 0) + (isHarvest ? otherIn : 0);
    const cashOut =
      (isHarvest ? 0 : costs / Math.max(1, months.length - 1)) + loan;
    const net = cashIn - cashOut;
    lines.push(
      `${month} | ${formatMoney(cashIn)} | ${formatMoney(cashOut)} | ${formatMoney(net)}`,
    );
  }

  return lines.join("\n");
}

export function buildCashflowTurn(options: {
  message: string;
  history?: Array<{ role: string; content: string }>;
}): CashflowTurn {
  const draft = draftFromHistory(options.history ?? [], options.message);
  const question = nextCashflowQuestion(draft);
  const revenue = expectedRevenue(draft);
  const costs = directCost(draft);
  const readyForTable = hasCoreCashflowNumbers(draft) && costs > 0;
  const table = readyForTable ? buildCashflowTable(draft) : null;

  const parts: string[] = [];

  if (!hasCoreCashflowNumbers(draft) && !question) {
    parts.push(
      "I can help you build a simple farm cashflow for the bank. I will only use numbers you give me.",
    );
  } else if (!hasCoreCashflowNumbers(draft)) {
    parts.push(
      "I can help you build a practical cashflow. I will not invent prices, yields, or costs.",
    );
    if (draft.crop) {
      parts.push(`We are working on ${draft.crop}.`);
    }
  } else {
    const cropBit = draft.crop ? ` for ${draft.crop}` : "";
    const areaBit = draft.acres != null ? ` on ${formatQty(draft.acres)} acres` : "";
    const yieldBit =
      draft.expectedYield != null
        ? `${formatQty(draft.expectedYield)}${draft.yieldUnit ? ` ${draft.yieldUnit}` : ""}`
        : "the yield you gave";
    const priceBit =
      draft.sellingPrice != null ? formatMoney(draft.sellingPrice) : "the price you gave";
    parts.push(
      `Using your figures${cropBit}${areaBit}, expected production is ${yieldBit} at ${priceBit} each.`,
    );
    if (revenue != null) {
      parts.push(`Expected revenue: ${formatMoney(revenue)}.`);
    }
    if (costs > 0) {
      const margin = (revenue ?? 0) - costs;
      const breakEven =
        draft.sellingPrice && draft.sellingPrice > 0
          ? costs / draft.sellingPrice
          : null;
      parts.push(
        `Direct costs so far: ${formatMoney(costs)}. Gross margin: ${formatMoney(margin)}.`,
      );
      if (breakEven != null) {
        parts.push(
          `Break-even is about ${formatQty(Math.ceil(breakEven))}${draft.yieldUnit ? ` ${draft.yieldUnit}` : ""} at the price you gave.`,
        );
      }
      if (draft.loanRepayment) {
        parts.push(
          `Loan repayment of ${formatMoney(draft.loanRepayment)} per period would reduce net cash after harvest.`,
        );
      }
    }
  }

  if (table) {
    parts.push("Monthly picture, using your planting month and putting sales in the last month of the cycle:");
    parts.push(table);
    parts.push(
      "Assumptions: costs are spread across the months before harvest; sales land in the harvest month; no extra numbers were invented.",
    );
    parts.push(
      "Risks: yield, price, and weather can all move. If a loan is involved, missed harvest timing squeezes repayment.",
    );
  }

  const stillMissing: string[] = [];
  if (!draft.crop) stillMissing.push("crop/enterprise");
  if (draft.acres == null) stillMissing.push("acreage");
  if (draft.expectedYield == null) stillMissing.push("expected yield");
  if (draft.sellingPrice == null) stillMissing.push("selling price");
  if (costs === 0) stillMissing.push("major costs");
  if (!draft.plantingMonth) stillMissing.push("planting month / cycle");
  if (stillMissing.length > 0) {
    parts.push(`Still missing: ${stillMissing.join(", ")}.`);
  }

  if (question && !(table && stillMissing.length === 0)) {
    parts.push(question);
  } else if (table) {
    parts.push(
      "If you have labour, fertilizer, transport, or loan figures I missed, send them and I will update the table.",
    );
  }

  return {
    draft,
    missingField: question
      ? (QUESTION_ORDER.find((item) => item.question === question)?.field ?? null)
      : null,
    farmerText: parts.filter(Boolean).join("\n\n"),
    readyForTable: Boolean(table),
  };
}
