/**
 * Farmer-facing agricultural answer shape. Not a rigid form — a completeness guide.
 */

import type { IntentCategory } from "@/lib/assistant/intents";
import { isBusinessIntent, isCalculationIntent, isDiagnosticIntent } from "@/lib/assistant/intents";

export const AGRICULTURAL_ANSWER_SHAPE = `For a meaningful crop-health question, write a complete farmer-facing answer in preliminaryAssessment. Use short paragraphs or 5–10 useful bullets. Do not artificially shorten it.

Cover, in this order, using plain sentences (no markdown headings, and do not say "triage" unless you explain it):
1. WHAT I THINK IS HAPPENING — 1 to 3 likely causes, not one jump-to diagnosis
2. WHAT TO CHECK TODAY
3. WHAT TO DO NOW — cultural and IPM steps first
4. SPRAY OR FERTILIZER OPTIONS only when justified; if local registration is not verified, say so
5. WEATHER IMPLICATIONS only when weather actually changes diagnosis or management
6. EXACTLY WHAT INFORMATION OR PHOTO IS NEEDED NEXT if uncertainty remains (a specific photo such as underside of a leaf, whole plant, roots, stem lesion, cut fruit, or field pattern — never "more photos")

Skip a heading when it is not needed.
Use Integrated Pest Management: cultural/physical, then biological, then chemical when justified. Do not make farmers feel guilty for using registered products.
At low confidence, investigate before recommending pulling plants, dumping crop, or a high-risk spray.

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
