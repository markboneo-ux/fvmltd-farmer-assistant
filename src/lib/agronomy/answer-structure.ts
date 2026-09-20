/**
 * Farmer-facing agricultural answer shape. Not a rigid form — a completeness guide.
 */

import type { IntentCategory } from "@/lib/assistant/intents";
import { isBusinessIntent, isCalculationIntent, isDiagnosticIntent } from "@/lib/assistant/intents";
import type { AgronomicMode } from "./case-modes";

export const AGRICULTURAL_ANSWER_SHAPE = `Write ONE coherent farmer-facing answer in preliminaryAssessment. Do not repeat the same guidance in paragraphs and again as cards.

Use this order, skipping any heading that adds no value. Plain sentences, no markdown headings, and do not say "triage" unless you explain it:

1. WHAT I THINK IS MOST LIKELY
2. WHY
3. OTHER POSSIBILITIES — only if genuinely unresolved. Skip this when the farmer already reported a pest and there is no second unexplained symptom.
4. CHECK THIS NOW
5. WHAT TO DO TODAY — low-risk actions first. Do not automatically say to remove leaves or plants.
6. IF A SPRAY IS NEEDED — only if the farmer asked about spraying/treatment/chemical control, or a pesticide discussion is materially justified by evidence. Never invent a spray section. Never duplicate this section. Never discuss fungal-vs-bacterial spot sprays unless spots were reported or seen.
7. WEATHER EFFECT — only if weather changes a ranking or a decision (wetness, spray timing, heat, dry). Do not append a generic "wet weather increases disease pressure" line.
8. WHAT WOULD CHANGE MY ASSESSMENT
9. ONE NEXT QUESTION or ONE SPECIFIC PHOTO REQUEST

Fill checksToday and safeActionsNow with the same unique points — do not write a second copy in the prose if those arrays are populated.
Use Integrated Pest Management: cultural/physical, then biological, then chemical when justified.
At low confidence, investigate before recommending pulling plants, dumping crop, or a high-risk spray.
Keep language simple and practical.`;

export function answerShapeForIntent(
  intent: IntentCategory,
  mode?: AgronomicMode | null,
): string {
  if (isCalculationIntent(intent)) {
    return "Answer the calculation directly and briefly. Show the working. Do not use a diagnosis card.";
  }
  if (isBusinessIntent(intent)) {
    return "This is farm business, not crop diagnosis. Ask only missing numbers. Never invent assumptions without labelling them.";
  }
  if (mode === "OBSERVED_PEST_MANAGEMENT") {
    return `${AGRICULTURAL_ANSWER_SHAPE}

This is pest management, not a cause-ranking case. Do not show generic abiotic causes.`;
  }
  if (isDiagnosticIntent(intent) || intent === "general_agriculture") {
    return AGRICULTURAL_ANSWER_SHAPE;
  }
  return AGRICULTURAL_ANSWER_SHAPE;
}
