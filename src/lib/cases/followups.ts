import type { CropCaseRecord } from "./types";
import { isBusinessIntent, isCalculationIntent, type IntentCategory } from "@/lib/assistant/intents";

export const FOLLOWUP_PROMPT = "How is the crop doing since we last checked it?";
export const FOLLOWUP_OPTIONS = [
  "Improved",
  "About the same",
  "Worse",
  "Solved",
] as const;

export type FollowUpChannel = "in_app" | "notification" | "email" | "whatsapp" | "sms";

export function followUpPromptForCase(
  record: Pick<CropCaseRecord, "crop" | "symptoms" | "problemCategory" | "farmerProblemText">,
): string {
  const crop = record.crop?.trim() || "crop";
  const symptom =
    record.symptoms[0] ||
    record.problemCategory?.replace(/_/g, " ") ||
    null;
  if (symptom) {
    return `How is your ${crop} doing since we last checked the ${symptom}?`;
  }
  return `How is your ${crop} doing since we last checked it?`;
}

export function shouldScheduleFollowUp(record: Pick<
  CropCaseRecord,
  "caseType" | "conversationIntent" | "crop" | "symptoms" | "severity" | "humanEscalation"
>): boolean {
  const intent = record.conversationIntent as IntentCategory | null;
  if (record.caseType === "farm_business" || record.caseType === "calculation") {
    return false;
  }
  if (intent && (isBusinessIntent(intent) || isCalculationIntent(intent))) {
    return false;
  }
  if (intent === "general_agriculture" && !record.crop && record.symptoms.length === 0) {
    return false;
  }
  return Boolean(record.crop || record.symptoms.length > 0 || record.humanEscalation);
}

export function followUpDelayDays(
  severity: CropCaseRecord["severity"],
  options?: { nutrition?: boolean; longRunning?: boolean },
): number {
  if (options?.longRunning) return 7;
  if (options?.nutrition) return 6;
  if (severity === "high") return 1;
  if (severity === "medium") return 3;
  if (severity === "low") return 6;
  return 3;
}

export function scheduleFollowUpDate(
  severity: CropCaseRecord["severity"],
  from = new Date(),
  longRunning = false,
): string {
  const days = followUpDelayDays(severity, { longRunning });
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
  if (
    lower === "problem solved" ||
    lower === "problem_solved" ||
    lower === "solved"
  ) {
    return "problem_solved";
  }
  return null;
}

export function followUpStatusLabel(options: {
  outcome: string | null;
  optedOut: boolean;
  followUpDate: string;
  askedAt: string | null;
}): "follow-up due" | "completed" | "no response" | "improved" | "same" | "worse" | "solved" {
  if (options.outcome === "improved") return "improved";
  if (options.outcome === "about_the_same") return "same";
  if (options.outcome === "worse") return "worse";
  if (options.outcome === "problem_solved") return "solved";
  if (options.optedOut) return "no response";
  if (options.askedAt && !options.outcome) return "no response";
  if (!options.outcome && new Date(options.followUpDate).getTime() <= Date.now()) {
    return "follow-up due";
  }
  if (options.outcome) return "completed";
  return "follow-up due";
}
