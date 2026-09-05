/**
 * Farmer-facing agricultural answer shape. Not a rigid form — a completeness guide.
 */

import type { IntentCategory } from "@/lib/assistant/intents";
import { isBusinessIntent, isCalculationIntent, isDiagnosticIntent } from "@/lib/assistant/intents";

export const AGRICULTURAL_ANSWER_SHAPE = `For a normal agricultural question, write a complete farmer-facing answer in preliminaryAssessment. Use short paragraphs or 5–10 useful bullets. Do not artificially shorten it.

Cover, in this order, using plain sentences (no markdown headings):
1. DIRECT ANSWER — what is most likely happening, or the direct answer to the question.
2. WHY — likely reasons in simple language.
3. WHAT TO CHECK — practical field checks.
4. WHAT TO DO — next actions in priority order.
5. WHAT TO WATCH — signs of improvement or worsening.
6. LOCAL / COUNTRY-SPECIFIC NOTE — only when local rules, weather, prices, products, or practices materially matter.
7. SOURCES — only if the server attached web research. Use the provided source names, not long URLs.

Keep language simple, practical, and farmer-friendly. Not academic.

For simple maths, stay concise and skip this structure.
For cashflow / bank work, use the business table instead of a diagnosis card.`;

export function answerShapeForIntent(intent: IntentCategory): string {
  if (isCalculationIntent(intent)) {
    return "Answer the calculation directly and briefly. Show the working. Do not use a diagnosis card.";
  }
  if (isBusinessIntent(intent)) {
    return "This is farm business, not crop diagnosis. Ask only missing numbers. Never invent assumptions without labelling them.";
  }
  if (isDiagnosticIntent(intent) || intent === "general_agriculture") {
    return AGRICULTURAL_ANSWER_SHAPE;
  }
  return AGRICULTURAL_ANSWER_SHAPE;
}
