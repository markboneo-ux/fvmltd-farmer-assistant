import type { AgronomicCasePayload } from "@/lib/agronomy/case-schema";
import { isGuidanceStage } from "@/lib/agronomy/case-schema";

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
  if (!isGuidanceStage(payload.stage) && payload.stage !== "questioning") {
    return false;
  }

  return (
    payload.checksToday.length > 0 ||
    payload.safeActionsNow.length > 0 ||
    (isGuidanceStage(payload.stage) &&
      payload.preliminaryAssessment.trim().length > 40)
  );
}

export function farmerHistoryContent(payload: AgronomicCasePayload): string {
  const lines = [buildFarmerVisibleReply(payload)];

  if (payload.checksToday.length > 0) {
    lines.push(`What to check: ${payload.checksToday.join("; ")}`);
  }
  if (payload.safeActionsNow.length > 0) {
    lines.push(`What I would do next: ${payload.safeActionsNow.join("; ")}`);
  }
  if (payload.weatherRisks.length > 0) {
    lines.push(
      `Weather risk noted (not a diagnosis): ${payload.weatherRisks
        .map((risk) => `${risk.riskLevel} ${risk.diseaseOrPest}`)
        .join("; ")}`,
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
