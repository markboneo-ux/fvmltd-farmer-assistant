import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logOps } from "@/lib/security/ops-log";
import { validateStaffPassword } from "@/lib/staff/recovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let password = "";
  try {
    const body = (await request.json()) as { password?: unknown; confirm?: unknown };
    password = typeof body.password === "string" ? body.password : "";
    const confirm = typeof body.confirm === "string" ? body.confirm : password;
    const valid = validateStaffPassword(password, confirm);
    if (!valid.ok) {
      return NextResponse.json({ error: valid.error }, { status: 400 });
    }
  } catch {
    return NextResponse.json(
      { error: "Enter a new password." },
      { status: 400 },
    );
  }

  try {
    const supabase = await createClient();
    const { data, error: userError } = await supabase.auth.getUser();
    if (userError || !data.user) {
      logOps("auth_failure", {
        route: "staff-reset-password",
        stage: "redirect_session_hydration",
      });
      return NextResponse.json(
        { error: "This reset link is invalid or has expired. Request a new one." },
        { status: 401 },
      );
    }

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      logOps("auth_failure", {
        route: "staff-reset-password",
        error: error.message,
      });
      return NextResponse.json(
        { error: "Could not update that password. Request a new reset link." },
        { status: 400 },
      );
    }

    await supabase.auth.signOut();
    logOps("auth_failure", {
      route: "staff-reset-password",
      stage: "password_updated",
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    logOps("auth_failure", {
      route: "staff-reset-password",
      error: error instanceof Error ? error.message : "reset failed",
    });
    return NextResponse.json(
      { error: "Could not update that password. Try again." },
      { status: 503 },
    );
  }
}
