import type { AgronomicCasePayload } from "@/lib/agronomy/case-schema";
import { isGuidanceStage } from "@/lib/agronomy/case-schema";
import { isDiagnosticIntent, type IntentCategory } from "@/lib/assistant/intents";

/**
 * Farmer-visible assistant text: conversational prose, no questionnaire chrome.
 */
export function stripGuidancePrefix(text: string): string {
  return text.replace(/^preliminary guidance:\s*/i, "").trim();
}

export function buildFarmerVisibleReply(payload: AgronomicCasePayload): string {
  const assessment = stripGuidancePrefix(payload.preliminaryAssessment);
  const question = payload.nextQuestion.trim();

  if (assessment && question && assessment !== question) {
    return `${assessment}\n\n${question}`;
  }

  return assessment || question;
}

export function shouldUseDiagnosisLayout(payload: AgronomicCasePayload): boolean {
  const intent = payload.intent as IntentCategory | undefined;
  if (intent && !isDiagnosticIntent(intent)) {
    return false;
  }

  if (!isGuidanceStage(payload.stage) && payload.stage !== "questioning") {
    return false;
  }

  return (
    payload.checksToday.length > 0 ||
    payload.safeActionsNow.length > 0 ||
    (payload.likelyCauses ?? []).length > 0
  );
}

export function farmerHistoryContent(payload: AgronomicCasePayload): string {
  const lines = [buildFarmerVisibleReply(payload)];

  if ((payload.likelyCauses ?? []).length > 0) {
    lines.push(`Most likely: ${(payload.likelyCauses ?? []).join("; ")}`);
  }
  if (payload.checksToday.length > 0) {
    lines.push(`What to check: ${payload.checksToday.join("; ")}`);
  }
  if (payload.safeActionsNow.length > 0) {
    lines.push(`What I would do next: ${payload.safeActionsNow.join("; ")}`);
  }
  if ((payload.whatWouldChangeDiagnosis ?? []).length > 0) {
    lines.push(
      `What would change this: ${(payload.whatWouldChangeDiagnosis ?? []).join("; ")}`,
    );
  }
  if (payload.verifiedInputOptions.length > 0) {
    lines.push(
      `Verified local options: ${payload.verifiedInputOptions
        .map((option) => option.activeIngredientOrNutrient)
        .join("; ")}`,
    );
  }

  return lines.filter(Boolean).join("\n");
}
