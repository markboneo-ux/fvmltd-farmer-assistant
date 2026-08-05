import "server-only";

/**
 * OpenAI credentials — server-only. Never expose via NEXT_PUBLIC_.
 * Reads exactly process.env.OPENAI_API_KEY (and optional OPENAI_MODEL).
 */

export type OpenAIKeyReason =
  | "OPENAI_KEY_MISSING"
  | "OPENAI_KEY_FORMAT_INVALID";

export type OpenAIKeyResolution =
  | { ok: true; apiKey: string }
  | { ok: false; reason: OpenAIKeyReason };

const PLACEHOLDER_KEY =
  /^(your-?openai-?api-?key|changeme|replace-?me|xxx+|<.*>|none|null|undefined)$/i;

function normalizeApiKey(raw: string): string {
  let apiKey = raw.trim();
  if (
    (apiKey.startsWith('"') && apiKey.endsWith('"')) ||
    (apiKey.startsWith("'") && apiKey.endsWith("'"))
  ) {
    apiKey = apiKey.slice(1, -1).trim();
  }
  return apiKey;
}

/**
 * Resolve OPENAI_API_KEY without throwing.
 * Call only from request-time server code (after connection() in the route).
 */
export function resolveOpenAIApiKey(
  rawFromRoute?: string | undefined,
): OpenAIKeyResolution {
  // Exact required read — process.env.OPENAI_API_KEY
  const raw =
    rawFromRoute !== undefined ? rawFromRoute : process.env.OPENAI_API_KEY;

  if (raw == null) {
    return { ok: false, reason: "OPENAI_KEY_MISSING" };
  }

  const apiKey = normalizeApiKey(String(raw));

  if (!apiKey) {
    return { ok: false, reason: "OPENAI_KEY_MISSING" };
  }

  if (PLACEHOLDER_KEY.test(apiKey)) {
    return { ok: false, reason: "OPENAI_KEY_FORMAT_INVALID" };
  }

  return { ok: true, apiKey };
}

export function getOpenAIApiKey() {
  const resolved = resolveOpenAIApiKey();
  if (!resolved.ok) {
    throw new Error(resolved.reason);
  }
  return resolved.apiKey;
}

export function getOpenAIModel() {
  // Exact read — process.env.OPENAI_MODEL
  return process.env.OPENAI_MODEL?.trim() || "gpt-4o";
}

/** Safe metadata for logs / JSON — never includes secret material. */
export function getOpenAIEnvDiagnostics() {
  const raw = process.env.OPENAI_API_KEY;
  const present = raw != null && normalizeApiKey(String(raw)).length > 0;
  return {
    keyPresent: present,
    keyDefined: raw !== undefined,
    keyLength: present ? normalizeApiKey(String(raw)).length : 0,
    model: getOpenAIModel(),
    // Help confirm whether *any* server secrets reach this runtime.
    serviceRolePresent: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
    publicSupabaseUrlPresent: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(),
    ),
    vercelEnv: process.env.VERCEL_ENV ?? null,
    nextRuntime: process.env.NEXT_RUNTIME ?? null,
  };
}
