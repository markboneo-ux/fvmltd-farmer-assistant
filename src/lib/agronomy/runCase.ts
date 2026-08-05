import "server-only";

import OpenAI from "openai";
import {
  type AiDiagnosticCode,
  type GuestChatMessage,
} from "@/lib/ai/guestChat";
import { getOpenAIEnvDiagnostics, getOpenAIModel } from "@/lib/openai/env";
import { tryCreateOpenAIClient } from "@/lib/openai/client";
import {
  CASE_RESPONSE_JSON_SCHEMA,
  parseCasePayload,
  type AgronomicCasePayload,
} from "./case-schema";
import { AGRONOMIC_CASE_SYSTEM_INSTRUCTIONS } from "./system-instructions";
import { applyCommercialSafetyGuards } from "./tomato-protocol";

export type CaseChatMessage = GuestChatMessage;

export type CaseModelResponse = {
  id: string;
  model?: string;
  output_text?: string;
};

export type AgronomicCaseResult =
  | {
      ok: true;
      case: AgronomicCasePayload;
      responseId: string;
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
  console.error(`[ai/case] ${reason}`, {
    keyPresent: diagnostics.keyPresent,
    keyDefined: diagnostics.keyDefined,
    keyLength: diagnostics.keyLength,
    model: diagnostics.model,
    vercelEnv: diagnostics.vercelEnv,
    nextRuntime: diagnostics.nextRuntime,
    ...extra,
  });
}

function mapOpenAIFailure(
  error: unknown,
  model: string,
): {
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
    if (text.includes("previous_response_id") || text.includes("previous response")) {
      return {
        diagnosticCode: "INVALID_REQUEST",
        error:
          "Previous conversation context expired. Clear the conversation and start again, or continue with full history.",
        status: 400,
      };
    }
    if (text.includes("model")) {
      return {
        diagnosticCode: "MODEL_NOT_AVAILABLE",
        error: `The configured model (${model}) is not available.`,
        status: 502,
      };
    }
    return {
      diagnosticCode: "INVALID_REQUEST",
      error: "The AI case request was rejected as invalid. Please try again.",
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
        error:
          "OpenAI rejected the server API key. Check OPENAI_API_KEY on the host.",
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
    if (status === 404 || (text.includes("model") && text.includes("not"))) {
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
    error: "The AI case engine could not answer right now. Please try again.",
    status: 502,
  };
}

export function parseCaseRequestBody(body: unknown): {
  message: string;
  history: CaseChatMessage[];
  previousResponseId: string | null;
} {
  const record =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};

  const message =
    asTrimmedString(record.message) || asTrimmedString(record.question);

  const previousResponseId =
    asTrimmedString(record.previousResponseId) ||
    asTrimmedString(record.previous_response_id) ||
    null;

  const historyRaw = Array.isArray(record.messages)
    ? record.messages
    : Array.isArray(record.history)
      ? record.history
      : [];

  const history: CaseChatMessage[] = [];
  for (const item of historyRaw) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    const role = entry.role === "assistant" ? "assistant" : "user";
    const content = asTrimmedString(entry.content) || asTrimmedString(entry.text);
    if (!content) continue;
    history.push({ role, content });
  }

  return { message, history, previousResponseId };
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("Empty model output.");
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("Model output was not valid JSON.");
  }
}

/**
 * Runs one Agronomic Case Engine turn via the OpenAI Responses API.
 *
 * Conversation memory:
 * - Prefer previous_response_id when the client supplies it (store: true).
 * - Otherwise send the complete relevant conversation history.
 */
export async function runAgronomicCase(options: {
  message: string;
  history?: CaseChatMessage[];
  previousResponseId?: string | null;
  apiKey?: string | undefined;
  /** Injected for automated tests — bypasses the network. */
  createResponse?: (
    params: Record<string, unknown>,
  ) => Promise<CaseModelResponse>;
}): Promise<AgronomicCaseResult> {
  const model = getOpenAIModel();
  const message = options.message.trim();

  if (!message) {
    return {
      ok: false,
      error: "Please describe the crop problem first.",
      status: 400,
      diagnosticCode: "INVALID_REQUEST",
      model,
      requestCompleted: false,
    };
  }

  const history = (options.history ?? []).slice(-24);
  const previousResponseId = options.previousResponseId?.trim() || null;

  const createResponse: (
    params: Record<string, unknown>,
  ) => Promise<CaseModelResponse> =
    options.createResponse ??
    (async (params) => {
      const openai = tryCreateOpenAIClient(options.apiKey);
      if (!openai.ok) {
        const diagnosticCode: AiDiagnosticCode =
          openai.reason === "OPENAI_KEY_MISSING" ||
          openai.reason === "OPENAI_KEY_FORMAT_INVALID"
            ? "OPENAI_KEY_MISSING"
            : "OPENAI_REQUEST_FAILED";
        logReason(diagnosticCode);
        const err = new Error(openai.error) as Error & {
          diagnosticCode: AiDiagnosticCode;
          status: number;
        };
        err.diagnosticCode = diagnosticCode;
        err.status = 503;
        throw err;
      }

      const response = (await openai.client.responses.create({
        ...(params as object),
        stream: false,
      } as Parameters<typeof openai.client.responses.create>[0])) as CaseModelResponse;

      return {
        id: response.id,
        model: response.model,
        output_text: response.output_text,
      };
    });

  const textFormat = {
    format: {
      type: "json_schema" as const,
      name: "agronomic_case_response",
      strict: true,
      schema: CASE_RESPONSE_JSON_SCHEMA as unknown as Record<string, unknown>,
    },
  };

  const baseParams: Record<string, unknown> = {
    model,
    instructions: AGRONOMIC_CASE_SYSTEM_INSTRUCTIONS,
    temperature: 0.3,
    max_output_tokens: 900,
    store: true,
    text: textFormat,
  };

  // Prefer previous_response_id; fall back to full history for memory.
  if (previousResponseId) {
    baseParams.previous_response_id = previousResponseId;
    baseParams.input = [{ role: "user", content: message }];
  } else {
    baseParams.input = [
      ...history.map((item) => ({
        role: item.role,
        content: item.content,
      })),
      { role: "user" as const, content: message },
    ];
  }

  try {
    let response: CaseModelResponse;

    try {
      response = await createResponse(baseParams);
    } catch (error) {
      // If previous_response_id is stale, retry once with full history.
      if (
        previousResponseId &&
        history.length > 0 &&
        error instanceof OpenAI.BadRequestError
      ) {
        const retryParams: Record<string, unknown> = {
          ...baseParams,
          previous_response_id: undefined,
          input: [
            ...history.map((item) => ({
              role: item.role,
              content: item.content,
            })),
            { role: "user" as const, content: message },
          ],
        };
        delete retryParams.previous_response_id;
        response = await createResponse(retryParams);
      } else {
        throw error;
      }
    }

    const rawText = response.output_text?.trim() ?? "";
    if (!rawText) {
      logReason("OPENAI_REQUEST_FAILED", { model, empty: true });
      return {
        ok: false,
        error: "The case engine returned an empty reply. Please try again.",
        status: 502,
        diagnosticCode: "OPENAI_REQUEST_FAILED",
        model: response.model || model,
        requestCompleted: true,
      };
    }

    let parsed: AgronomicCasePayload;
    try {
      parsed = applyCommercialSafetyGuards(
        parseCasePayload(extractJsonObject(rawText)),
      );
    } catch (parseError) {
      logReason("OPENAI_REQUEST_FAILED", {
        model,
        parseFailed: true,
        errorMessage: sanitizeErrorMessage(
          parseError instanceof Error ? parseError.message : "parse error",
        ),
      });
      return {
        ok: false,
        error: "The case engine returned an unreadable structured reply.",
        status: 502,
        diagnosticCode: "OPENAI_REQUEST_FAILED",
        model: response.model || model,
        requestCompleted: true,
      };
    }

    return {
      ok: true,
      case: parsed,
      responseId: response.id,
      model: response.model || model,
      diagnosticCode: "AI_READY",
      requestCompleted: true,
    };
  } catch (error) {
    const withCode = error as Error & {
      diagnosticCode?: AiDiagnosticCode;
      status?: number;
    };
    if (withCode.diagnosticCode) {
      return {
        ok: false,
        error: withCode.message,
        status: withCode.status ?? 503,
        diagnosticCode: withCode.diagnosticCode,
        model,
        requestCompleted: false,
      };
    }

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
