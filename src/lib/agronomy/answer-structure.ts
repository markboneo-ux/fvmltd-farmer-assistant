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
6. SPRAY OPTIONS — omit this heading entirely unless the farmer asked about spraying, treatment, or chemical control. Never write the words "IF A SPRAY IS NEEDED". Never invent a spray section. Never name mancozeb, chlorothalonil, or copper spray classes unless the farmer asked for a spray and spots or an observed pest justify it. Never discuss fungal-vs-bacterial spot sprays unless spots were reported or seen.
7. WEATHER EFFECT — only if weather changes a ranking or a decision (wetness, spray timing, heat, dry). Do not append a generic "wet weather increases disease pressure" line.
8. WHAT WOULD CHANGE MY ASSESSMENT
9. ONE NEXT QUESTION or ONE SPECIFIC PHOTO REQUEST

Fill checksToday and safeActionsNow with the same unique points — do not write a second copy in the prose if those arrays are populated.
Use Integrated Pest Management: cultural/physical, then biological, then chemical when justified.
At low confidence, investigate before recommending pulling plants, dumping crop, or a high-risk spray.
Keep language simple and practical.
If the farmer described curling and yellowing without spots, do not name Cercospora, frogeye, bacterial leaf spot, pale-centred spots, greasy or water-soaked lesions, or fungal-versus-bacterial sprays.`;

export const AGRICULTURAL_ANSWER_SHAPE_NO_SPRAY = `Write ONE coherent farmer-facing answer in preliminaryAssessment. Do not repeat the same guidance in paragraphs and again as cards.

Use this order, skipping any heading that adds no value. Plain sentences, no markdown headings:

1. WHAT I THINK IS MOST LIKELY
2. WHY
3. OTHER POSSIBILITIES — only if genuinely unresolved
4. CHECK THIS NOW
5. WHAT TO DO TODAY — low-risk actions first. Do not automatically say to remove leaves or plants.
6. WEATHER EFFECT — only if weather changes a ranking or a decision. Skip if it does not.
7. WHAT WOULD CHANGE MY ASSESSMENT
8. ONE NEXT QUESTION or ONE SPECIFIC PHOTO REQUEST

Do not write "IF A SPRAY IS NEEDED". Do not name mancozeb, chlorothalonil, copper spray classes, Cercospora, frogeye, bacterial leaf spot, pale-centred, greasy, or water-soaked language unless the farmer reported spots or lesions.
Fill checksToday and safeActionsNow with unique points.
Keep language simple and practical.`;

export function answerShapeForIntent(
  intent: IntentCategory,
  mode?: AgronomicMode | null,
  options?: { asksForSpray?: boolean },
): string {
  const shape =
    options?.asksForSpray === false ? AGRICULTURAL_ANSWER_SHAPE_NO_SPRAY : AGRICULTURAL_ANSWER_SHAPE;
  if (isCalculationIntent(intent)) {
    return "Answer the calculation directly and briefly. Show the working. Do not use a diagnosis card.";
  }
  if (isBusinessIntent(intent)) {
    return "This is farm business, not crop diagnosis. Ask only missing numbers. Never invent assumptions without labelling them.";
  }
  if (mode === "OBSERVED_PEST_MANAGEMENT") {
    return `${shape}

This is pest management, not a cause-ranking case. Do not show generic abiotic causes.`;
  }
  if (isDiagnosticIntent(intent) || intent === "general_agriculture") {
    return shape;
  }
  return shape;
}
