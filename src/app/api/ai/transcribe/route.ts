import { connection } from "next/server";
import { NextResponse } from "next/server";
import { resolveIdentityFromRequest } from "@/lib/beta/auth-server";
import { farmerFacingError } from "@/lib/beta/farmer-error";
import { FARMER_GENERIC_ERROR } from "@/lib/beta/limits";
import { transcribeFarmerVoice, MAX_VOICE_SECONDS } from "@/lib/voice/transcribe";
import {
  checkCombinedRateLimit,
  clientIp,
  FARMER_RATE_LIMIT_MESSAGE,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { logOps } from "@/lib/security/ops-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  await connection();
  const identity = await resolveIdentityFromRequest();
  const rate = checkCombinedRateLimit({
    rule: RATE_LIMITS.ai,
    sessionId: identity.guestSessionId,
    userId: identity.authUserId,
    ip: clientIp(request),
  });
  if (!rate.ok) {
    logOps("rate_limit", { route: "ai/transcribe", retryAfterSec: rate.retryAfterSec });
    return NextResponse.json({ error: FARMER_RATE_LIMIT_MESSAGE }, { status: 429 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "I could not read that recording." }, { status: 400 });
  }

  const audio = form.get("audio") || form.get("file");
  if (!(audio instanceof File) || audio.size === 0) {
    return NextResponse.json(
      { error: "Please record a short voice note first." },
      { status: 400 },
    );
  }
  const durationRaw = Number(form.get("durationSeconds") || form.get("duration") || "");
  const durationSeconds = Number.isFinite(durationRaw) && durationRaw > 0 ? durationRaw : null;

  const result = await transcribeFarmerVoice({
    file: audio,
    durationSeconds,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: farmerFacingError(result.error) || FARMER_GENERIC_ERROR, maxSeconds: MAX_VOICE_SECONDS },
      { status: result.status },
    );
  }

  return NextResponse.json({
    text: result.text,
    transcript: result.text,
    confidence: result.confidence,
    durationSeconds: result.durationSeconds,
    inputMode: "voice",
    maxSeconds: MAX_VOICE_SECONDS,
  });
}
