import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logOps } from "@/lib/security/ops-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INVALID_LINK = "This reset link is invalid or has expired. Request a new one.";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return NextResponse.json({ error: INVALID_LINK }, { status: 401 });
    }
    return NextResponse.json({ ok: true, email: data.user.email ?? null });
  } catch {
    return NextResponse.json(
      { error: "Supabase is not configured on the server." },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  let code = "";
  let tokenHash = "";
  let accessToken = "";
  let refreshToken = "";
  try {
    const body = (await request.json()) as {
      code?: unknown;
      token_hash?: unknown;
      type?: unknown;
      access_token?: unknown;
      refresh_token?: unknown;
    };
    code = typeof body.code === "string" ? body.code.trim() : "";
    tokenHash = typeof body.token_hash === "string" ? body.token_hash.trim() : "";
    accessToken = typeof body.access_token === "string" ? body.access_token.trim() : "";
    refreshToken = typeof body.refresh_token === "string" ? body.refresh_token.trim() : "";
  } catch {
    return NextResponse.json({ error: INVALID_LINK }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    if (code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error || !data.user) {
        logOps("auth_failure", {
          route: "staff-recover-session",
          stage: "invalid_recovery_code",
          error: error?.message ?? "no user",
        });
        return NextResponse.json({ error: INVALID_LINK }, { status: 401 });
      }
      return NextResponse.json({ ok: true, email: data.user.email ?? null });
    }

    if (tokenHash) {
      const { data, error } = await supabase.auth.verifyOtp({
        type: "recovery",
        token_hash: tokenHash,
      });
      if (error || !data.user) {
        logOps("auth_failure", {
          route: "staff-recover-session",
          stage: "invalid_recovery_token",
          error: error?.message ?? "no user",
        });
        return NextResponse.json({ error: INVALID_LINK }, { status: 401 });
      }
      return NextResponse.json({ ok: true, email: data.user.email ?? null });
    }

    if (accessToken && refreshToken) {
      const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error || !data.user) {
        logOps("auth_failure", {
          route: "staff-recover-session",
          stage: "invalid_recovery_session",
          error: error?.message ?? "no user",
        });
        return NextResponse.json({ error: INVALID_LINK }, { status: 401 });
      }
      return NextResponse.json({ ok: true, email: data.user.email ?? null });
    }

    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return NextResponse.json({ error: INVALID_LINK }, { status: 401 });
    }
    return NextResponse.json({ ok: true, email: data.user.email ?? null });
  } catch (error) {
    logOps("auth_failure", {
      route: "staff-recover-session",
      error: error instanceof Error ? error.message : "session failed",
    });
    return NextResponse.json(
      { error: "Could not open the password reset session." },
      { status: 503 },
    );
  }
}
