import type { CropCaseRecord } from "./types";

export const FOLLOWUP_PROMPT = "How is the crop doing since we last checked it?";
export const FOLLOWUP_OPTIONS = [
  "Improved",
  "About the same",
  "Worse",
  "Problem solved",
] as const;

export function followUpDelayDays(severity: CropCaseRecord["severity"], longRunning = false): number {
  if (longRunning) return 7;
  if (severity === "high") return 2;
  if (severity === "medium") return 4;
  if (severity === "low") return 7;
  return 5;
}

export function scheduleFollowUpDate(
  severity: CropCaseRecord["severity"],
  from = new Date(),
  longRunning = false,
): string {
  const days = followUpDelayDays(severity, longRunning);
  const date = new Date(from);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

export function parseFollowUpOutcome(value: string):
  | "improved"
  | "about_the_same"
  | "worse"
  | "problem_solved"
  | null {
  const lower = value.trim().toLowerCase();
  if (lower === "improved") return "improved";
  if (lower === "about the same" || lower === "about_the_same" || lower === "same") {
    return "about_the_same";
  }
  if (lower === "worse") return "worse";
  if (lower === "problem solved" || lower === "problem_solved" || lower === "solved") {
    return "problem_solved";
  }
  return null;
}
