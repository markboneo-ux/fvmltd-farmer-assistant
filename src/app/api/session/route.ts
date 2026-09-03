import { NextResponse } from "next/server";
import { evaluateConversationGate } from "@/lib/beta/conversation";
import { resolveIdentityFromRequest } from "@/lib/beta/auth-server";
import { GUEST_COOKIE_NAME, guestCookieOptions } from "@/lib/beta/session";
import { getUsageLimits, limitsForAccess } from "@/lib/beta/limits";
import { PRIVACY_SUMMARY } from "@/lib/privacy/copy";
import { getMainWebsiteUrl } from "@/lib/config/urls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const identity = await resolveIdentityFromRequest();
  const gate = evaluateConversationGate({ identity, next: "message" });
  const caps = limitsForAccess(identity.access, getUsageLimits());

  const response = NextResponse.json({
    identity: {
      kind: identity.kind,
      access: identity.access,
      email: identity.email,
    },
    usage: gate.used,
    remaining: "remaining" in gate ? gate.remaining : caps,
    approaching: gate.ok ? gate.approaching : true,
    limitReached: !gate.ok && !gate.allowFinishActiveCase,
    allowFinishActiveCase: !gate.ok && gate.allowFinishActiveCase,
    privacy: PRIVACY_SUMMARY,
    mainWebsiteUrl: getMainWebsiteUrl(),
  });
  response.cookies.set(GUEST_COOKIE_NAME, identity.guestSessionId, guestCookieOptions());
  return response;
}
