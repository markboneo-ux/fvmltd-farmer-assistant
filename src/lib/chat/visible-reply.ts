import type { AgronomicCasePayload } from "@/lib/agronomy/case-schema";
import { isGuidanceStage } from "@/lib/agronomy/case-schema";
import { isDiagnosticIntent, type IntentCategory } from "@/lib/assistant/intents";
import { SPRAY_NEEDED_HEADING } from "@/lib/agronomy/chemical-guidance";

/**
 * Farmer-visible assistant text: conversational prose, no questionnaire chrome.
 */
export function stripGuidancePrefix(text: string): string {
  return text.replace(/^preliminary guidance:\s*/i, "").trim();
}

export function visibleAdmittedCauses(payload: AgronomicCasePayload) {
  return payload.admittedCauses ?? [];
}

export function buildFarmerVisibleReply(payload: AgronomicCasePayload): string {
  const assessment = stripGuidancePrefix(payload.preliminaryAssessment);
  const question = payload.nextQuestion.trim();
  const spray = payload.sprayGuidanceText?.trim() || "";
  const sprayBlock = spray
    ? (assessment.toLowerCase().includes("if a spray is needed")
        ? ""
        : `${SPRAY_NEEDED_HEADING}\n${spray}`)
    : "";

  const parts = [assessment];
  if (sprayBlock && !assessment.toLowerCase().includes("if a spray is needed")) {
    parts.push(sprayBlock);
  }
  if (question && question !== assessment) {
    parts.push(question);
  }

  return parts.filter(Boolean).join("\n\n");
}

/**
 * Text the farmer actually sees in ChatAssistantMessage, including diagnosis sections.
 * Tests must assert this payload, not internal likelyCauses alone.
 */
export function farmerRenderedAnswer(payload: AgronomicCasePayload): string {
  const admitted = visibleAdmittedCauses(payload);
  const useDiagnosis =
    shouldUseDiagnosisLayout(payload) || admitted.length > 0;
  if (!useDiagnosis) {
    return buildFarmerVisibleReply(payload);
  }

  const parts: string[] = ["What I think is happening"];
  const assessment = stripGuidancePrefix(payload.preliminaryAssessment);
  if (admitted.length > 0) {
    parts.push(admitted.map((cause) => cause.label).join("\n"));
  }
  parts.push(payload.diagnosisWhy || assessment);
  if (admitted.length > 0) {
    parts.push("Possible causes, ranked");
    parts.push(
      admitted
        .slice(0, 3)
        .map((cause) => `${cause.label}. More likely if ${cause.increasesIf.toLowerCase()}`)
        .join("\n"),
    );
  }
  if (payload.checksToday.length > 0) {
    parts.push("Check this now");
    parts.push(payload.checksToday.join("\n"));
  }
  if (payload.safeActionsNow.length > 0) {
    parts.push("What to do now");
    parts.push(payload.safeActionsNow.join("\n"));
  }
  if (payload.actionsToAvoid.length > 0) {
    parts.push("What not to do");
    parts.push(payload.actionsToAvoid.join("\n"));
  }
  const spray = payload.sprayGuidanceText?.trim() || "";
  if (spray) {
    parts.push(SPRAY_NEEDED_HEADING);
    parts.push(spray);
  }
  if ((payload.whatWouldChangeDiagnosis ?? []).length > 0) {
    parts.push("What would change my diagnosis");
    parts.push((payload.whatWouldChangeDiagnosis ?? []).join("\n"));
  }
  if (payload.monitorNext) {
    parts.push("What to watch over the next 2–3 days");
    parts.push(payload.monitorNext);
  }
  if (payload.weatherBrief) parts.push(payload.weatherBrief);
  for (const risk of payload.weatherRisks ?? []) {
    parts.push(`Conditions may favour ${risk.diseaseOrPest} over the ${risk.riskWindow}.`);
  }
  if (payload.nextQuestion.trim()) parts.push(payload.nextQuestion.trim());
  return parts.filter(Boolean).join("\n");
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
    (payload.admittedCauses ?? []).length > 0 ||
    (payload.likelyCauses ?? []).length > 0
  );
}

export function farmerHistoryContent(payload: AgronomicCasePayload): string {
  const admitted = visibleAdmittedCauses(payload);
  const lines = [buildFarmerVisibleReply(payload)];

  if (admitted.length > 0) {
    lines.push(`Most likely: ${admitted.map((cause) => cause.label).join("; ")}`);
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
  if (payload.sprayGuidanceText?.trim()) {
    const blob = lines.join("\n");
    if (!/if a spray is needed/i.test(blob)) {
      lines.push(`${SPRAY_NEEDED_HEADING}: ${payload.sprayGuidanceText.trim()}`);
    }
  }

  return lines.filter(Boolean).join("\n");
}
