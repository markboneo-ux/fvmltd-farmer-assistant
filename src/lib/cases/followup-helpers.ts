import { addCaseFollowup, listFollowups } from "./store";
import { scheduleFollowUpDate, shouldScheduleFollowUp } from "./followups";
import type { CropCaseRecord } from "./types";

export { scheduleFollowUpDate, shouldScheduleFollowUp } from "./followups";

export async function addCaseFollowupSafe(record: CropCaseRecord) {
  if (!shouldScheduleFollowUp(record)) return null;
  const existing = await listFollowups(record.id);
  if (existing.some((item) => !item.outcome && !item.optedOut)) return existing[0];
  const nutrition =
    record.conversationIntent === "nutrition" || record.problemCategory === "nutrient";
  const longRunning = nutrition || record.severity === "low";
  return addCaseFollowup({
    caseId: record.id,
    userId: record.userId,
    anonymousSessionId: record.anonymousSessionId,
    followUpDate: scheduleFollowUpDate(record.severity, new Date(), longRunning),
    askedAt: null,
    outcome: null,
    actionTaken: null,
    notes: null,
    followUpPhotoId: null,
    newSeverity: null,
    optedOut: false,
  });
}
