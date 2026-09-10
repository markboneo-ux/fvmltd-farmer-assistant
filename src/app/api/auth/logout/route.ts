import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { farmerAuthError } from "@/lib/auth/farmer-auth-error";
import { logOps } from "@/lib/security/ops-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      logOps("auth_failure", { error: error.message });
      return NextResponse.json(
        { error: farmerAuthError(error).message },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: farmerAuthError(error instanceof Error ? error.message : null).message },
      { status: 503 },
    );
  }
}
