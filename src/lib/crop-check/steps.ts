import {
  GUIDED_QUESTION_STEPS,
  type GuidedQuestionStep,
} from "./types";

export type StepPrompt = {
  assistantText: string;
  inputKind:
    | "choice"
    | "text"
    | "textarea"
    | "date"
    | "number"
    | "boolean"
    | "none";
};

export function nextGuidedStep(
  current: GuidedQuestionStep,
): GuidedQuestionStep {
  const index = GUIDED_QUESTION_STEPS.indexOf(current);
  if (index < 0 || index >= GUIDED_QUESTION_STEPS.length - 1) {
    return "completed";
  }
  return GUIDED_QUESTION_STEPS[index + 1]!;
}

export function promptForStep(
  step: GuidedQuestionStep,
  cropName: string,
): StepPrompt {
  switch (step) {
    case "problem_description":
      return {
        assistantText: `What problem are you seeing on your ${cropName.toLowerCase()}? Describe the symptoms in your own words.`,
        inputKind: "textarea",
      };
    case "first_observed_on":
      return {
        assistantText: "When did you first notice this problem?",
        inputKind: "date",
      };
    case "symptom_location":
      return {
        assistantText:
          "Where did the symptoms begin — young leaves, old leaves, fruit, stem, roots, or the whole plant?",
        inputKind: "choice",
      };
    case "is_spreading":
      return {
        assistantText: "Is the problem spreading to more plants or more of the crop?",
        inputKind: "boolean",
      };
    case "percent_affected":
      return {
        assistantText:
          "Roughly what percentage of the crop is affected? Enter a number from 0 to 100.",
        inputKind: "number",
      };
    case "recent_fertilizer":
      return {
        assistantText:
          "Have you applied any fertilizer recently? If yes, what and when? If none, write “None”.",
        inputKind: "textarea",
      };
    case "recent_spray":
      return {
        assistantText:
          "Have you sprayed anything recently (pesticide, fungicide, or foliar feed)? If none, write “None”.",
        inputKind: "textarea",
      };
    case "irrigation_frequency":
      return {
        assistantText: "How often do you irrigate this crop?",
        inputKind: "choice",
      };
    case "drainage_condition":
      return {
        assistantText: "How is the drainage on this plot right now?",
        inputKind: "choice",
      };
    case "recent_heavy_rainfall":
      return {
        assistantText: "Has there been heavy rainfall recently?",
        inputKind: "boolean",
      };
    case "photos":
      return {
        assistantText:
          "Next, add the required crop photographs. You may skip a photo if you cannot take it, but missing required photos will be listed clearly.",
        inputKind: "none",
      };
    case "completed":
      return {
        assistantText:
          "Thanks — your crop check and photographs are saved. AI diagnosis is not connected yet. You can return to your dashboard.",
        inputKind: "none",
      };
  }
}

export function labelForAnswer(
  step: GuidedQuestionStep,
  value: string | boolean | number,
): string {
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (step === "symptom_location") {
    const map: Record<string, string> = {
      young_leaves: "Young leaves",
      old_leaves: "Old leaves",
      fruit: "Fruit",
      stem: "Stem",
      roots: "Roots",
      whole_plant: "Whole plant",
    };
    return map[String(value)] ?? String(value);
  }
  if (step === "irrigation_frequency") {
    const map: Record<string, string> = {
      daily: "Daily",
      every_2_3_days: "Every 2–3 days",
      weekly: "Weekly",
      rarely: "Rarely",
      rainfed_only: "Rainfed only",
      unknown: "Not sure",
    };
    return map[String(value)] ?? String(value);
  }
  if (step === "drainage_condition") {
    const map: Record<string, string> = {
      well_drained: "Well drained",
      moderately_drained: "Moderately drained",
      poorly_drained: "Poorly drained",
      waterlogged: "Waterlogged",
      unknown: "Not sure",
    };
    return map[String(value)] ?? String(value);
  }
  if (step === "percent_affected") {
    return `${value}%`;
  }
  return String(value);
}
