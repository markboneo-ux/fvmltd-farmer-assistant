/**
 * Caribbean agriculture speech hints for transcription.
 * These are vocabulary/context cues — not diagnosis mappings.
 */

export const CARIBBEAN_AG_VOCABULARY = [
  "melongene",
  "baingan",
  "pimento",
  "bodi",
  "bora",
  "dasheen",
  "eddoes",
  "ochro",
  "okra",
  "callaloo",
  "patchoi",
  "patch",
  "sweet pepper",
  "hot pepper",
  "chive",
  "shadow beni",
  "celery",
  "lettuce",
  "cassava",
  "plantain",
  "fig",
  "cocoa",
  "citrus",
  "spray",
  "burn up",
  "burning",
  "dropping",
  "catching",
  "bearing",
  "whitefly",
  "whiteflies",
  "blight",
  "wilt",
  "stunted",
  "Couva",
  "Chaguanas",
  "Berbice",
  "Grenada",
  "Trinidad",
  "Tobago",
  "Guyana",
  "St Lucia",
] as const;

export const CARIBBEAN_SPEECH_TRANSCRIPTION_PROMPT = [
  "Caribbean farmer speaking about crops, pests, weather, and field work.",
  "Keep local agricultural words as spoken. Do not replace them with unrelated crop names.",
  "Vocabulary that may appear:",
  CARIBBEAN_AG_VOCABULARY.join(", "),
  "Words such as patch, spray, burn up, dropping, catching, and bearing are ordinary farm speech.",
  "Do not invent a crop. Do not assume tomato unless the speaker said tomato or tomatoes.",
].join(" ");

export const MAX_VOICE_SECONDS = 60;
