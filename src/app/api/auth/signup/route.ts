import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveIdentityFromRequest } from "@/lib/beta/auth-server";
import { completeFarmerAuthentication } from "@/lib/auth/complete-farmer-auth";
import { farmerAuthError } from "@/lib/auth/farmer-auth-error";
import { farmerSignupOtpResendParams, normalizeFarmerEmail } from "@/lib/auth/farmer-otp";
import {
  classifySignUpData,
  EXISTING_ACCOUNT_MESSAGE,
  ghostResendDecision,
  OTP_RESEND_WAIT_MESSAGE,
  UNVERIFIED_ACCOUNT_MESSAGE,
} from "@/lib/auth/signup-outcome";
import { absoluteAppUrl, getAppUrl } from "@/lib/config/urls";
import {
  checkCombinedRateLimit,
  clientIp,
  FARMER_RATE_LIMIT_MESSAGE,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { logOps } from "@/lib/security/ops-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function existingVerifiedResponse() {
  return NextResponse.json(
    { error: EXISTING_ACCOUNT_MESSAGE, code: "existing_account" },
    { status: 409 },
  );
}

function unverifiedResponse(email: string, options?: { rateLimited?: boolean }) {
  return NextResponse.json({
    ok: true,
    needsEmailConfirm: true,
    existingUnverified: true,
    email,
    message: options?.rateLimited ? OTP_RESEND_WAIT_MESSAGE : UNVERIFIED_ACCOUNT_MESSAGE,
    code: options?.rateLimited ? "rate_limited" : undefined,
  });
}

async function classifyExistingEmail(
  supabase: Awaited<ReturnType<typeof createClient>>,
  email: string,
) {
  const { error } = await supabase.auth.resend(farmerSignupOtpResendParams(email));
  const decision = ghostResendDecision(error);
  if (decision === "verified") {
    logOps("auth_failure", { route: "signup", reason: "existing_verified" });
    return existingVerifiedResponse();
  }
  if (decision === "rate_limited") {
    logOps("auth_failure", { route: "signup", reason: "otp_rate_limited" });
    return unverifiedResponse(email, { rateLimited: true });
  }
  return unverifiedResponse(email);
}

export async function POST(request: Request) {
  const identity = await resolveIdentityFromRequest();
  const limited = checkCombinedRateLimit({
    rule: RATE_LIMITS.signup,
    sessionId: identity.guestSessionId,
    ip: clientIp(request),
  });
  if (!limited.ok) {
    logOps("rate_limit", { route: "signup" });
    return NextResponse.json({ error: FARMER_RATE_LIMIT_MESSAGE }, { status: 429 });
  }

  let email = "";
  let password = "";
  try {
    const body = (await request.json()) as { email?: unknown; password?: unknown };
    email = typeof body.email === "string" ? normalizeFarmerEmail(body.email) : "";
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ error: "Enter your email and a password." }, { status: 400 });
  }

  if (!email || !password || password.length < 8) {
    return NextResponse.json(
      { error: "Enter a valid email and a password with at least 8 characters." },
      { status: 400 },
    );
  }

  try {
    const supabase = await createClient();
    const emailRedirectTo = getAppUrl() ? absoluteAppUrl("/auth/callback") : undefined;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: emailRedirectTo ? { emailRedirectTo } : undefined,
    });
    if (error) {
      logOps("auth_failure", { route: "signup", error: error.message });
      const mapped = farmerAuthError(error);
      if (mapped.code === "existing_account") {
        return classifyExistingEmail(supabase, email);
      }
      if (mapped.code === "rate_limited") {
        return NextResponse.json(
          { error: OTP_RESEND_WAIT_MESSAGE, code: "rate_limited" },
          { status: 429 },
        );
      }
      return NextResponse.json(
        { error: mapped.message, code: mapped.code },
        { status: 400 },
      );
    }

    if (data.session && data.user) {
      const completed = await completeFarmerAuthentication({
        authUserId: data.user.id,
        email: data.user.email ?? email,
        fullName:
          typeof data.user.user_metadata?.full_name === "string"
            ? data.user.user_metadata.full_name
            : null,
        guestSessionId: identity.guestSessionId,
      });
      return NextResponse.json({
        ok: true,
        needsEmailConfirm: false,
        sessionEstablished: true,
        linkedGuestCases: completed.linkedGuestCases,
      });
    }

    const kind = classifySignUpData(data);
    if (kind === "ghost_existing") {
      return classifyExistingEmail(supabase, email);
    }

    return NextResponse.json({
      ok: true,
      needsEmailConfirm: true,
      email,
    });
  } catch (error) {
    logOps("auth_failure", {
      route: "signup",
      error: error instanceof Error ? error.message : "signup failed",
    });
    return NextResponse.json(
      { error: farmerAuthError(error instanceof Error ? error.message : null).message },
      { status: 503 },
    );
  }
}
