import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { claimGuestHistoryForUser } from "@/lib/beta/claim-guest";
import { grantAndPersistEntitlement } from "@/lib/beta/entitlement-persist";
import { getEntitlement } from "@/lib/beta/entitlements";
import { canonicalAccess } from "@/lib/beta/limits";
import { GUEST_COOKIE_NAME } from "@/lib/beta/identity";
import { normalizeGuestSessionId } from "@/lib/beta/identity";
import { logOps } from "@/lib/security/ops-log";
import { absoluteAppUrl } from "@/lib/config/urls";
import { safeFarmerNextPath } from "@/lib/auth/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeFarmerNextPath(url.searchParams.get("next") || "/");
  const origin = absoluteAppUrl("/") || url.origin;

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data.user) {
      logOps("auth_failure", { error: error?.message ?? "no user" });
      return NextResponse.redirect(`${origin}/login?error=auth`);
    }

    const cookieHeader = request.headers.get("cookie") ?? "";
    const guestMatch = cookieHeader.match(new RegExp(`${GUEST_COOKIE_NAME}=([^;]+)`));
    const guestId = normalizeGuestSessionId(guestMatch?.[1] ?? null);
    if (guestId) {
      await claimGuestHistoryForUser(guestId, data.user.id);
    }
    const existing = getEntitlement(`user:${data.user.id}`);
    const tier = existing ? canonicalAccess(existing.access) : "GUEST";
    if (tier === "GUEST") {
      await grantAndPersistEntitlement(`user:${data.user.id}`, "free_registered", "signup");
    }

    return NextResponse.redirect(`${origin}${next === "/" ? "" : next}` || `${origin}/`);
  } catch (error) {
    logOps("auth_failure", {
      error: error instanceof Error ? error.message : "callback failed",
    });
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }
}
