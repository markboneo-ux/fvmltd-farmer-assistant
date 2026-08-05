import { connection } from "next/server";
import { NextResponse } from "next/server";
import { parseCaseRequestBody, runAgronomicCase } from "@/lib/agronomy/runCase";
import { getOpenAIModel } from "@/lib/openai/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Agronomic Case Engine — farmer-friendly rapid triage.
 * Quick Help (default, ≤3 questions) or optional Full Crop Check.
 * Uses OpenAI Responses API + Structured Outputs. No Supabase / registration.
 */
export async function POST(request: Request) {
  await connection();

  const apiKey = process.env.OPENAI_API_KEY;
  const model = getOpenAIModel();

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        case: null,
        responseId: null,
        model,
        diagnosticCode: "INVALID_REQUEST",
        requestCompleted: false,
        error: "Invalid request body.",
      },
      { status: 400 },
    );
  }

  const { message, history, previousResponseId, mode } =
    parseCaseRequestBody(body);
  const result = await runAgronomicCase({
    message,
    history,
    previousResponseId,
    mode,
    apiKey,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        case: null,
        responseId: null,
        model: result.model,
        diagnosticCode: result.diagnosticCode,
        requestCompleted: result.requestCompleted,
        error: result.error,
      },
      { status: result.status },
    );
  }

  return NextResponse.json({
    case: result.case,
    responseId: result.responseId,
    model: result.model,
    diagnosticCode: result.diagnosticCode,
    requestCompleted: result.requestCompleted,
    questionsAsked: result.questionsAsked,
  });
}
