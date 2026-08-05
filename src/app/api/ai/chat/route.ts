import { connection } from "next/server";
import { NextResponse } from "next/server";
import { parseGuestChatBody, runGuestChat } from "@/lib/ai/guestChat";
import { getOpenAIModel } from "@/lib/openai/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Guest AI chat — no Supabase, no registration, no Farmer ID.
 * Uses the official OpenAI JavaScript SDK Responses API with a server-only key.
 *
 * Safe diagnostic codes:
 * - AI_READY
 * - OPENAI_KEY_MISSING
 * - OPENAI_AUTH_FAILED
 * - OPENAI_QUOTA_OR_BILLING
 * - MODEL_NOT_AVAILABLE
 * - OPENAI_RATE_LIMIT
 * - OPENAI_REQUEST_FAILED
 * - INVALID_REQUEST
 */
export async function POST(request: Request) {
  // Wait for the incoming request so env is read at request time, not build time.
  await connection();

  // Exact required read — process.env.OPENAI_API_KEY (never returned to clients)
  const apiKey = process.env.OPENAI_API_KEY;
  const model = getOpenAIModel();

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        answer: null,
        model,
        diagnosticCode: "INVALID_REQUEST",
        requestCompleted: false,
        error: "Invalid request body.",
        // Backward-compatible aliases for existing guest chat UI.
        reply: null,
        code: "INVALID_REQUEST",
      },
      { status: 400 },
    );
  }

  const { message, history } = parseGuestChatBody(body);
  const result = await runGuestChat({ message, history, apiKey });

  if (!result.ok) {
    return NextResponse.json(
      {
        answer: null,
        model: result.model,
        diagnosticCode: result.diagnosticCode,
        requestCompleted: result.requestCompleted,
        error: result.error,
        // Backward-compatible aliases for existing guest chat UI.
        reply: null,
        code: result.diagnosticCode,
      },
      { status: result.status },
    );
  }

  return NextResponse.json({
    answer: result.answer,
    model: result.model,
    diagnosticCode: result.diagnosticCode,
    requestCompleted: result.requestCompleted,
    // Backward-compatible aliases for existing guest chat UI.
    reply: result.answer,
    source: "openai",
  });
}
