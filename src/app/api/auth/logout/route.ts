import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logOps } from "@/lib/security/ops-log";
import { farmerFacingError } from "@/lib/beta/farmer-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
    return NextResponse.json({ ok: true });
  } catch (error) {
    logOps("auth_failure", {
      error: error instanceof Error ? error.message : "logout failed",
    });
    return NextResponse.json({ error: farmerFacingError(null) }, { status: 503 });
  }
}
