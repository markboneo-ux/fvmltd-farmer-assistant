import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveIdentityFromRequest } from "@/lib/beta/auth-server";
import { claimGuestHistoryForUser } from "@/lib/beta/claim-guest";
import { grantAndPersistEntitlement } from "@/lib/beta/entitlement-persist";
import { getEntitlement } from "@/lib/beta/entitlements";
import { canonicalAccess } from "@/lib/beta/limits";
import { farmerFacingError } from "@/lib/beta/farmer-error";
import {
  checkCombinedRateLimit,
  clientIp,
  FARMER_RATE_LIMIT_MESSAGE,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { logOps } from "@/lib/security/ops-log";
import { safeFarmerNextPath } from "@/lib/auth/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const identity = await resolveIdentityFromRequest();
  const limited = checkCombinedRateLimit({
    rule: RATE_LIMITS.auth,
    sessionId: identity.guestSessionId,
    ip: clientIp(request),
  });
  if (!limited.ok) {
    logOps("rate_limit", { route: "login" });
    return NextResponse.json({ error: FARMER_RATE_LIMIT_MESSAGE }, { status: 429 });
  }

  let email = "";
  let password = "";
  let next = "/";
  try {
    const body = (await request.json()) as {
      email?: unknown;
      password?: unknown;
      next?: unknown;
    };
    email = typeof body.email === "string" ? body.email.trim() : "";
    password = typeof body.password === "string" ? body.password : "";
    next = safeFarmerNextPath(typeof body.next === "string" ? body.next : "/");
  } catch {
    return NextResponse.json({ error: "Enter your email and password." }, { status: 400 });
  }

  if (!email || !password) {
    return NextResponse.json({ error: "Enter your email and password." }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      logOps("auth_failure", { error: error?.message ?? "login failed" });
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    const linked = await claimGuestHistoryForUser(identity.guestSessionId, data.user.id);
    const existing = getEntitlement(`user:${data.user.id}`);
    const tier = existing ? canonicalAccess(existing.access) : "GUEST";
    if (tier === "GUEST") {
      await grantAndPersistEntitlement(`user:${data.user.id}`, "free_registered", "signup");
    }

    return NextResponse.json({
      ok: true,
      next,
      linkedGuestCases: linked.casesLinked,
    });
  } catch (error) {
    logOps("auth_failure", {
      error: error instanceof Error ? error.message : "login failed",
    });
    return NextResponse.json({ error: farmerFacingError(null) }, { status: 503 });
  }
}
