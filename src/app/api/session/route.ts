import { NextResponse } from "next/server";
import { evaluateConversationGate } from "@/lib/beta/conversation";
import { resolveIdentityFromRequest } from "@/lib/beta/auth-server";
import { GUEST_COOKIE_NAME, guestCookieOptions } from "@/lib/beta/session";
import {
  accessTierLabel,
  canonicalAccess,
  getUsageLimits,
  limitsForAccess,
  FARMER_GENERIC_ERROR,
  FREE_LIMIT_HEADING,
} from "@/lib/beta/limits";
import { loadUsageLimitOverlay } from "@/lib/beta/app-settings";
import { PRIVACY_SUMMARY } from "@/lib/privacy/copy";
import { getMainWebsiteUrl } from "@/lib/config/urls";
import { CasePersistenceError } from "@/lib/cases/store";
import { logOps } from "@/lib/security/ops-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const identity = await resolveIdentityFromRequest();
  try {
    const overlay = await loadUsageLimitOverlay();
    const gate = await evaluateConversationGate({ identity, next: "message" });
    const caps = limitsForAccess(identity.access, getUsageLimits(overlay));

    const response = NextResponse.json({
      identity: {
        kind: identity.kind,
        access: identity.access,
        accessTier: canonicalAccess(identity.access),
        accessLabel: accessTierLabel(identity.access),
        email: identity.email,
      },
      usage: gate.used,
      remaining: "remaining" in gate ? gate.remaining : caps,
      approaching: gate.ok ? gate.approaching : true,
      limitReached: !gate.ok && !gate.allowFinishActiveCase,
      allowFinishActiveCase: !gate.ok && gate.allowFinishActiveCase,
      limitHeading: FREE_LIMIT_HEADING,
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
