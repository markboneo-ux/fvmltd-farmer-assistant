import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveIdentityFromRequest } from "@/lib/beta/auth-server";
import { farmerAuthError } from "@/lib/auth/farmer-auth-error";
import { farmerSignupOtpResendParams, normalizeFarmerEmail } from "@/lib/auth/farmer-otp";
import {
  EXISTING_ACCOUNT_MESSAGE,
  OTP_RESEND_WAIT_MESSAGE,
} from "@/lib/auth/signup-outcome";
import {
  checkCombinedRateLimit,
  clientIp,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { logOps } from "@/lib/security/ops-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const identity = await resolveIdentityFromRequest();
  const limited = checkCombinedRateLimit({
    rule: RATE_LIMITS.otp_resend,
    sessionId: identity.guestSessionId,
    ip: clientIp(request),
  });
  if (!limited.ok) {
    return NextResponse.json(
      {
        error: OTP_RESEND_WAIT_MESSAGE,
        code: "rate_limited",
        retryAfterSec: limited.retryAfterSec,
      },
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
    const { error } = await supabase.auth.resend(farmerSignupOtpResendParams(email));
    if (error) {
      logOps("auth_failure", { route: "otp-resend", error: error.message });
      const mapped = farmerAuthError(error);
      if (mapped.code === "existing_account" || /already\s+confirmed|already verified/i.test(error.message)) {
        return NextResponse.json({
          ok: true,
          alreadyVerified: true,
          message: EXISTING_ACCOUNT_MESSAGE,
        });
      }
      if (mapped.code === "rate_limited") {
        return NextResponse.json(
          { error: OTP_RESEND_WAIT_MESSAGE, code: "rate_limited" },
          { status: 429 },
        );
      }
      return NextResponse.json({ error: mapped.message, code: mapped.code }, { status: 400 });
    }
    return NextResponse.json({ ok: true, message: "We sent a new code." });
  } catch (error) {
    logOps("auth_failure", {
      error: error instanceof Error ? error.message : "otp resend failed",
    });
    return NextResponse.json(
      { error: farmerAuthError(error instanceof Error ? error.message : null).message },
      { status: 503 },
    );
  }
}
