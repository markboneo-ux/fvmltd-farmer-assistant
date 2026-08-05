import "server-only";

import OpenAI from "openai";
import { getOpenAIEnvDiagnostics, getOpenAIModel } from "@/lib/openai/env";
import { tryCreateOpenAIClient } from "@/lib/openai/client";

export const GUEST_ASSISTANT_INSTRUCTIONS = `You are the FVMLTD Farmer Assistant for tropical smallholder farmers.
Give practical, cautious and easy-to-understand agricultural guidance.
Separate likely causes from immediate checks and next actions.
Ask focused follow-up questions where important information is missing.
Do not pretend that a diagnosis is certain without sufficient evidence.
Do not recommend unsafe pesticide mixing. Encourage label compliance
and qualified local support where appropriate.`;

export type GuestChatMessage = {
  role: "user" | "assistant";
  content: string;
};

/** Safe diagnostic codes returned to clients — never include secrets. */
export type AiDiagnosticCode =
  | "AI_READY"
  | "OPENAI_KEY_MISSING"
  | "OPENAI_AUTH_FAILED"
  | "OPENAI_QUOTA_OR_BILLING"
  | "MODEL_NOT_AVAILABLE"
  | "OPENAI_RATE_LIMIT"
  | "OPENAI_REQUEST_FAILED"
  | "INVALID_REQUEST";

export type GuestChatResult =
  | {
      ok: true;
      answer: string;
      model: string;
      diagnosticCode: "AI_READY";
      requestCompleted: true;
    }
  | {
      ok: false;
      error: string;
      status: number;
      diagnosticCode: AiDiagnosticCode;
      model: string;
      requestCompleted: boolean;
    };

function asTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeErrorMessage(message: string) {
  return message
    .replace(/\bsk-[^\s"'`,;]+/gi, "[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .slice(0, 200);
}

function logReason(
  reason: AiDiagnosticCode,
  extra?: Record<string, string | number | boolean | null | undefined>,
) {
  const diagnostics = getOpenAIEnvDiagnostics();
  console.error(`[ai/chat] ${reason}`, {
    keyPresent: diagnostics.keyPresent,
    keyDefined: diagnostics.keyDefined,
    keyLength: diagnostics.keyLength,
    model: diagnostics.model,
    vercelEnv: diagnostics.vercelEnv,
    nextRuntime: diagnostics.nextRuntime,
    ...extra,
  });
}

function mapOpenAIFailure(error: unknown, model: string): {
  diagnosticCode: AiDiagnosticCode;
  error: string;
  status: number;
} {
  if (error instanceof OpenAI.AuthenticationError) {
    return {
      diagnosticCode: "OPENAI_AUTH_FAILED",
      error: "OpenAI rejected the server API key. Check OPENAI_API_KEY on the host.",
      status: 502,
    };
  }

  if (error instanceof OpenAI.NotFoundError) {
    return {
      diagnosticCode: "MODEL_NOT_AVAILABLE",
      error: `The configured model (${model}) is not available.`,
      status: 502,
    };
  }

  if (error instanceof OpenAI.RateLimitError) {
    const text = `${error.message} ${error.code ?? ""} ${error.type ?? ""}`.toLowerCase();
    if (
      text.includes("insufficient_quota") ||
      text.includes("billing") ||
      text.includes("quota")
    ) {
      return {
        diagnosticCode: "OPENAI_QUOTA_OR_BILLING",
        error: "OpenAI quota or billing prevented this request.",
        status: 502,
      };
    }
    return {
      diagnosticCode: "OPENAI_RATE_LIMIT",
      error: "OpenAI rate limit reached. Please try again shortly.",
      status: 429,
    };
  }

  if (error instanceof OpenAI.BadRequestError) {
    const text = `${error.message} ${error.code ?? ""}`.toLowerCase();
    if (text.includes("model")) {
      return {
        diagnosticCode: "MODEL_NOT_AVAILABLE",
        error: `The configured model (${model}) is not available.`,
        status: 502,
      };
    }
    return {
      diagnosticCode: "INVALID_REQUEST",
      error: "The AI request was rejected as invalid. Please try again.",
      status: 400,
    };
  }

  if (
    error instanceof OpenAI.APIConnectionError ||
    error instanceof OpenAI.APIConnectionTimeoutError
  ) {
    return {
      diagnosticCode: "OPENAI_REQUEST_FAILED",
      error: "Could not reach OpenAI. Check your connection and try again.",
      status: 502,
    };
  }

  if (error instanceof OpenAI.APIError) {
    const status = error.status;
    const text = `${error.message} ${error.code ?? ""} ${error.type ?? ""}`.toLowerCase();

    if (status === 401 || status === 403) {
      return {
        diagnosticCode: "OPENAI_AUTH_FAILED",
        error: "OpenAI rejected the server API key. Check OPENAI_API_KEY on the host.",
        status: 502,
      };
    }
    if (
      text.includes("insufficient_quota") ||
      text.includes("billing") ||
      (status === 429 && text.includes("quota"))
    ) {
      return {
        diagnosticCode: "OPENAI_QUOTA_OR_BILLING",
        error: "OpenAI quota or billing prevented this request.",
        status: 502,
      };
    }
    if (status === 429) {
      return {
        diagnosticCode: "OPENAI_RATE_LIMIT",
        error: "OpenAI rate limit reached. Please try again shortly.",
        status: 429,
      };
    }
    if (
      status === 404 ||
      (text.includes("model") && text.includes("not"))
    ) {
      return {
        diagnosticCode: "MODEL_NOT_AVAILABLE",
        error: `The configured model (${model}) is not available.`,
        status: 502,
      };
    }
  }

  const messageText =
    error instanceof Error ? error.message : "OpenAI request failed.";
  const lower = messageText.toLowerCase();
  if (
    lower.includes("fetch") ||
    lower.includes("network") ||
    lower.includes("timeout") ||
    lower.includes("econn") ||
    lower.includes("enotfound")
  ) {
    return {
      diagnosticCode: "OPENAI_REQUEST_FAILED",
      error: "Could not reach OpenAI. Check your connection and try again.",
      status: 502,
    };
  }

  return {
    diagnosticCode: "OPENAI_REQUEST_FAILED",
    error: "The AI model could not answer right now. Please try again in a moment.",
    status: 502,
  };
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
  /** From the Route Handler: process.env.OPENAI_API_KEY */
  apiKey?: string | undefined;
}): Promise<GuestChatResult> {
  const model = getOpenAIModel();
  const message = options.message.trim();

  if (!message) {
    return {
      ok: false,
      error: "Please type a farming question first.",
      status: 400,
      diagnosticCode: "INVALID_REQUEST",
      model,
      requestCompleted: false,
    };
  }

  // No Supabase / auth / Farmer ID — guest chat only needs OpenAI.
  const openai = tryCreateOpenAIClient(options.apiKey);
  if (!openai.ok) {
    const diagnosticCode: AiDiagnosticCode =
      openai.reason === "OPENAI_KEY_MISSING" ||
      openai.reason === "OPENAI_KEY_FORMAT_INVALID"
        ? "OPENAI_KEY_MISSING"
        : "OPENAI_REQUEST_FAILED";
    logReason(diagnosticCode);
    return {
      ok: false,
      error: openai.error,
      status: 503,
      diagnosticCode,
      model,
      requestCompleted: false,
    };
  }

  const history = (options.history ?? []).slice(-12);
  const input = [
    ...history.map((item) => ({
      role: item.role,
      content: item.content,
    })),
    { role: "user" as const, content: message },
  ];

  try {
    // OpenAI Responses API — outgoing network call.
    const response = await openai.client.responses.create({
      model,
      instructions: GUEST_ASSISTANT_INSTRUCTIONS,
      input,
      temperature: 0.4,
      max_output_tokens: 700,
    });

    const answer = response.output_text?.trim() ?? "";
    if (!answer) {
      logReason("OPENAI_REQUEST_FAILED", { model, empty: true });
      return {
        ok: false,
        error: "The assistant returned an empty reply. Please try again.",
        status: 502,
        diagnosticCode: "OPENAI_REQUEST_FAILED",
        model: response.model || model,
        requestCompleted: true,
      };
    }

    return {
      ok: true,
      answer,
      model: response.model || model,
      diagnosticCode: "AI_READY",
      requestCompleted: true,
    };
  } catch (error) {
    const mapped = mapOpenAIFailure(error, model);
    const messageText =
      error instanceof Error ? error.message : "OpenAI request failed.";

    logReason(mapped.diagnosticCode, {
      model,
      errorName: error instanceof Error ? error.name : "Error",
      errorMessage: sanitizeErrorMessage(messageText),
      httpStatus:
        error instanceof OpenAI.APIError ? (error.status ?? null) : null,
    });

    return {
      ok: false,
      error: mapped.error,
      status: mapped.status,
      diagnosticCode: mapped.diagnosticCode,
      model,
      requestCompleted: true,
    };
  }
}
