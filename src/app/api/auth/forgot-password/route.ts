import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveIdentityFromRequest } from "@/lib/beta/auth-server";
import { farmerFacingError } from "@/lib/beta/farmer-error";
import {
  checkCombinedRateLimit,
  clientIp,
  FARMER_RATE_LIMIT_MESSAGE,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { logOps } from "@/lib/security/ops-log";
import { absoluteAppUrl } from "@/lib/config/urls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const identity = await resolveIdentityFromRequest();
  const limited = checkCombinedRateLimit({
    rule: RATE_LIMITS.auth,
    sessionId: identity.guestSessionId,
    ip: clientIp(request),
  });
  if (!limited.ok) {
    logOps("rate_limit", { route: "forgot-password" });
    return NextResponse.json({ error: FARMER_RATE_LIMIT_MESSAGE }, { status: 429 });
  }

  let email = "";
  try {
    const body = (await request.json()) as { email?: unknown };
    email = typeof body.email === "string" ? body.email.trim() : "";
  } catch {
    return NextResponse.json({ error: "Enter the email for your account." }, { status: 400 });
  }

  if (!email) {
    return NextResponse.json({ error: "Enter the email for your account." }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const redirectTo = absoluteAppUrl("/auth/callback?next=/login") || undefined;
    await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    return NextResponse.json({
      ok: true,
      message: "If that email is registered, we sent a reset link.",
    });
  } catch (error) {
    logOps("auth_failure", {
      error: error instanceof Error ? error.message : "forgot password failed",
    });
    return NextResponse.json({ error: farmerFacingError(null) }, { status: 503 });
  }
}
