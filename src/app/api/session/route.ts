import { NextResponse } from "next/server";
import { evaluateConversationGate } from "@/lib/beta/conversation";
import { resolveIdentityFromRequest } from "@/lib/beta/auth-server";
import { GUEST_COOKIE_NAME, guestCookieOptions } from "@/lib/beta/session";
import { getUsageLimits, limitsForAccess, FARMER_GENERIC_ERROR } from "@/lib/beta/limits";
import { accessTierLabel, usageNoticeFor } from "@/lib/beta/usage-notice";
import { loadFarmerAccountProfile, farmerInitials } from "@/lib/auth/complete-farmer-auth";
import { PRIVACY_SUMMARY } from "@/lib/privacy/copy";
import { getMainWebsiteUrl } from "@/lib/config/urls";
import { CasePersistenceError } from "@/lib/cases/store";
import { logOps } from "@/lib/security/ops-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const identity = await resolveIdentityFromRequest();
  try {
    const gate = await evaluateConversationGate({ identity, next: "message" });
    const caps = limitsForAccess(identity.access, getUsageLimits());
    const remaining = "remaining" in gate ? gate.remaining : caps;
    const limitReached = !gate.ok && !gate.allowFinishActiveCase;
    const profile = identity.authUserId
      ? await loadFarmerAccountProfile(identity.authUserId)
      : null;
    const notice = usageNoticeFor({
      access: identity.access,
      used: gate.used,
      remaining,
      caps,
      limitReached,
    });

    const response = NextResponse.json({
      identity: {
        kind: identity.kind,
        access: identity.access,
        email: identity.email,
        signedIn: Boolean(identity.authUserId),
        displayName: profile?.fullName ?? null,
        initials: identity.authUserId ? farmerInitials(profile?.fullName, identity.email) : "",
        avatarUrl: profile?.avatarUrl ?? null,
        farmerProfileId: identity.farmerProfileId,
      },
      usage: gate.used,
      remaining,
      caps: identity.access === "promo" || identity.access === "paid" || identity.access === "trial"
        ? null
        : caps,
      approaching: notice?.level === "approaching" || notice?.level === "near",
      usageNotice: notice,
      limitReached,
      allowFinishActiveCase: !gate.ok && gate.allowFinishActiveCase,
      accessLabel: accessTierLabel(identity.access),
      privacy: PRIVACY_SUMMARY,
      mainWebsiteUrl: getMainWebsiteUrl(),
    });
    response.cookies.set(GUEST_COOKIE_NAME, identity.guestSessionId, guestCookieOptions());
    return response;
  } catch (error) {
    if (error instanceof CasePersistenceError) {
      logOps("database_failure", { route: "session" });
      return NextResponse.json({ error: FARMER_GENERIC_ERROR }, { status: 503 });
    }
    throw error;
  }
}
