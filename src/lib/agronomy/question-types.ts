/**
 * Deterministic quick-reply catalogues keyed by questionType.
 * Client must only render replies when questionId matches the active question.
 */

export const QUESTION_TYPES = [
  "field_distribution",
  "soil_type",
  "drainage",
  "production_system",
  "symptom_location",
  "lesion_appearance",
  "recent_spray",
  "photo_request",
  "guidance_followup",
  "open",
] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];

export function isQuestionType(value: unknown): value is QuestionType {
  return (
    typeof value === "string" &&
    (QUESTION_TYPES as readonly string[]).includes(value)
  );
}

/** Deterministic options for common interview question types. */
export const QUICK_REPLIES_BY_TYPE: Record<QuestionType, string[]> = {
  field_distribution: [
    "Few plants",
    "Patches",
    "Most of field",
    "Not sure",
  ],
  soil_type: [
    "Clay",
    "Loam",
    "Sandy",
    "Raised-bed mix",
    "Soilless medium",
    "Not sure",
  ],
  drainage: [
    "Drains quickly",
    "Stays wet about 1 day",
    "Stays wet 2–3 days",
    "Water remains longer",
    "Not sure",
  ],
  production_system: [
    "Open field",
    "Greenhouse",
    "Shade house",
    "Hydroponic",
    "Other",
  ],
  symptom_location: [
    "Lower leaves",
    "New leaves",
    "Whole plant",
    "Fruit",
    "Roots or stem base",
    "Not sure",
  ],
  lesion_appearance: [
    "Small dark-centred spots",
    "Rings / target-like spots",
    "Water-soaked spots",
    "Something else",
    "Not sure",
  ],
  recent_spray: [
    "No sprays",
    "Insecticide",
    "Fungicide",
    "Fertilizer spray",
    "Not sure",
  ],
  photo_request: ["Upload a photo", "Skip photo for now", "Start full crop check"],
  guidance_followup: [
    "Upload a photo",
    "Start full crop check",
  ],
  open: [],
};

/**
 * Infer questionType from the question text when the model omits or invents one.
 */
export function inferQuestionType(question: string): QuestionType {
  const q = question.toLowerCase();

  if (
    /\b(dark\s+centres?|dark\s+centers?|rings?|target-?like|water-?soaked|concentric)\b/.test(q) &&
    /\b(spots?|lesions?)\b/.test(q)
  ) {
    return "lesion_appearance";
  }

  if (
    /\b(few\s+plants|patches|most\s+of\s+(the\s+)?field|how\s+many\s+plants|which\s+parts?\s+of\s+the\s+field|how\s+widespread)\b/.test(
      q,
    )
  ) {
    return "field_distribution";
  }

  if (/\b(soil\s+type|what\s+soil|growing\s+medium|soilless)\b/.test(q)) {
    return "soil_type";
  }

  if (/\b(drain|drainage|stays\s+wet|waterlog|how\s+long.*wet)\b/.test(q)) {
    return "drainage";
  }

  if (
    /\b(open\s+field|greenhouse|shade\s*house|hydroponic|production\s+system|growing\s+(system|environment))\b/.test(
      q,
    )
  ) {
    return "production_system";
  }

  if (
    /\b(lower\s+leaves|new\s+leaves|where\s+(on\s+the\s+plant|are\s+the\s+symptoms)|symptom\s+location|roots?\s+or\s+stem)\b/.test(
      q,
    )
  ) {
    return "symptom_location";
  }

  if (/\b(spray|sprayed|insecticide|fungicide).{0,40}\b(day|week|seven)\b/.test(q) ||
      /\bwhat\s+have\s+you\s+sprayed\b/.test(q)) {
    return "recent_spray";
  }

  if (/\b(upload|send|take)\b.{0,20}\bphoto\b|\bphoto\b.{0,20}\b(upload|send|clear)\b/.test(q)) {
    return "photo_request";
  }

  return "open";
}

export function quickRepliesForType(questionType: QuestionType): string[] {
  return [...QUICK_REPLIES_BY_TYPE[questionType]];
}

/** Buttons derived from the exact follow-up question, never from a stale type. */
export function quickRepliesForQuestion(question: string): string[] {
  const type = inferQuestionType(question);
  return quickRepliesForType(type);
}

function catalogueForReplies(replies: string[]): QuestionType | null {
  const normalized = replies.map((item) => item.trim().toLowerCase()).filter(Boolean);
  if (normalized.length === 0) return null;
  for (const type of QUESTION_TYPES) {
    if (type === "open") continue;
    const catalogue = QUICK_REPLIES_BY_TYPE[type].map((item) => item.toLowerCase());
    if (catalogue.length === 0) continue;
    const overlap = normalized.filter((item) => catalogue.includes(item)).length;
    if (overlap >= Math.min(3, catalogue.length) && overlap >= Math.ceil(normalized.length * 0.6)) {
      return type;
    }
  }
  return null;
}

export function repliesMatchQuestion(question: string, replies: string[]): boolean {
  const trimmed = question.trim();
  if (!trimmed) return replies.length === 0;
  const inferred = inferQuestionType(trimmed);
  const expected = quickRepliesForQuestion(trimmed);
  const catalogue = catalogueForReplies(replies);

  if (catalogue && inferred !== "open" && catalogue !== inferred) {
    return false;
  }
  if (catalogue && inferred === "open") {
    return false;
  }
  if (expected.length === 0) {
    return catalogue == null;
  }
  if (replies.length === 0) return false;
  const expectedSet = new Set(expected.map((item) => item.toLowerCase()));
  const overlap = replies.filter((item) => expectedSet.has(item.trim().toLowerCase())).length;
  return overlap >= Math.min(2, expected.length);
}

/**
 * If the final question and chips disagree, regenerate only the chips.
 */
export function reconcileQuickReplies(options: {
  question: string;
  quickReplies?: string[] | null;
  questionType?: QuestionType | "" | null;
}): { questionType: QuestionType | ""; quickReplies: string[] } {
  const question = options.question.trim();
  if (!question) {
    return {
      questionType: options.questionType ?? "",
      quickReplies: [...(options.quickReplies ?? [])],
    };
  }

  const inferred = inferQuestionType(question);
  const derived = quickRepliesForQuestion(question);
  const incoming = [...(options.quickReplies ?? [])];

  if (repliesMatchQuestion(question, incoming) && incoming.length > 0) {
    return {
      questionType: inferred !== "open" ? inferred : options.questionType || inferred,
      quickReplies: incoming,
    };
  }

  return {
    questionType: inferred,
    quickReplies: derived,
  };
}

/** Stable id for a question turn — used by the client to drop stale buttons. */
export function buildQuestionId(
  questionType: QuestionType,
  questionsAsked: number,
): string {
  return `q_${questionsAsked}_${questionType}`;
}
