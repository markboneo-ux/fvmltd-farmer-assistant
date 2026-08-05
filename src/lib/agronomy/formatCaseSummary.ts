import type { AgronomicCasePayload } from "./case-schema";

/**
 * Builds a plain-text assistant line for conversation history / previous_response_id fallback.
 * Includes internal notes for the model; the farmer UI never renders this string.
 * No Markdown markers.
 */
export function formatCaseAsPlainText(payload: AgronomicCasePayload): string {
  const lines: string[] = [
    `Mode: ${payload.mode}`,
    `Stage: ${payload.stage}`,
    `Severity: ${payload.severity}`,
    `Assessment: ${payload.preliminaryAssessment}`,
  ];

  if (payload.nextQuestion) {
    lines.push(`Next question: ${payload.nextQuestion}`);
  }

  if (payload.quickReplies.length > 0) {
    lines.push(`Quick replies: ${payload.quickReplies.join("; ")}`);
  }

  if (payload.checksToday.length > 0) {
    lines.push(`Checks today: ${payload.checksToday.join("; ")}`);
  }

  if (payload.safeActionsNow.length > 0) {
    lines.push(`Safe actions now: ${payload.safeActionsNow.join("; ")}`);
  }

  if (payload.actionsToAvoid.length > 0) {
    lines.push(`Actions to avoid: ${payload.actionsToAvoid.join("; ")}`);
  }

  lines.push(`Photo recommended: ${payload.photoRecommended ? "yes" : "no"}`);
  lines.push(
    `Escalation recommended: ${payload.escalationRecommended ? "yes" : "no"}`,
  );

  // History-only — never shown in farmer UI components.
  if (payload.internalMissingInformation.length > 0) {
    lines.push(
      `Internal missing: ${payload.internalMissingInformation.join("; ")}`,
    );
  }

  return lines.join("\n");
}
