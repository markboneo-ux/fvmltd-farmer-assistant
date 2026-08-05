import { NextResponse } from "next/server";
import { parseGuestChatBody, runGuestChat } from "@/lib/ai/guestChat";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Guest AI chat — no Supabase, no registration, no Farmer ID.
 * Uses the OpenAI Responses API with a server-only API key.
 */
export async function POST(request: Request) {
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
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: result.status },
    );
  }

  return NextResponse.json({
    reply: result.reply,
    model: result.model,
    source: "openai",
  });
}
