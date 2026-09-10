import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveIdentityFromRequest } from "@/lib/beta/auth-server";
import { completeFarmerAuthentication } from "@/lib/auth/complete-farmer-auth";
import { farmerAuthError } from "@/lib/auth/farmer-auth-error";
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
    email = typeof body.email === "string" ? body.email.trim() : "";
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
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });
    if (error) {
      logOps("auth_failure", { error: error.message });
      const mapped = farmerAuthError(error);
      return NextResponse.json(
        { error: mapped.message, code: mapped.code },
        { status: mapped.code === "existing_account" ? 409 : 400 },
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
        linkedGuestCases: completed.linkedGuestCases,
      });
    }

    return NextResponse.json({
      ok: true,
      needsEmailConfirm: true,
      email,
    });
  } catch (error) {
    logOps("auth_failure", {
      error: error instanceof Error ? error.message : "signup failed",
    });
    return NextResponse.json(
      { error: farmerAuthError(error instanceof Error ? error.message : null).message },
      { status: 503 },
    );
  }
}
