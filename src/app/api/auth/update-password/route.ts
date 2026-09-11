import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { farmerAuthError } from "@/lib/auth/farmer-auth-error";
import { logOps } from "@/lib/security/ops-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let password = "";
  try {
    const body = (await request.json()) as { password?: unknown };
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ error: "Enter a new password." }, { status: 400 });
  }
  if (!password || password.length < 8) {
    return NextResponse.json(
      { error: "Enter a password with at least 8 characters." },
      { status: 400 },
    );
  }

  try {
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return NextResponse.json(
        { error: "Open the reset link from your email, then set a new password." },
        { status: 401 },
      );
    }

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      logOps("auth_failure", { route: "update-password", error: error.message });
      return NextResponse.json(
        { error: farmerAuthError(error).message, code: farmerAuthError(error).code },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true, sessionEstablished: true });
  } catch (error) {
    logOps("auth_failure", {
      route: "update-password",
      error: error instanceof Error ? error.message : "update password failed",
    });
    return NextResponse.json(
      { error: farmerAuthError(error instanceof Error ? error.message : null).message },
      { status: 503 },
    );
  }
}
