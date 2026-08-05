import { connection } from "next/server";
import { NextResponse } from "next/server";
import { getOpenAIModel, resolveOpenAIApiKey } from "@/lib/openai/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public AI health check — no Supabase, no auth, never returns the API key.
 * GET /api/ai/health
 */
export async function GET() {
  await connection();

  // Exact required read — process.env.OPENAI_API_KEY (boolean only in response)
  const resolved = resolveOpenAIApiKey(process.env.OPENAI_API_KEY);

  return NextResponse.json(
    {
      ok: true,
      keyConfigured: resolved.ok,
      model: getOpenAIModel(),
    },
    { status: 200 },
  );
}
