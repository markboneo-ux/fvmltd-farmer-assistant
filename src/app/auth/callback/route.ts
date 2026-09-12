import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { completeFarmerAuthentication } from "@/lib/auth/complete-farmer-auth";
import { GUEST_COOKIE_NAME } from "@/lib/beta/identity";
import { normalizeGuestSessionId } from "@/lib/beta/identity";
import { logOps } from "@/lib/security/ops-log";
import { absoluteAppUrl } from "@/lib/config/urls";
import { staffResetForwardUrl, STAFF_RESET_PASSWORD_PATH } from "@/lib/staff/recovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const next = url.searchParams.get("next") || "/";
  const origin = absoluteAppUrl("/") || url.origin;
  const isFarmerResetNext = next.startsWith("/signin");
  const isStaffRecovery =
    next.startsWith(STAFF_RESET_PASSWORD_PATH) ||
    (type === "recovery" && !isFarmerResetNext);

  // Do not consume staff recovery tokens here. Forward the format to
  // /admin/reset-password so a click on that page hydrates once.
  if (isStaffRecovery) {
    logOps("auth_failure", {
      route: "auth-callback",
      stage: "staff_recovery_forward",
      format: tokenHash ? "token_hash" : code ? "pkce_code" : "none",
    });
    return NextResponse.redirect(staffResetForwardUrl(origin, url.searchParams));
  }

  if (tokenHash && type === "recovery") {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.verifyOtp({
        type: "recovery",
        token_hash: tokenHash,
      });
      if (error) {
        logOps("auth_failure", {
          route: "auth-callback",
          stage: "invalid_recovery_token",
          error: error.message,
        });
        return NextResponse.redirect(`${origin}/signin?error=auth`);
      }
      return NextResponse.redirect(
        `${origin}${next.startsWith("/") ? next : "/signin?mode=reset"}`,
      );
    } catch (error) {
      logOps("auth_failure", {
        route: "auth-callback",
        error: error instanceof Error ? error.message : "recovery verify failed",
      });
      return NextResponse.redirect(`${origin}/signin?error=auth`);
    }
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/signin?error=auth`);
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data.user) {
      logOps("auth_failure", { error: error?.message ?? "no user" });
      return NextResponse.redirect(`${origin}/signin?error=auth`);
    }

    const cookieHeader = request.headers.get("cookie") ?? "";
    const guestMatch = cookieHeader.match(new RegExp(`${GUEST_COOKIE_NAME}=([^;]+)`));
    const guestId = normalizeGuestSessionId(guestMatch?.[1] ?? null);
    const metadata = data.user.user_metadata ?? {};
    await completeFarmerAuthentication({
      authUserId: data.user.id,
      email: data.user.email ?? null,
      fullName:
        typeof metadata.full_name === "string"
          ? metadata.full_name
          : typeof metadata.name === "string"
            ? metadata.name
            : null,
      guestSessionId: guestId,
    });

    const safeNext = next.startsWith("/") ? next : "/";
    return NextResponse.redirect(`${origin}${safeNext === "/" ? "" : safeNext}` || `${origin}/`);
  } catch (error) {
    logOps("auth_failure", {
      error: error instanceof Error ? error.message : "callback failed",
    });
    return NextResponse.redirect(`${origin}/signin?error=auth`);
  }
}
