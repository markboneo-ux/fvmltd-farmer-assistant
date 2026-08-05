import "server-only";

import { getOpenAIModel } from "@/lib/openai/env";
import { tryCreateOpenAIClient } from "@/lib/openai/client";

export const GUEST_ASSISTANT_INSTRUCTIONS = `You are the FVMLTD Farmer Assistant, supporting tropical smallholder farmers. Give practical, clear and cautious crop guidance. Ask one short clarifying question when important information is missing. Do not claim certainty from limited information. Separate likely causes from next actions. Do not recommend restricted pesticides or unsafe mixing. Encourage label compliance and local professional support where appropriate.

Keep answers easy for farmers to understand:
- Use short paragraphs
- Give practical next steps
- Use minimal technical language
- Separate "Likely causes" from "What to check / do next" when helpful`;

export type GuestChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type GuestChatResult =
  | { ok: true; reply: string; model: string }
  | { ok: false; error: string; status: number; code: string };

function asTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function parseGuestChatBody(body: unknown): {
  message: string;
  history: GuestChatMessage[];
} {
  const record =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};

  const message =
    asTrimmedString(record.message) || asTrimmedString(record.question);

  const historyRaw = Array.isArray(record.messages)
    ? record.messages
    : Array.isArray(record.history)
      ? record.history
      : [];

  const history: GuestChatMessage[] = [];
  for (const item of historyRaw) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    const role = entry.role === "assistant" ? "assistant" : "user";
    const content = asTrimmedString(entry.content) || asTrimmedString(entry.text);
    if (!content) continue;
    history.push({ role, content });
  }

  return { message, history };
}

export async function runGuestChat(options: {
  message: string;
  history?: GuestChatMessage[];
}): Promise<GuestChatResult> {
  const message = options.message.trim();
  if (!message) {
    return {
      ok: false,
      error: "Please type a farming question first.",
      status: 400,
      code: "empty_question",
    };
  }

  const openai = tryCreateOpenAIClient();
  if (!openai.ok) {
    return {
      ok: false,
      error: openai.error,
      status: 503,
      code: "missing_api_key",
    };
  }

  const model = getOpenAIModel();
  const history = (options.history ?? []).slice(-12);
  const input = [
    ...history.map((item) => ({
      role: item.role,
      content: item.content,
    })),
    { role: "user" as const, content: message },
  ];

  try {
    const response = await openai.client.responses.create({
      model,
      instructions: GUEST_ASSISTANT_INSTRUCTIONS,
      input,
      temperature: 0.4,
      max_output_tokens: 700,
    });

    const reply = response.output_text?.trim() ?? "";
    if (!reply) {
      return {
        ok: false,
        error: "The assistant returned an empty reply. Please try again.",
        status: 502,
        code: "model_error",
      };
    }

    return { ok: true, reply, model: response.model || model };
  } catch (error) {
    console.error("Guest AI chat failed:", error);

    const messageText =
      error instanceof Error ? error.message : "OpenAI request failed.";
    const lower = messageText.toLowerCase();
    const isNetwork =
      lower.includes("fetch") ||
      lower.includes("network") ||
      lower.includes("timeout") ||
      lower.includes("econn") ||
      lower.includes("enotfound");

    return {
      ok: false,
      error: isNetwork
        ? "Could not reach OpenAI. Check your connection and try again."
        : "The AI model could not answer right now. Please try again in a moment.",
      status: 502,
      code: isNetwork ? "network_error" : "model_error",
    };
  }
}
