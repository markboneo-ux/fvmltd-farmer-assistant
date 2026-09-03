import { NextResponse } from "next/server";
import { resolveIdentityFromRequest } from "@/lib/beta/auth-server";
import { ownerKey } from "@/lib/beta/session";
import { grantEntitlement } from "@/lib/beta/entitlements";
import { recordUsageEvent } from "@/lib/beta/usage-store";
import { redeemPromoCode } from "@/lib/promo/server";
import {
  checkCombinedRateLimit,
  clientIp,
  FARMER_RATE_LIMIT_MESSAGE,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { logOps } from "@/lib/security/ops-log";
import { farmerFacingError } from "@/lib/beta/farmer-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const identity = await resolveIdentityFromRequest();
  const limited = checkCombinedRateLimit({
    rule: RATE_LIMITS.promo,
    sessionId: identity.guestSessionId,
    userId: identity.authUserId,
    ip: clientIp(request),
  });
  if (!limited.ok) {
    logOps("rate_limit", { route: "promo", retryAfterSec: limited.retryAfterSec });
    return NextResponse.json(
      { error: FARMER_RATE_LIMIT_MESSAGE, ok: false },
      { status: 429 },
    );
  }

  let code = "";
  try {
    const body = (await request.json()) as { code?: unknown };
    code = typeof body.code === "string" ? body.code : "";
  } catch {
    return NextResponse.json({ ok: false, error: "Enter a promotional code." }, { status: 400 });
  }

  recordUsageEvent({
    guestSessionId: identity.guestSessionId,
    authUserId: identity.authUserId,
    kind: "promo_attempt",
    caseId: null,
  });

  const result = redeemPromoCode(code, ownerKey(identity));
  if (!result.ok) {
    logOps("promo_failure", { reason: result.reason });
    return NextResponse.json(
      { ok: false, error: farmerFacingError(result.error) },
      { status: 400 },
    );
  }

  grantEntitlement(ownerKey(identity), result.entitlement, "promo");
  recordUsageEvent({
    guestSessionId: identity.guestSessionId,
    authUserId: identity.authUserId,
    kind: "promo_success",
    caseId: null,
    meta: { code: result.code },
  });

  return NextResponse.json({
    ok: true,
    access: result.entitlement,
    message: "Promotional access is now active.",
  });
}
