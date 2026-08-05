import type { AgronomicCasePayload } from "./case-schema";

/**
 * Builds a plain-text assistant line for conversation history / previous_response_id fallback.
 * No Markdown markers.
 */
export function formatCaseAsPlainText(payload: AgronomicCasePayload): string {
  const lines: string[] = [
    `Stage: ${payload.stage}`,
    `Summary: ${payload.caseSummary}`,
  ];

  if (payload.nextQuestion) {
    lines.push(`Next question: ${payload.nextQuestion}`);
  }

  if (payload.missingCriticalInformation.length > 0) {
    lines.push(
      `Still needed: ${payload.missingCriticalInformation.join("; ")}`,
    );
  }

  if (payload.redFlags.length > 0) {
    lines.push(`Red flags: ${payload.redFlags.join("; ")}`);
  }

  if (payload.likelyCauses.length > 0) {
    lines.push(`Likely causes: ${payload.likelyCauses.join("; ")}`);
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

  if (payload.escalationReason) {
    lines.push(`Escalation: ${payload.escalationReason}`);
  }

  return lines.join("\n");
}
