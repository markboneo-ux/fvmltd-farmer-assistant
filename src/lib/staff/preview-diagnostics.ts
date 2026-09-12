import { classifyStaffLookupError, sanitizeLookupError } from "@/lib/staff/lookup-error";
import {
  projectRefFromJwt,
  projectRefFromSupabaseUrl,
} from "@/lib/supabase/project-ref";

export const PREVIEW_STAFF_EMAIL = "info@fvmltd.com";

export type StaffPreviewDiagnostics = {
  supabaseHost: string | null;
  urlProjectRef: string | null;
  serviceRoleRef: string | null;
  serviceRoleMatchesUrl: boolean | null;
  vercelEnv: string | null;
  staffProfilesReadable: boolean;
  staffProfilesError: string | null;
  staffProfilesErrorClass: string | null;
  hasAuthUserIdColumn: boolean | null;
  authUserExists: boolean | null;
  authAdminError: string | null;
  staffRowExists: boolean | null;
  staffRowActive: boolean | null;
  staffRowHasAuthUserId: boolean | null;
  authUserIdMatchesStaffRow: boolean | null;
};

type AdminLike = {
  from: (table: string) => {
    select: (columns: string) => {
      limit: (n: number) => PromiseLike<{
        data: unknown[] | null;
        error: { message: string; code?: string } | null;
      }>;
      ilike: (
        column: string,
        value: string,
      ) => {
        maybeSingle: () => PromiseLike<{
          data: {
            id?: string;
            auth_user_id?: string | null;
            email?: string | null;
            is_active?: boolean | null;
          } | null;
          error: { message: string; code?: string } | null;
        }>;
      };
    };
  };
  auth: {
    admin: {
      listUsers: (params?: { page?: number; perPage?: number }) => Promise<{
        data: { users: Array<{ id: string; email?: string | null }> };
        error: { message: string } | null;
      }>;
    };
  };
};

export function emptyDiagnostics(partial?: Partial<StaffPreviewDiagnostics>): StaffPreviewDiagnostics {
  return {
    supabaseHost: null,
    urlProjectRef: null,
    serviceRoleRef: null,
    serviceRoleMatchesUrl: null,
    vercelEnv: process.env.VERCEL_ENV ?? null,
    staffProfilesReadable: false,
    staffProfilesError: null,
    staffProfilesErrorClass: null,
    hasAuthUserIdColumn: null,
    authUserExists: null,
    authAdminError: null,
    staffRowExists: null,
    staffRowActive: null,
    staffRowHasAuthUserId: null,
    authUserIdMatchesStaffRow: null,
    ...partial,
  };
}

export async function probeStaffPreview(options: {
  supabaseUrl: string;
  serviceRoleKey: string;
  client: AdminLike;
}): Promise<StaffPreviewDiagnostics> {
  const urlProjectRef = projectRefFromSupabaseUrl(options.supabaseUrl);
  const serviceRoleRef = projectRefFromJwt(options.serviceRoleKey);
  const result = emptyDiagnostics({
    supabaseHost: urlProjectRef ? `${urlProjectRef}.supabase.co` : null,
    urlProjectRef,
    serviceRoleRef,
    serviceRoleMatchesUrl:
      urlProjectRef && serviceRoleRef ? urlProjectRef === serviceRoleRef : null,
  });

  const columnProbe = await options.client
    .from("staff_profiles")
    .select("id, auth_user_id, email, is_active")
    .limit(0);
  if (columnProbe.error) {
    result.staffProfilesError = sanitizeLookupError(columnProbe.error.message);
    result.staffProfilesErrorClass = classifyStaffLookupError(columnProbe.error.message);
    result.hasAuthUserIdColumn =
      classifyStaffLookupError(columnProbe.error.message) === "missing_column" ? false : null;
  } else {
    result.staffProfilesReadable = true;
    result.hasAuthUserIdColumn = true;
  }

  const rowProbe = await options.client
    .from("staff_profiles")
    .select("id, auth_user_id, email, is_active")
    .ilike("email", PREVIEW_STAFF_EMAIL)
    .maybeSingle();
  if (rowProbe.error) {
    result.staffProfilesError =
      result.staffProfilesError ?? sanitizeLookupError(rowProbe.error.message);
    result.staffProfilesErrorClass =
      result.staffProfilesErrorClass ?? classifyStaffLookupError(rowProbe.error.message);
    if (classifyStaffLookupError(rowProbe.error.message) === "missing_column") {
      result.hasAuthUserIdColumn = false;
    }
  } else {
    result.staffProfilesReadable = true;
    result.staffRowExists = Boolean(rowProbe.data);
    result.staffRowActive = rowProbe.data?.is_active ?? null;
    result.staffRowHasAuthUserId = Boolean(rowProbe.data?.auth_user_id);
  }

  try {
    const listed = await options.client.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (listed.error) {
      result.authAdminError = sanitizeLookupError(listed.error.message);
    } else {
      const authUser = listed.data.users.find(
        (user) => (user.email ?? "").toLowerCase() === PREVIEW_STAFF_EMAIL,
      );
      result.authUserExists = Boolean(authUser);
      if (authUser && rowProbe.data?.auth_user_id) {
        result.authUserIdMatchesStaffRow = rowProbe.data.auth_user_id === authUser.id;
      } else if (authUser && rowProbe.data && !rowProbe.error) {
        result.authUserIdMatchesStaffRow = false;
      }
    }
  } catch (error) {
    result.authAdminError = sanitizeLookupError(
      error instanceof Error ? error.message : "auth admin failed",
    );
  }

  return result;
}
