import "server-only";

/**
 * OpenAI credentials — server-only. Never expose via NEXT_PUBLIC_.
 *
 * IMPORTANT: Access OPENAI_API_KEY only through dynamic env lookups.
 * Static `process.env.OPENAI_API_KEY` can be replaced at build time on some
 * bundlers; if the secret is absent during `next build`, the route would
 * forever see a missing key even when Vercel injects it at runtime.
 */

export type OpenAIKeyReason =
  | "OPENAI_KEY_MISSING"
  | "OPENAI_KEY_FORMAT_INVALID";

export type OpenAIKeyResolution =
  | { ok: true; apiKey: string }
  | { ok: false; reason: OpenAIKeyReason };

const PLACEHOLDER_KEY =
  /^(your-?openai-?api-?key|changeme|replace-?me|xxx+|<.*>|none|null|undefined)$/i;

/** Dynamic name — prevents build-time DefinePlugin / Turbopack inlining. */
const OPENAI_API_KEY_NAME = ["OPENAI", "API", "KEY"].join("_");
const OPENAI_MODEL_NAME = ["OPENAI", "MODEL"].join("_");

function readProcessEnv(name: string): string | undefined {
  // Index access on process.env cannot be statically substituted.
  const value = process.env[name];
  if (value == null) return undefined;
  return value;
}

/**
 * Resolve OPENAI_API_KEY without throwing.
 * Never returns or logs the key value to callers that might print it.
 */
export function resolveOpenAIApiKey(): OpenAIKeyResolution {
  const raw = readProcessEnv(OPENAI_API_KEY_NAME);

  if (raw == null) {
    return { ok: false, reason: "OPENAI_KEY_MISSING" };
  }

  // Trim whitespace; strip a single pair of wrapping quotes from dashboard paste.
  let apiKey = String(raw).trim();
  if (
    (apiKey.startsWith('"') && apiKey.endsWith('"')) ||
    (apiKey.startsWith("'") && apiKey.endsWith("'"))
  ) {
    apiKey = apiKey.slice(1, -1).trim();
  }

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
  const configured = readProcessEnv(OPENAI_MODEL_NAME)?.trim();
  // gpt-4o is supported by the OpenAI Responses API and is the repo default.
  return configured || "gpt-4o";
}

/** Safe metadata for logs — never includes secret material. */
export function getOpenAIEnvDiagnostics() {
  const raw = readProcessEnv(OPENAI_API_KEY_NAME);
  const present = raw != null && String(raw).trim().length > 0;
  return {
    keyPresent: present,
    keyLength: present ? String(raw).trim().length : 0,
    model: getOpenAIModel(),
  };
}
