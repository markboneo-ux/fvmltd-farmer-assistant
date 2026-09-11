import "server-only";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { tryCreateAdminClient } from "@/lib/supabase/helpers";
import { logOps } from "@/lib/security/ops-log";
import {
  supabaseHostFromUrl,
  type StaffLoginStage,
} from "./login-stages";
import type { StaffRole, StaffUser } from "./types";

export type StaffRow = {
  id: string;
  auth_user_id: string | null;
  full_name: string;
  email: string;
  role: string;
  is_active: boolean;
};

const STAFF_SELECT = "id, auth_user_id, full_name, email, role, is_active";

export function mapStaffUser(
  row: StaffRow,
  sessionAuthUserId: string,
): StaffUser | null {
  const classified = classifyStaffRow(row, sessionAuthUserId);
  return classified.ok ? classified.staff : null;
}

export function classifyStaffRow(
  row: StaffRow | null,
  sessionAuthUserId: string,
):
  | { ok: true; staff: StaffUser }
  | { ok: false; reason: "staff_inactive" | "staff_not_linked" } {
  if (!row) return { ok: false, reason: "staff_not_linked" };
  if (!row.is_active) return { ok: false, reason: "staff_inactive" };
  const linkedAuthId = row.auth_user_id ?? row.id;
  if (linkedAuthId !== sessionAuthUserId) {
    return { ok: false, reason: "staff_not_linked" };
  }
  const role = row.role as StaffRole;
  if (role !== "admin" && role !== "agronomist" && role !== "reviewer") {
    return { ok: false, reason: "staff_not_linked" };
  }
  return {
    ok: true,
    staff: {
      id: row.id,
      authUserId: linkedAuthId,
      fullName: row.full_name,
      email: row.email,
      role,
      isActive: row.is_active,
    },
  };
}

function staffProfiles(client: { from: (table: string) => unknown }) {
  return client.from("staff_profiles") as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => PromiseLike<{
          data: StaffRow | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
}

/**
 * Resolve staff by auth_user_id first (confirmed mapping).
 * Does not filter is_active in SQL so inactive rows can be diagnosed.
 */
export async function lookupStaffRowForAuthUser(
  client: { from: (table: string) => unknown },
  authUserId: string,
): Promise<
  | { ok: true; row: StaffRow | null }
  | { ok: false; error: string }
> {
  const { data: byAuth, error: byAuthError } = await staffProfiles(client)
    .select(STAFF_SELECT)
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (byAuthError) {
    return { ok: false, error: byAuthError.message };
  }
  if (byAuth) return { ok: true, row: byAuth };

  const { data: byId, error: byIdError } = await staffProfiles(client)
    .select(STAFF_SELECT)
    .eq("id", authUserId)
    .maybeSingle();

  if (byIdError) {
    return { ok: false, error: byIdError.message };
  }
  return { ok: true, row: byId };
}

/**
 * Resolve the authenticated FVMLTD staff user for the current request.
 * Requires a Supabase Auth session linked to an active staff_profiles row.
 */
export async function getStaffSession(): Promise<
  | { ok: true; staff: StaffUser }
  | { ok: false; status: 401 | 403 | 503; error: string; stage?: StaffLoginStage }
> {
  const supabaseHost = supabaseHostFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const vercelEnv = process.env.VERCEL_ENV ?? null;

  let authUserId: string;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      logStaffGate("redirect_session_hydration", {
        supabaseHost,
        vercelEnv,
        hasAuthUser: false,
      });
      return {
        ok: false,
        status: 401,
        stage: "redirect_session_hydration",
        error: "Sign in with your FVMLTD staff account to continue.",
      };
    }
    authUserId = data.user.id;
  } catch {
    logStaffGate("supabase_not_configured", { supabaseHost, vercelEnv });
    return {
      ok: false,
      status: 503,
      stage: "supabase_not_configured",
      error:
        "Supabase is not configured on the server. Add the environment variables and try again.",
    };
  }

  const admin = tryCreateAdminClient();
  if (!admin.ok) {
    logStaffGate("supabase_not_configured", {
      supabaseHost,
      vercelEnv,
      authUserId,
    });
    return {
      ok: false,
      status: 503,
      stage: "supabase_not_configured",
      error: admin.error,
    };
  }

  const lookup = await lookupStaffRowForAuthUser(admin.client, authUserId);
  if (!lookup.ok) {
    logStaffGate("staff_lookup_failed", {
      supabaseHost,
      vercelEnv,
      authUserId,
      error: lookup.error,
    });
    return {
      ok: false,
      status: 503,
      stage: "staff_lookup_failed",
      error: "Could not verify staff access.",
    };
  }

  const classified = classifyStaffRow(lookup.row, authUserId);
  if (!classified.ok) {
    logStaffGate(classified.reason, {
      supabaseHost,
      vercelEnv,
      authUserId,
      staffRowAuthUserId: lookup.row?.auth_user_id ?? null,
      staffActive: lookup.row?.is_active ?? null,
    });
    return {
      ok: false,
      status: 403,
      stage: classified.reason,
      error: "This account is not an active FVMLTD staff member.",
    };
  }

  return { ok: true, staff: classified.staff };
}

function logStaffGate(
  stage: StaffLoginStage,
  extra?: Record<string, string | boolean | null | undefined>,
) {
  logOps("auth_failure", {
    route: "getStaffSession",
    stage,
    ...extra,
  });
}

export async function requireStaffApi() {
  const session = await getStaffSession();
  if (!session.ok) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: session.error, stage: session.stage ?? null },
        { status: session.status },
      ),
    };
  }

  const admin = tryCreateAdminClient();
  if (!admin.ok) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: admin.error }, { status: 503 }),
    };
  }

  return {
    ok: true as const,
    staff: session.staff,
    client: admin.client,
  };
}
