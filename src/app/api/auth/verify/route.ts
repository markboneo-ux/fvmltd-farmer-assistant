import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveIdentityFromRequest } from "@/lib/beta/auth-server";
import { completeFarmerAuthentication } from "@/lib/auth/complete-farmer-auth";
import {
  farmerAuthError,
  isCompleteOtpCode,
  normalizeOtpCode,
} from "@/lib/auth/farmer-auth-error";
import { farmerSignupOtpVerifyParams, normalizeFarmerEmail } from "@/lib/auth/farmer-otp";
import {
  checkCombinedRateLimit,
  clientIp,
  FARMER_RATE_LIMIT_MESSAGE,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { logOps } from "@/lib/security/ops-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const identity = await resolveIdentityFromRequest();
  const limited = checkCombinedRateLimit({
    rule: RATE_LIMITS.otp,
    sessionId: identity.guestSessionId,
    ip: clientIp(request),
  });
  if (!limited.ok) {
    logOps("rate_limit", { route: "otp-verify" });
    return NextResponse.json({ error: FARMER_RATE_LIMIT_MESSAGE }, { status: 429 });
  }

  let email = "";
  let token = "";
  try {
    const body = (await request.json()) as { email?: unknown; token?: unknown; code?: unknown };
    email = typeof body.email === "string" ? normalizeFarmerEmail(body.email) : "";
    token = normalizeOtpCode(
      typeof body.token === "string"
        ? body.token
        : typeof body.code === "string"
          ? body.code
          : "",
    );
  } catch {
    return NextResponse.json({ error: "Enter the 6-digit code from your email." }, { status: 400 });
  }

  if (!email || !isCompleteOtpCode(token)) {
    return NextResponse.json(
      { error: "Enter the 6-digit code we sent to your email." },
      { status: 400 },
    );
  }

  try {
    const supabase = await createClient();
    const verified = await supabase.auth.verifyOtp(farmerSignupOtpVerifyParams(email, token));
    if (verified.error || !verified.data.user) {
      logOps("auth_failure", {
        route: "otp-verify",
        error: verified.error?.message ?? "otp failed",
      });
      const mapped = farmerAuthError(verified.error);
      return NextResponse.json({ error: mapped.message, code: mapped.code }, { status: 400 });
    }

    const sessionEstablished = Boolean(verified.data.session);
    if (!sessionEstablished) {
      logOps("auth_failure", {
        route: "otp-verify",
        reason: "session_missing",
        authUserPrefix: verified.data.user.id.slice(0, 8),
      });
    }

    const completed = await completeFarmerAuthentication({
      authUserId: verified.data.user.id,
      email: verified.data.user.email ?? email,
      fullName:
        typeof verified.data.user.user_metadata?.full_name === "string"
          ? verified.data.user.user_metadata.full_name
          : null,
      guestSessionId: identity.guestSessionId,
    });

    return NextResponse.json({
      ok: true,
      sessionEstablished,
      linkedGuestCases: completed.linkedGuestCases,
    });
  } catch (error) {
    logOps("auth_failure", {
      error: error instanceof Error ? error.message : "otp failed",
    });
    return NextResponse.json(
      { error: farmerAuthError(error instanceof Error ? error.message : null).message },
      { status: 503 },
    );
  }
}
