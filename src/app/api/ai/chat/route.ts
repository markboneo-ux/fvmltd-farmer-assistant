import { NextResponse } from "next/server";
import { parseGuestChatBody, runGuestChat } from "@/lib/ai/guestChat";
import { getOpenAIEnvDiagnostics } from "@/lib/openai/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Guest AI chat — no Supabase, no registration, no Farmer ID.
 * Uses the OpenAI Responses API with a server-only API key.
 *
 * Pre-OpenAI 503 conditions (no outbound OpenAI call):
 * - OPENAI_KEY_MISSING
 * - OPENAI_KEY_FORMAT_INVALID
 * - MODEL_CONFIGURATION_ERROR
 */
export async function POST(request: Request) {
  // Request-time dynamic read (name built at runtime) — value never logged.
  void process.env[["OPENAI", "API", "KEY"].join("_")];

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: "Invalid request body.",
        code: "invalid_body",
      },
      { status: 400 },
    );
  }

  const { message, history } = parseGuestChatBody(body);
  const result = await runGuestChat({ message, history });

  if (!result.ok) {
    const diagnostics = getOpenAIEnvDiagnostics();
    return NextResponse.json(
      {
        error: result.error,
        code: result.code,
        // Safe diagnostics only — never the key.
        diagnostics: {
          keyPresent: diagnostics.keyPresent,
          model: diagnostics.model,
        },
      },
      { status: result.status },
    );
  }

  return NextResponse.json({
    reply: result.reply,
    model: result.model,
    source: "openai",
  });
}
