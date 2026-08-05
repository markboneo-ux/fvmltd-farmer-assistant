import "server-only";

import OpenAI from "openai";
import {
  getOpenAIApiKey,
  resolveOpenAIApiKey,
  type OpenAIKeyReason,
} from "./env";

export type OpenAIClientResult =
  | { ok: true; client: OpenAI }
  | {
      ok: false;
      reason: OpenAIKeyReason | "MODEL_CONFIGURATION_ERROR";
      error: string;
    };

/**
 * Privileged OpenAI client for server Route Handlers / Server Actions only.
 * Never import this module from Client Components.
 *
 * Uncached: always re-read credentials so new Vercel env values apply.
 */
export function createOpenAIClient(apiKey?: string) {
  const key = apiKey ?? getOpenAIApiKey();
  return new OpenAI({ apiKey: key });
}

export function tryCreateOpenAIClient(
  rawApiKey?: string | undefined,
): OpenAIClientResult {
  const resolved = resolveOpenAIApiKey(rawApiKey);
  if (!resolved.ok) {
    return {
      ok: false,
      reason: resolved.reason,
      error:
        resolved.reason === "OPENAI_KEY_FORMAT_INVALID"
          ? "OPENAI_API_KEY looks like a placeholder. Set a real OpenAI secret key on the server."
          : "OpenAI is not configured on the server. Add OPENAI_API_KEY and try again.",
    };
  }

  try {
    return { ok: true, client: createOpenAIClient(resolved.apiKey) };
  } catch (error) {
    console.error("[ai/chat] MODEL_CONFIGURATION_ERROR", {
      name: error instanceof Error ? error.name : "Error",
      message:
        error instanceof Error
          ? error.message
              .replace(/\bsk-[^\s"'`,;]+/gi, "[redacted]")
              .slice(0, 200)
          : "unknown",
    });
    return {
      ok: false,
      reason: "MODEL_CONFIGURATION_ERROR",
      error:
        "OpenAI client could not be created. Check server configuration and try again.",
    };
  }
}
