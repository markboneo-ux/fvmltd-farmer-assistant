/**
 * Centralized controlled-beta usage limits.
 * Do not scatter these numbers through client components.
 * Admins can override via app_settings / env; defaults stay here.
 */

export type UsageLimitKey =
  | "guest_max_messages"
  | "guest_max_cases"
  | "guest_max_image_analyses"
  | "guest_max_voice_messages"
  | "registered_free_messages"
  | "registered_free_cases"
  | "registered_free_images"
  | "registered_free_voice"
  | "fvm_beta_messages"
  | "fvm_beta_cases"
  | "fvm_beta_image_analyses"
  | "fvm_beta_voice_messages";

export type UsageLimits = Record<UsageLimitKey, number>;

export const DEFAULT_USAGE_LIMITS: UsageLimits = {
  guest_max_messages: 20,
  guest_max_cases: 3,
  guest_max_image_analyses: 6,
  guest_max_voice_messages: 6,
  registered_free_messages: 80,
  registered_free_cases: 10,
  registered_free_images: 24,
  registered_free_voice: 24,
  fvm_beta_messages: 500,
  fvm_beta_cases: 50,
  fvm_beta_image_analyses: 100,
  fvm_beta_voice_messages: 100,
};

/** Stored access values. `promo` / `trial` are legacy aliases of FVM Beta. */
export type AccessState =
  | "guest"
  | "free_registered"
  | "fvm_beta"
  | "promo"
  | "trial"
  | "paid";

export type AccessTier = "GUEST" | "REGISTERED_FREE" | "FVM_BETA" | "PAID";

export type UsageKind = "message" | "case" | "image_analysis" | "voice";

export type UsageSnapshot = {
  messages: number;
  cases: number;
  imageAnalyses: number;
  voiceMessages: number;
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
    guest_max_voice_messages: parsePositiveInt(
      process.env.FVM_GUEST_MAX_VOICE_MESSAGES,
      DEFAULT_USAGE_LIMITS.guest_max_voice_messages,
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
    registered_free_voice: parsePositiveInt(
      process.env.FVM_REGISTERED_FREE_VOICE,
      DEFAULT_USAGE_LIMITS.registered_free_voice,
    ),
    fvm_beta_messages: parsePositiveInt(
      process.env.FVM_BETA_MESSAGES,
      DEFAULT_USAGE_LIMITS.fvm_beta_messages,
    ),
    fvm_beta_cases: parsePositiveInt(
      process.env.FVM_BETA_CASES,
      DEFAULT_USAGE_LIMITS.fvm_beta_cases,
    ),
    fvm_beta_image_analyses: parsePositiveInt(
      process.env.FVM_BETA_IMAGE_ANALYSES,
      DEFAULT_USAGE_LIMITS.fvm_beta_image_analyses,
    ),
    fvm_beta_voice_messages: parsePositiveInt(
      process.env.FVM_BETA_VOICE_MESSAGES,
      DEFAULT_USAGE_LIMITS.fvm_beta_voice_messages,
    ),
  };

  return {
    ...DEFAULT_USAGE_LIMITS,
    ...envOverlay,
    ...(dbOverlay ?? {}),
    ...runtimeOverrides,
  };
}

export function canonicalAccess(access: AccessState | string | null | undefined): AccessTier {
  if (access === "paid") return "PAID";
  if (access === "fvm_beta" || access === "promo" || access === "trial") return "FVM_BETA";
  if (access === "free_registered") return "REGISTERED_FREE";
  return "GUEST";
}

export function accessTierLabel(access: AccessState | string | null | undefined): string {
  switch (canonicalAccess(access)) {
    case "PAID":
      return "Paid";
    case "FVM_BETA":
      return "FVM Beta";
    case "REGISTERED_FREE":
      return "Registered free";
    default:
      return "Guest";
  }
}

export function emptyUsage(): UsageSnapshot {
  return { messages: 0, cases: 0, imageAnalyses: 0, voiceMessages: 0 };
}

export function withUsageDefaults(used?: Partial<UsageSnapshot> | null): UsageSnapshot {
  return {
    messages: used?.messages ?? 0,
    cases: used?.cases ?? 0,
    imageAnalyses: used?.imageAnalyses ?? 0,
    voiceMessages: used?.voiceMessages ?? 0,
  };
}

export function limitsForAccess(access: AccessState, limits = getUsageLimits()): UsageSnapshot {
  const tier = canonicalAccess(access);
  if (tier === "PAID") {
    return {
      messages: Number.MAX_SAFE_INTEGER,
      cases: Number.MAX_SAFE_INTEGER,
      imageAnalyses: Number.MAX_SAFE_INTEGER,
      voiceMessages: Number.MAX_SAFE_INTEGER,
    };
  }
  if (tier === "FVM_BETA") {
    return {
      messages: limits.fvm_beta_messages,
      cases: limits.fvm_beta_cases,
      imageAnalyses: limits.fvm_beta_image_analyses,
      voiceMessages: limits.fvm_beta_voice_messages,
    };
  }
  if (tier === "REGISTERED_FREE") {
    return {
      messages: limits.registered_free_messages,
      cases: limits.registered_free_cases,
      imageAnalyses: limits.registered_free_images,
      voiceMessages: limits.registered_free_voice,
    };
  }
  return {
    messages: limits.guest_max_messages,
    cases: limits.guest_max_cases,
    imageAnalyses: limits.guest_max_image_analyses,
    voiceMessages: limits.guest_max_voice_messages,
  };
}

export type UsageDecision =
  | { ok: true; approaching: boolean; remaining: UsageSnapshot }
  | {
      ok: false;
      reason: "guest_limit" | "registered_free_limit" | "fvm_beta_limit";
      remaining: UsageSnapshot;
      allowFinishActiveCase: boolean;
    };

export function evaluateUsage(options: {
  access: AccessState;
  used: Partial<UsageSnapshot>;
  next: UsageKind;
  activeCaseInProgress?: boolean;
  limits?: UsageLimits;
}): UsageDecision {
  const used = withUsageDefaults(options.used);
  const caps = limitsForAccess(options.access, options.limits ?? getUsageLimits());
  const remaining: UsageSnapshot = {
    messages: Math.max(0, caps.messages - used.messages),
    cases: Math.max(0, caps.cases - used.cases),
    imageAnalyses: Math.max(0, caps.imageAnalyses - used.imageAnalyses),
    voiceMessages: Math.max(0, caps.voiceMessages - used.voiceMessages),
  };

  const tier = canonicalAccess(options.access);
  if (tier === "PAID") {
    return { ok: true, approaching: false, remaining };
  }

  const wouldExceed =
    (options.next === "message" && remaining.messages <= 0) ||
    (options.next === "case" && remaining.cases <= 0) ||
    (options.next === "image_analysis" && remaining.imageAnalyses <= 0) ||
    (options.next === "voice" && remaining.voiceMessages <= 0);

  if (wouldExceed) {
    const reason =
      tier === "FVM_BETA"
        ? "fvm_beta_limit"
        : options.access === "guest"
          ? "guest_limit"
          : "registered_free_limit";
    return {
      ok: false,
      reason,
      remaining,
      allowFinishActiveCase: Boolean(options.activeCaseInProgress && options.next !== "case"),
    };
  }

  const approaching =
    remaining.messages <= 3 ||
    remaining.cases <= 1 ||
    remaining.imageAnalyses <= 1 ||
    remaining.voiceMessages <= 1;

  return { ok: true, approaching, remaining };
}

export const FREE_LIMIT_HEADING = "You've reached your free limit.";

export const GUEST_LIMIT_MESSAGE =
  "Create a free account to keep your crop history and continue using FVM Crop Solution.";

export const REGISTERED_LIMIT_HEADING = "Continue with FVM Crop Solution";

export const UPGRADE_COMING_SOON = "Paid plans are coming soon.";

export const FVM_BETA_ACTIVATED = "FVM Beta Access activated.";

export const FARMER_GENERIC_ERROR =
  "I couldn’t finish that just now. Please send the question again.";
export const FARMER_WEB_LOOKUP_FAILED =
  "I couldn't complete the online lookup, but I can still help based on the information you've given me.";
/** Shown only when the agronomic answer was produced but crop_cases / case_messages did not save. */
export const FARMER_PERSISTENCE_DEGRADED =
  "I have an answer for you. Saving this chat for later failed — you can copy it if you need it.";

export function farmerLevelLabel(level: string | null | undefined): string | null {
  if (!level) return null;
  const labels: Record<string, string> = {
    home_gardener: "Home gardener",
    farmer: "Farmer",
    small_farmer: "Small farmer",
    commercial_grower: "Commercial grower",
    technical_user: "Technical user",
    agronomist: "Agronomist",
    extension_officer: "Extension officer",
    HOME_GARDENER: "Home gardener",
    SMALL_FARMER: "Small farmer",
    COMMERCIAL_FARMER: "Commercial grower",
    TECHNICAL_USER: "Technical user",
    AGRONOMIST: "Agronomist",
  };
  return labels[level] ?? level.replace(/_/g, " ");
}
