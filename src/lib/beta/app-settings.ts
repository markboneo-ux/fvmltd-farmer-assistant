import "server-only";

import { tryCreateAdminClient } from "@/lib/supabase/helpers";
import type { UsageLimitKey, UsageLimits } from "./limits";
import { DEFAULT_USAGE_LIMITS } from "./limits";

const SETTINGS_KEYS: UsageLimitKey[] = [
  "guest_max_messages",
  "guest_max_cases",
  "guest_max_image_analyses",
  "guest_max_voice_messages",
  "registered_free_messages",
  "registered_free_cases",
  "registered_free_images",
  "registered_free_voice",
  "fvm_beta_messages",
  "fvm_beta_cases",
  "fvm_beta_image_analyses",
  "fvm_beta_voice_messages",
];

let cached: { at: number; overlay: Partial<UsageLimits> } | null = null;
const CACHE_MS = 30_000;

export function resetAppSettingsCache() {
  cached = null;
}

export async function loadUsageLimitOverlay(): Promise<Partial<UsageLimits> | null> {
  if (process.env.VITEST) return cached?.overlay ?? null;
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.overlay;
  const admin = tryCreateAdminClient();
  if (!admin.ok) return null;
  try {
    const { data, error } = await admin.client
      .from("app_settings")
      .select("key, value_integer")
      .in("key", SETTINGS_KEYS);
    if (error || !data) return null;
    const overlay: Partial<UsageLimits> = {};
    for (const row of data as Array<{ key?: string; value_integer?: number | null }>) {
      const key = row.key as UsageLimitKey | undefined;
      if (!key || !SETTINGS_KEYS.includes(key)) continue;
      if (typeof row.value_integer === "number" && row.value_integer >= 0) {
        overlay[key] = row.value_integer;
      }
    }
    cached = { at: Date.now(), overlay };
    return overlay;
  } catch {
    return null;
  }
}

export function mergePromoAllowances(
  overlay: Partial<UsageLimits> | null,
  allowances?: {
    messages?: number | null;
    cases?: number | null;
    imageAnalyses?: number | null;
    voiceMessages?: number | null;
  } | null,
): Partial<UsageLimits> {
  const next: Partial<UsageLimits> = { ...(overlay ?? {}) };
  if (typeof allowances?.messages === "number") next.fvm_beta_messages = allowances.messages;
  if (typeof allowances?.cases === "number") next.fvm_beta_cases = allowances.cases;
  if (typeof allowances?.imageAnalyses === "number") {
    next.fvm_beta_image_analyses = allowances.imageAnalyses;
  }
  if (typeof allowances?.voiceMessages === "number") {
    next.fvm_beta_voice_messages = allowances.voiceMessages;
  }
  return next;
}

export function fvmBetaDefaults(): Pick<
  UsageLimits,
  "fvm_beta_messages" | "fvm_beta_cases" | "fvm_beta_image_analyses" | "fvm_beta_voice_messages"
> {
  return {
    fvm_beta_messages: DEFAULT_USAGE_LIMITS.fvm_beta_messages,
    fvm_beta_cases: DEFAULT_USAGE_LIMITS.fvm_beta_cases,
    fvm_beta_image_analyses: DEFAULT_USAGE_LIMITS.fvm_beta_image_analyses,
    fvm_beta_voice_messages: DEFAULT_USAGE_LIMITS.fvm_beta_voice_messages,
  };
}
