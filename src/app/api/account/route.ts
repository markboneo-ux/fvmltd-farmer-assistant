import { NextResponse } from "next/server";
import { resolveIdentityFromRequest } from "@/lib/beta/auth-server";
import { buildFarmerAccountView } from "@/lib/beta/account";
import { FARMER_GENERIC_ERROR } from "@/lib/beta/limits";
import { CasePersistenceError } from "@/lib/cases/store";
import { logOps } from "@/lib/security/ops-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const identity = await resolveIdentityFromRequest();
  if (identity.kind !== "registered" || !identity.authUserId) {
    return NextResponse.json({ error: "Log in to see your account." }, { status: 401 });
  }
  try {
    const account = await buildFarmerAccountView(identity);
    return NextResponse.json({ account });
  } catch (error) {
    if (error instanceof CasePersistenceError) {
      logOps("database_failure", { route: "account" });
      return NextResponse.json({ error: FARMER_GENERIC_ERROR }, { status: 503 });
    }
    throw error;
  }
}
