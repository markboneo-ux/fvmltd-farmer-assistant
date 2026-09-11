import type { StaffRole, StaffUser } from "./types";

export type StaffDenyReason =
  | "session_cookie"
  | "missing_env"
  | "supabase_config"
  | "auth_credentials"
  | "missing_staff_row"
  | "inactive_staff"
  | "auth_user_id_mismatch"
  | "invalid_role";

export type StaffProfileRow = {
  id: string;
  auth_user_id: string | null;
  full_name: string;
  email: string | null;
  role: string;
  is_active: boolean;
};

export function staffPublicError(reason: StaffDenyReason): string {
  switch (reason) {
    case "auth_credentials":
      return "Invalid email or password.";
    case "session_cookie":
      return "Sign in with your FVMLTD staff account to continue.";
    case "missing_env":
    case "supabase_config":
      return "Could not verify staff access. Check Supabase configuration.";
    default:
      return "This account is not an active FVMLTD staff member.";
  }
}

/**
 * Authorize a Supabase Auth user against a staff_profiles row.
 * Staff must be active and staff_profiles.auth_user_id must equal the Auth user id.
 */
export function authorizeStaffRecord(
  authUserId: string,
  row: StaffProfileRow | null,
): { ok: true; staff: StaffUser } | { ok: false; reason: StaffDenyReason } {
  if (!row) {
    return { ok: false, reason: "missing_staff_row" };
  }
  if (!row.is_active) {
    return { ok: false, reason: "inactive_staff" };
  }
  if (!row.auth_user_id) {
    return { ok: false, reason: "auth_user_id_mismatch" };
  }
  if (row.auth_user_id !== authUserId) {
    return { ok: false, reason: "auth_user_id_mismatch" };
  }
  const role = row.role as StaffRole;
  if (role !== "admin" && role !== "agronomist" && role !== "reviewer") {
    return { ok: false, reason: "invalid_role" };
  }
  return {
    ok: true,
    staff: {
      id: row.id,
      authUserId: row.auth_user_id,
      fullName: row.full_name,
      email: row.email ?? "",
      role,
      isActive: row.is_active,
    },
  };
}
