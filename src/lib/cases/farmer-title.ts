import type { CropCaseRecord } from "./types";

function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function farmerCaseTitle(record: Pick<CropCaseRecord, "crop" | "problemCategory" | "farmerProblemText">): string {
  const crop = titleCase(record.crop?.trim() || "") || "Unknown";
  const issue =
    titleCase(record.problemCategory || "") ||
    titleCase((record.farmerProblemText || "").split(/[.?!]/)[0] || "").slice(0, 42) ||
    "Crop check";
  return `${crop} — ${issue}`;
}

export function farmerCaseDateLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });
}
