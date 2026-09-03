import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { linkGuestCasesToUser } from "@/lib/cases/store";
import { grantEntitlement } from "@/lib/beta/entitlements";
import { GUEST_COOKIE_NAME } from "@/lib/beta/identity";
import { normalizeGuestSessionId } from "@/lib/beta/identity";
import { logOps } from "@/lib/security/ops-log";
import { absoluteAppUrl } from "@/lib/config/urls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/";
  const origin = absoluteAppUrl("/") || url.origin;

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
    if (guestId) {
      linkGuestCasesToUser(guestId, data.user.id);
    }
    grantEntitlement(`user:${data.user.id}`, "free_registered", "signup");

    const safeNext = next.startsWith("/") ? next : "/";
    return NextResponse.redirect(`${origin}${safeNext === "/" ? "" : safeNext}` || `${origin}/`);
  } catch (error) {
    logOps("auth_failure", {
      error: error instanceof Error ? error.message : "callback failed",
    });
    return NextResponse.redirect(`${origin}/signin?error=auth`);
  }
}
