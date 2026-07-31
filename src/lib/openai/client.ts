import "server-only";

import OpenAI from "openai";
import { getOpenAIApiKey } from "./env";

let cached: OpenAI | null = null;

/**
 * Privileged OpenAI client for server Route Handlers / Server Actions only.
 * Never import this module from Client Components.
 */
export function createOpenAIClient() {
  if (cached) return cached;
  cached = new OpenAI({ apiKey: getOpenAIApiKey() });
  return cached;
}

export function tryCreateOpenAIClient() {
  try {
    return { ok: true as const, client: createOpenAIClient() };
  } catch {
    return {
      ok: false as const,
      error:
        "OpenAI is not configured on the server. Add OPENAI_API_KEY and try again.",
    };
  }
}
