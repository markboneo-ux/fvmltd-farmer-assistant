import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { farmerAuthError } from "@/lib/auth/farmer-auth-error";
import { normalizeFarmerEmail } from "@/lib/auth/farmer-otp";
import { OTP_RESEND_WAIT_MESSAGE } from "@/lib/auth/signup-outcome";
import { absoluteAppUrl, getAppUrl } from "@/lib/config/urls";
import {
  checkCombinedRateLimit,
  clientIp,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { logOps } from "@/lib/security/ops-log";
import { resolveIdentityFromRequest } from "@/lib/beta/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESET_SENT_MESSAGE =
  "If this email is registered, we sent a password reset link. Check your inbox.";

export async function POST(request: Request) {
  const identity = await resolveIdentityFromRequest();
  const limited = checkCombinedRateLimit({
    rule: RATE_LIMITS.auth,
    sessionId: identity.guestSessionId,
    ip: clientIp(request),
  });
  if (!limited.ok) {
    logOps("rate_limit", { route: "forgot-password" });
    return NextResponse.json(
      { error: OTP_RESEND_WAIT_MESSAGE, code: "rate_limited", retryAfterSec: limited.retryAfterSec },
      { status: 429 },
    );
  }

  let email = "";
  try {
    const body = (await request.json()) as { email?: unknown };
    email = typeof body.email === "string" ? normalizeFarmerEmail(body.email) : "";
  } catch {
    return NextResponse.json({ error: "Enter your email." }, { status: 400 });
  }
  if (!email) {
    return NextResponse.json({ error: "Enter your email." }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const origin = getAppUrl();
    const redirectTo = origin
      ? `${absoluteAppUrl("/auth/callback")}?next=${encodeURIComponent("/signin?mode=reset")}`
      : undefined;
    const { error } = await supabase.auth.resetPasswordForEmail(
      email,
      redirectTo ? { redirectTo } : undefined,
    );
    if (error) {
      logOps("auth_failure", { route: "forgot-password", error: error.message });
      const mapped = farmerAuthError(error);
      if (mapped.code === "rate_limited") {
        return NextResponse.json(
          { error: OTP_RESEND_WAIT_MESSAGE, code: "rate_limited" },
          { status: 429 },
        );
      }
      // Do not reveal whether the email exists.
      return NextResponse.json({ ok: true, message: RESET_SENT_MESSAGE });
    }
    return NextResponse.json({ ok: true, message: RESET_SENT_MESSAGE });
  } catch (error) {
    logOps("auth_failure", {
      route: "forgot-password",
      error: error instanceof Error ? error.message : "reset failed",
    });
    return NextResponse.json(
      { error: farmerAuthError(error instanceof Error ? error.message : null).message },
      { status: 503 },
    );
  }
}
