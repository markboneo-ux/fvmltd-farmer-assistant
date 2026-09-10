import "server-only";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { tryCreateAdminClient } from "@/lib/supabase/helpers";
import type { StaffRole, StaffUser } from "./types";

type StaffRow = {
  id: string;
  auth_user_id: string | null;
  full_name: string;
  email: string;
  role: string;
  is_active: boolean;
};

export function mapStaffUser(
  row: StaffRow,
  sessionAuthUserId: string,
): StaffUser | null {
  if (!row.is_active) return null;
  const linkedAuthId = row.auth_user_id ?? row.id;
  if (linkedAuthId !== sessionAuthUserId) return null;
  const role = row.role as StaffRole;
  if (role !== "admin" && role !== "agronomist" && role !== "reviewer") {
    return null;
  }
  return {
    id: row.id,
    authUserId: linkedAuthId,
    fullName: row.full_name,
    email: row.email,
    role,
    isActive: row.is_active,
  };
}

/**
 * Resolve the authenticated FVMLTD staff user for the current request.
 * Requires a Supabase Auth session linked to an active staff_profiles row.
 */
export async function getStaffSession(): Promise<
  | { ok: true; staff: StaffUser }
  | { ok: false; status: 401 | 403 | 503; error: string }
> {
  let authUserId: string;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return {
        ok: false,
        status: 401,
        error: "Sign in with your FVMLTD staff account to continue.",
      };
    }
    authUserId = data.user.id;
  } catch {
    return {
      ok: false,
      status: 503,
      error:
        "Supabase is not configured on the server. Add the environment variables and try again.",
    };
  }

  const admin = tryCreateAdminClient();
  if (!admin.ok) {
    return { ok: false, status: 503, error: admin.error };
  }

  const { data: byAuth, error: byAuthError } = await admin.client
    .from("staff_profiles")
    .select("id, auth_user_id, full_name, email, role, is_active")
    .eq("is_active", true)
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (byAuthError) {
    console.error("Staff session lookup failed:", byAuthError);
    return {
      ok: false,
      status: 503,
      error: "Could not verify staff access.",
    };
  }

  const byAuthStaff = byAuth ? mapStaffUser(byAuth, authUserId) : null;
  if (byAuthStaff) {
    return { ok: true, staff: byAuthStaff };
  }

  const { data: byId, error: byIdError } = await admin.client
    .from("staff_profiles")
    .select("id, auth_user_id, full_name, email, role, is_active")
    .eq("is_active", true)
    .eq("id", authUserId)
    .maybeSingle();

  if (byIdError) {
    console.error("Staff session lookup failed:", byIdError);
    return {
      ok: false,
      status: 503,
      error: "Could not verify staff access.",
    };
  }

  const staff = byId ? mapStaffUser(byId, authUserId) : null;
  if (!staff) {
    return {
      ok: false,
      status: 403,
      error: "This account is not an active FVMLTD staff member.",
    };
  }

  return { ok: true, staff };
}

export async function requireStaffApi() {
  const session = await getStaffSession();
  if (!session.ok) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: session.error },
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
