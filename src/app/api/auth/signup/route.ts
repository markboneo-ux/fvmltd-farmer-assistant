import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveIdentityFromRequest } from "@/lib/beta/auth-server";
import { grantEntitlement } from "@/lib/beta/entitlements";
import { linkGuestCasesToUser } from "@/lib/cases/store";
import { ownerKey } from "@/lib/beta/session";
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
      options: {
        emailRedirectTo: absoluteAppUrl("/auth/callback") || undefined,
      },
    });
    if (error) {
      logOps("auth_failure", { error: error.message });
      return NextResponse.json(
        { error: farmerFacingError("I couldn’t create that account. Please try again.") },
        { status: 400 },
      );
    }

    if (data.user) {
      grantEntitlement(`user:${data.user.id}`, "free_registered", "signup");
      linkGuestCasesToUser(identity.guestSessionId, data.user.id);
    }
    grantEntitlement(ownerKey(identity), "free_registered", "signup");

    return NextResponse.json({
      ok: true,
      needsEmailConfirm: !data.session,
      linkedGuestCases: Boolean(data.user),
    });
  } catch (error) {
    logOps("auth_failure", {
      error: error instanceof Error ? error.message : "signup failed",
    });
    return NextResponse.json(
      { error: farmerFacingError(null) },
      { status: 503 },
    );
  }
}
