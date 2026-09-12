import {
  classifyStaffLookupError,
  isMissingStaffColumnError,
  sanitizeLookupError,
} from "@/lib/staff/lookup-error";
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
  hasEmailColumn: boolean | null;
  authUserExists: boolean | null;
  authAdminError: string | null;
  staffRowExists: boolean | null;
  staffRowActive: boolean | null;
  staffRowHasAuthUserId: boolean | null;
  authUserIdMatchesStaffRow: boolean | null;
};

type StaffRowProbe = {
  id?: string;
  auth_user_id?: string | null;
  email?: string | null;
  is_active?: boolean | null;
};

type AdminLike = {
  from: (table: string) => {
    select: (columns: string) => {
      limit: (n: number) => PromiseLike<{
        data: unknown[] | null;
        error: { message: string } | null;
      }>;
      eq: (
        column: string,
        value: string,
      ) => {
        maybeSingle: () => PromiseLike<{
          data: StaffRowProbe | null;
          error: { message: string } | null;
        }>;
      };
      ilike: (
        column: string,
        value: string,
      ) => {
        maybeSingle: () => PromiseLike<{
          data: StaffRowProbe | null;
          error: { message: string } | null;
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
    hasEmailColumn: null,
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

  const emailProbe = await options.client
    .from("staff_profiles")
    .select("id, auth_user_id, email, is_active")
    .limit(0);
  if (emailProbe.error) {
    result.hasEmailColumn = !isMissingStaffColumnError(emailProbe.error.message)
      ? null
      : !/email/i.test(emailProbe.error.message);
    result.staffProfilesError = sanitizeLookupError(emailProbe.error.message);
    result.staffProfilesErrorClass = classifyStaffLookupError(emailProbe.error.message);
  } else {
    result.hasEmailColumn = true;
    result.staffProfilesReadable = true;
  }

  const authColProbe = await options.client
    .from("staff_profiles")
    .select("id, auth_user_id, is_active")
    .limit(0);
  if (authColProbe.error) {
    result.hasAuthUserIdColumn = isMissingStaffColumnError(authColProbe.error.message)
      ? !/auth_user_id/i.test(authColProbe.error.message)
      : null;
    result.staffProfilesError =
      result.staffProfilesError ?? sanitizeLookupError(authColProbe.error.message);
    result.staffProfilesErrorClass =
      result.staffProfilesErrorClass ?? classifyStaffLookupError(authColProbe.error.message);
  } else {
    result.hasAuthUserIdColumn = true;
    result.staffProfilesReadable = true;
    if (emailProbe.error) {
      result.hasEmailColumn = false;
    }
  }

  let authUserId: string | null = null;
  try {
    const listed = await options.client.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (listed.error) {
      result.authAdminError = sanitizeLookupError(listed.error.message);
    } else {
      const authUser = listed.data.users.find(
        (user) => (user.email ?? "").toLowerCase() === PREVIEW_STAFF_EMAIL,
      );
      result.authUserExists = Boolean(authUser);
      authUserId = authUser?.id ?? null;
    }
  } catch (error) {
    result.authAdminError = sanitizeLookupError(
      error instanceof Error ? error.message : "auth admin failed",
    );
  }

  if (authUserId) {
    const byAuth = await options.client
      .from("staff_profiles")
      .select("id, auth_user_id, is_active")
      .eq("auth_user_id", authUserId)
      .maybeSingle();
    if (byAuth.error) {
      result.staffProfilesError =
        result.staffProfilesError ?? sanitizeLookupError(byAuth.error.message);
      result.staffProfilesErrorClass =
        result.staffProfilesErrorClass ?? classifyStaffLookupError(byAuth.error.message);
    } else {
      result.staffProfilesReadable = true;
      result.staffRowExists = Boolean(byAuth.data);
      result.staffRowActive = byAuth.data?.is_active ?? null;
      result.staffRowHasAuthUserId = Boolean(byAuth.data?.auth_user_id);
      result.authUserIdMatchesStaffRow = byAuth.data?.auth_user_id === authUserId;
    }
  }

  return result;
}
