/**
 * Centralized controlled-beta usage limits.
 * Do not scatter these numbers through client components.
 * Admins can override via app_settings / env; defaults stay here.
 */

export type UsageLimitKey =
  | "guest_max_messages"
  | "guest_max_cases"
  | "guest_max_image_analyses"
  | "registered_free_messages"
  | "registered_free_cases"
  | "registered_free_images";

export type UsageLimits = Record<UsageLimitKey, number>;

export const DEFAULT_USAGE_LIMITS: UsageLimits = {
  guest_max_messages: 20,
  guest_max_cases: 3,
  guest_max_image_analyses: 6,
  registered_free_messages: 80,
  registered_free_cases: 10,
  registered_free_images: 24,
};

export type AccessState =
  | "guest"
  | "free_registered"
  | "trial"
  | "promo"
  | "paid";

export type UsageKind = "message" | "case" | "image_analysis";

export type UsageSnapshot = {
  messages: number;
  cases: number;
  imageAnalyses: number;
};

let runtimeOverrides: Partial<UsageLimits> = {};

export function setUsageLimitOverrides(overrides: Partial<UsageLimits> | null) {
  runtimeOverrides = overrides ?? {};
}

export function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/**
 * Resolve limits from (1) test/runtime overrides, (2) env, (3) defaults.
 * Database overlays are merged by the caller after fetch.
 */
export function getUsageLimits(dbOverlay?: Partial<UsageLimits> | null): UsageLimits {
  const envOverlay: Partial<UsageLimits> = {
    guest_max_messages: parsePositiveInt(
      process.env.FVM_GUEST_MAX_MESSAGES,
      DEFAULT_USAGE_LIMITS.guest_max_messages,
    ),
    guest_max_cases: parsePositiveInt(
      process.env.FVM_GUEST_MAX_CASES,
      DEFAULT_USAGE_LIMITS.guest_max_cases,
    ),
    guest_max_image_analyses: parsePositiveInt(
      process.env.FVM_GUEST_MAX_IMAGE_ANALYSES,
      DEFAULT_USAGE_LIMITS.guest_max_image_analyses,
    ),
    registered_free_messages: parsePositiveInt(
      process.env.FVM_REGISTERED_FREE_MESSAGES,
      DEFAULT_USAGE_LIMITS.registered_free_messages,
    ),
    registered_free_cases: parsePositiveInt(
      process.env.FVM_REGISTERED_FREE_CASES,
      DEFAULT_USAGE_LIMITS.registered_free_cases,
    ),
    registered_free_images: parsePositiveInt(
      process.env.FVM_REGISTERED_FREE_IMAGES,
      DEFAULT_USAGE_LIMITS.registered_free_images,
    ),
  };

  return {
    ...DEFAULT_USAGE_LIMITS,
    ...envOverlay,
    ...(dbOverlay ?? {}),
    ...runtimeOverrides,
  };
}

export function limitsForAccess(access: AccessState, limits = getUsageLimits()): UsageSnapshot {
  if (access === "promo" || access === "paid" || access === "trial") {
    return { messages: Number.MAX_SAFE_INTEGER, cases: Number.MAX_SAFE_INTEGER, imageAnalyses: Number.MAX_SAFE_INTEGER };
  }
  if (access === "free_registered") {
    return {
      messages: limits.registered_free_messages,
      cases: limits.registered_free_cases,
      imageAnalyses: limits.registered_free_images,
    };
  }
  return {
    messages: limits.guest_max_messages,
    cases: limits.guest_max_cases,
    imageAnalyses: limits.guest_max_image_analyses,
  };
}

export type UsageDecision =
  | { ok: true; approaching: boolean; remaining: UsageSnapshot }
  | {
      ok: false;
      reason: "guest_limit" | "registered_free_limit";
      remaining: UsageSnapshot;
      allowFinishActiveCase: boolean;
    };

export function evaluateUsage(options: {
  access: AccessState;
  used: UsageSnapshot;
  next: UsageKind;
  activeCaseInProgress?: boolean;
  limits?: UsageLimits;
}): UsageDecision {
  const caps = limitsForAccess(options.access, options.limits ?? getUsageLimits());
  const remaining: UsageSnapshot = {
    messages: Math.max(0, caps.messages - options.used.messages),
    cases: Math.max(0, caps.cases - options.used.cases),
    imageAnalyses: Math.max(0, caps.imageAnalyses - options.used.imageAnalyses),
  };

  if (options.access === "promo" || options.access === "paid" || options.access === "trial") {
    return { ok: true, approaching: false, remaining };
  }

  const wouldExceed =
    (options.next === "message" && remaining.messages <= 0) ||
    (options.next === "case" && remaining.cases <= 0) ||
    (options.next === "image_analysis" && remaining.imageAnalyses <= 0);

  if (wouldExceed) {
    return {
      ok: false,
      reason: options.access === "guest" ? "guest_limit" : "registered_free_limit",
      remaining,
      allowFinishActiveCase: Boolean(options.activeCaseInProgress && options.next !== "case"),
    };
  }

  const approaching =
    remaining.messages <= 3 || remaining.cases <= 1 || remaining.imageAnalyses <= 1;

  return { ok: true, approaching, remaining };
}

export const GUEST_LIMIT_MESSAGE =
  "Create a free account to keep your crop history and continue using FVM Crop Solution.";

export const REGISTERED_LIMIT_HEADING = "Continue with FVM Crop Solution";

export const UPGRADE_COMING_SOON = "Paid plans are coming soon.";

export const FARMER_GENERIC_ERROR =
  "I couldn’t finish that just now. Please send the question again.";
export const FARMER_WEB_LOOKUP_FAILED =
  "I couldn't complete the online lookup, but I can still help based on the information you've given me.";
/** Shown only when the agronomic answer was produced but crop_cases / case_messages did not save. */
export const FARMER_PERSISTENCE_DEGRADED =
  "I have an answer for you. Saving this chat for later failed — you can copy it if you need it.";
