import { NextResponse } from "next/server";
import { createImplicitAuthClient } from "@/lib/supabase/implicit";
import { normalizeFarmerEmail } from "@/lib/auth/farmer-otp";
import { tryCreateAdminClient } from "@/lib/supabase/helpers";
import {
  checkCombinedRateLimit,
  clientIp,
  FARMER_RATE_LIMIT_MESSAGE,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { logOps } from "@/lib/security/ops-log";
import {
  requestOrigin,
  staffRecoveryRedirectTo,
} from "@/lib/staff/recovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SENT_MESSAGE =
  "If this email belongs to an FVMLTD staff account, we sent a password reset link.";

export async function POST(request: Request) {
  const limited = checkCombinedRateLimit({
    rule: RATE_LIMITS.login,
    ip: clientIp(request),
  });
  if (!limited.ok) {
    logOps("rate_limit", { route: "staff-recover" });
    return NextResponse.json({ error: FARMER_RATE_LIMIT_MESSAGE }, { status: 429 });
  }

  let email = "";
  try {
    const body = (await request.json()) as { email?: unknown };
    email = typeof body.email === "string" ? normalizeFarmerEmail(body.email) : "";
  } catch {
    return NextResponse.json({ error: "Enter your work email." }, { status: 400 });
  }
  if (!email || email.includes("%")) {
    return NextResponse.json({ error: "Enter your work email." }, { status: 400 });
  }

  const redirectTo = staffRecoveryRedirectTo(requestOrigin(request));
  const admin = tryCreateAdminClient();
  if (admin.ok) {
    const { data: staffRow, error: lookupError } = await admin.client
      .from("staff_profiles")
      .select("id, auth_user_id, email, is_active")
      .ilike("email", email)
      .maybeSingle();
    if (lookupError) {
      logOps("auth_failure", {
        route: "staff-recover",
        stage: "staff_lookup_failed",
        error: lookupError.message,
      });
    } else if (!staffRow || staffRow.is_active !== true || !staffRow.auth_user_id) {
      logOps("auth_failure", {
        route: "staff-recover",
        stage: "staff_not_linked",
      });
      return NextResponse.json({ ok: true, message: SENT_MESSAGE });
    }
  }

  try {
    // Implicit flow: recovery email is not bound to a PKCE verifier in this
    // browser, so the staff member can open it on another device/tab.
    const supabase = createImplicitAuthClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) {
      logOps("auth_failure", {
        route: "staff-recover",
        error: error.message,
        flowType: "implicit",
      });
    } else {
      logOps("auth_failure", {
        route: "staff-recover",
        stage: "recovery_email_sent",
        flowType: "implicit",
        redirectHost: new URL(redirectTo).host,
      });
    }
  } catch (error) {
    logOps("auth_failure", {
      route: "staff-recover",
      error: error instanceof Error ? error.message : "recover failed",
    });
  }

  return NextResponse.json({ ok: true, message: SENT_MESSAGE });
}
