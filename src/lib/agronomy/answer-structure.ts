/**
 * Farmer-facing agricultural answer shape. Not a rigid form — a completeness guide.
 */

import type { IntentCategory } from "@/lib/assistant/intents";
import { isBusinessIntent, isCalculationIntent, isDiagnosticIntent } from "@/lib/assistant/intents";

export const AGRICULTURAL_ANSWER_SHAPE = `For a normal agricultural question, write a complete farmer-facing answer in preliminaryAssessment. Use short paragraphs or 5–10 useful bullets. Do not artificially shorten it.

Cover, in this order, using plain sentences (no markdown headings):
1. WHAT I THINK IS HAPPENING
2. WHY
3. CHECK THIS NOW
4. WHAT TO DO NOW
5. IF CHEMICAL CONTROL IS NEEDED — verified country-specific options when they exist; otherwise active-ingredient classes clearly marked unverified
6. WHAT NOT TO DO
7. WHAT TO WATCH OVER THE NEXT 2–3 DAYS
8. ONE FOLLOW-UP QUESTION
Skip a heading when it is not needed.
Use Integrated Pest Management: cultural/physical, then biological, then chemical when justified. Do not make farmers feel guilty for using registered products.

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
