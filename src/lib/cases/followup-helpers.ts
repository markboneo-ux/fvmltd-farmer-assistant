import { addCaseFollowup, listFollowups } from "./store";
import { scheduleFollowUpDate } from "./followups";
import type { CropCaseRecord } from "./types";

export { scheduleFollowUpDate } from "./followups";

export function addCaseFollowupSafe(record: CropCaseRecord) {
  const existing = listFollowups(record.id);
  if (existing.some((item) => !item.outcome && !item.optedOut)) return existing[0];
  return addCaseFollowup({
    caseId: record.id,
    userId: record.userId,
    anonymousSessionId: record.anonymousSessionId,
    followUpDate: scheduleFollowUpDate(record.severity),
    askedAt: null,
    outcome: null,
    actionTaken: null,
    notes: null,
    followUpPhotoId: null,
    newSeverity: null,
    optedOut: false,
  });
}
