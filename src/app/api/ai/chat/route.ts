import { connection } from "next/server";
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
  // Wait for the incoming request so env is read at request time, not build time.
  await connection();

  // Exact required read — process.env.OPENAI_API_KEY
  const apiKey = process.env.OPENAI_API_KEY;

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
  const result = await runGuestChat({ message, history, apiKey });

  if (!result.ok) {
    const diagnostics = getOpenAIEnvDiagnostics();
    return NextResponse.json(
      {
        error: result.error,
        code: result.code,
        // Safe diagnostics only — never the key value.
        diagnostics: {
          keyPresent: diagnostics.keyPresent,
          keyDefined: diagnostics.keyDefined,
          model: diagnostics.model,
          serviceRolePresent: diagnostics.serviceRolePresent,
          publicSupabaseUrlPresent: diagnostics.publicSupabaseUrlPresent,
          vercelEnv: diagnostics.vercelEnv,
          nextRuntime: diagnostics.nextRuntime,
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
