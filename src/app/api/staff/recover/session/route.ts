import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import {
  pkceVerifierCookieName,
  projectRefFromSupabaseUrl,
} from "@/lib/supabase/project-ref";
import { logOps } from "@/lib/security/ops-log";
import {
  recoveryUserError,
  type RecoveryHydrateBody,
  type RecoveryLinkFormat,
} from "@/lib/staff/recovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hasPkceVerifierCookie(cookieNames: string[], supabaseUrl: string): boolean {
  const ref = projectRefFromSupabaseUrl(supabaseUrl);
  if (!ref) return false;
  const verifierName = pkceVerifierCookieName(ref);
  return cookieNames.some(
    (name) => name === verifierName || name.startsWith(`${verifierName}.`),
  );
}

function resolveFormat(body: RecoveryHydrateBody): RecoveryLinkFormat {
  if (
    body.format === "pkce_code" ||
    body.format === "token_hash" ||
    body.format === "hash_tokens" ||
    body.format === "mixed" ||
    body.format === "none"
  ) {
    return body.format;
  }
  const flags = [
    Boolean(body.code),
    Boolean(body.token_hash),
    Boolean(body.access_token && body.refresh_token),
  ].filter(Boolean).length;
  if (flags === 0) return "none";
  if (flags > 1) return "mixed";
  if (body.token_hash) return "token_hash";
  if (body.access_token) return "hash_tokens";
  return "pkce_code";
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return NextResponse.json({ ok: false, sessionReady: false }, { status: 200 });
    }
    return NextResponse.json({
      ok: true,
      sessionReady: true,
      email: data.user.email ?? null,
    });
  } catch {
    return NextResponse.json(
      { error: "Supabase is not configured on the server." },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  let body: RecoveryHydrateBody = {};
  try {
    body = (await request.json()) as RecoveryHydrateBody;
  } catch {
    return NextResponse.json(
      { error: recoveryUserError("invalid_recovery_session"), stage: "invalid_recovery_session" },
      { status: 400 },
    );
  }

  const code = typeof body.code === "string" ? body.code.trim() : "";
  const tokenHash = typeof body.token_hash === "string" ? body.token_hash.trim() : "";
  const accessToken = typeof body.access_token === "string" ? body.access_token.trim() : "";
  const refreshToken = typeof body.refresh_token === "string" ? body.refresh_token.trim() : "";
  const format = resolveFormat({
    ...body,
    code: code || undefined,
    token_hash: tokenHash || undefined,
    access_token: accessToken || undefined,
    refresh_token: refreshToken || undefined,
  });

  let pkceVerifierPresent = false;
  try {
    const { url } = getSupabasePublicEnv();
    const cookieStore = await cookies();
    pkceVerifierPresent = hasPkceVerifierCookie(
      cookieStore.getAll().map((cookie) => cookie.name),
      url,
    );
  } catch {
    pkceVerifierPresent = false;
  }

  logOps("auth_failure", {
    route: "staff-recover-session",
    stage: body.inspect_only ? "recovery_format_inspect" : "recovery_format_hydrate",
    format,
    pkceVerifierPresent,
  });

  if (body.inspect_only) {
    const pkceBlocked = format === "pkce_code" && !pkceVerifierPresent;
    return NextResponse.json({
      ok: true,
      format,
      pkceVerifierPresent,
      canHydrate: format !== "none" && !pkceBlocked,
      stage: pkceBlocked ? "pkce_verifier_missing" : "recovery_format_inspect",
    });
  }

  try {
    const supabase = await createClient();
    const useTokenHash =
      Boolean(tokenHash) && (format === "token_hash" || format === "mixed");
    const useHashTokens =
      Boolean(accessToken && refreshToken) &&
      (format === "hash_tokens" || format === "mixed") &&
      !useTokenHash;
    const usePkceCode =
      Boolean(code) && (format === "pkce_code" || format === "mixed") && !useTokenHash && !useHashTokens;

    if (usePkceCode) {
      if (!pkceVerifierPresent) {
        logOps("auth_failure", {
          route: "staff-recover-session",
          stage: "pkce_verifier_missing",
          format,
        });
        return NextResponse.json(
          {
            error: recoveryUserError("pkce_verifier_missing"),
            stage: "pkce_verifier_missing",
            format,
          },
          { status: 401 },
        );
      }
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error || !data.user) {
        logOps("auth_failure", {
          route: "staff-recover-session",
          stage: "invalid_recovery_code",
          format,
          error: error?.message ?? "no user",
        });
        return NextResponse.json(
          {
            error: recoveryUserError("invalid_recovery_code"),
            stage: "invalid_recovery_code",
            format,
          },
          { status: 401 },
        );
      }
      return NextResponse.json({ ok: true, email: data.user.email ?? null, format });
    }

    if (useTokenHash) {
      const { data, error } = await supabase.auth.verifyOtp({
        type: "recovery",
        token_hash: tokenHash,
      });
      if (error || !data.user) {
        logOps("auth_failure", {
          route: "staff-recover-session",
          stage: "invalid_recovery_token",
          format,
          error: error?.message ?? "no user",
        });
        return NextResponse.json(
          {
            error: recoveryUserError("invalid_recovery_token"),
            stage: "invalid_recovery_token",
            format,
          },
          { status: 401 },
        );
      }
      return NextResponse.json({ ok: true, email: data.user.email ?? null, format });
    }

    if (useHashTokens) {
      const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error || !data.user) {
        logOps("auth_failure", {
          route: "staff-recover-session",
          stage: "invalid_recovery_session",
          format,
          error: error?.message ?? "no user",
        });
        return NextResponse.json(
          {
            error: recoveryUserError("invalid_recovery_session"),
            stage: "invalid_recovery_session",
            format,
          },
          { status: 401 },
        );
      }
      return NextResponse.json({ ok: true, email: data.user.email ?? null, format });
    }

    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return NextResponse.json(
        {
          error: recoveryUserError("invalid_recovery_session"),
          stage: "invalid_recovery_session",
          format,
        },
        { status: 401 },
      );
    }
    return NextResponse.json({ ok: true, email: data.user.email ?? null, format });
  } catch (error) {
    logOps("auth_failure", {
      route: "staff-recover-session",
      error: error instanceof Error ? error.message : "session failed",
      format,
    });
    return NextResponse.json(
      { error: "Could not open the password reset session." },
      { status: 503 },
    );
  }
}
