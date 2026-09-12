/**
 * Staff login failure stages. Logged in full; staff UI stays simple.
 * Farmer-facing screens never import this module.
 */

export const PREVIEW_SUPABASE_HOST = "gcojtfrdjczrvzieynzj.supabase.co";
export const PRODUCTION_SUPABASE_HOST = "qzycpoivwwecooscnnju.supabase.co";

export const STAFF_LOGIN_STAGES = [
  "invalid_credentials",
  "auth_success_no_user",
  "auth_success_no_session",
  "session_cookie_not_persisted",
  "staff_lookup_failed",
  "service_role_project_mismatch",
  "staff_inactive",
  "staff_not_linked",
  "wrong_supabase_environment",
  "redirect_session_hydration",
  "supabase_not_configured",
  "complete",
] as const;

export type StaffLoginStage = (typeof STAFF_LOGIN_STAGES)[number];

export type StaffLoginDebug = {
  stage: StaffLoginStage;
  signInOk: boolean;
  hasUser: boolean;
  hasSession: boolean;
  cookiePersisted: boolean;
  cookieNames: string[];
  authUserId: string | null;
  hydratedUserId: string | null;
  staffRowAuthUserId: string | null;
  staffActive: boolean | null;
  supabaseHost: string | null;
  vercelEnv: string | null;
  lookupErrorClass?: string | null;
  serviceRoleRef?: string | null;
  urlProjectRef?: string | null;
};

export type StaffLoginAttemptSnapshot = {
  supabaseHost: string | null;
  vercelEnv: string | null;
  signInError: string | null;
  userId: string | null;
  hasSession: boolean;
  writtenCookieNames: string[];
  cookieWriteError: string | null;
  hydratedUserId: string | null;
  staffLookupError: string | null;
  staffLookupErrorClass?: string | null;
  staffRowAuthUserId: string | null;
  staffActive: boolean | null;
  staffLinked: boolean;
  serviceRoleRef?: string | null;
  urlProjectRef?: string | null;
};

export function supabaseHostFromUrl(url: string | null | undefined): string | null {
  const raw = url?.trim() ?? "";
  if (!raw) return null;
  try {
    return new URL(raw).hostname || null;
  } catch {
    return null;
  }
}

export function isSessionAuthCookieName(name: string): boolean {
  return /^sb-.+-auth-token(?:\.\d+)?$/.test(name);
}

export function sessionCookieNames(names: string[]): string[] {
  return names.filter(isSessionAuthCookieName);
}

export function detectWrongSupabaseEnvironment(options: {
  supabaseHost: string | null;
  vercelEnv: string | null;
}): boolean {
  const host = options.supabaseHost;
  if (!host) return true;
  const env = options.vercelEnv;
  if (env === "preview" && host === PRODUCTION_SUPABASE_HOST) return true;
  if (env === "production" && host === PREVIEW_SUPABASE_HOST) return true;
  return false;
}

export function staffLoginPublicError(stage: StaffLoginStage): string {
  switch (stage) {
    case "invalid_credentials":
      return "Invalid email or password.";
    case "staff_inactive":
    case "staff_not_linked":
      return "This account is not an active FVMLTD staff member.";
    case "complete":
      return "";
    default:
      return "Could not sign in. Check Supabase configuration and try again.";
  }
}

export function staffLoginHttpStatus(stage: StaffLoginStage): number {
  switch (stage) {
    case "complete":
      return 200;
    case "invalid_credentials":
      return 401;
    case "staff_inactive":
    case "staff_not_linked":
      return 403;
    case "supabase_not_configured":
    case "wrong_supabase_environment":
    case "service_role_project_mismatch":
    case "staff_lookup_failed":
      return 503;
    default:
      return 503;
  }
}

/**
 * Classify each staff-login stage in order so Preview logs name the
 * exact failure instead of a generic catch-all.
 */
export function classifyStaffLoginAttempt(
  snapshot: StaffLoginAttemptSnapshot,
): { stage: StaffLoginStage; status: number } {
  if (!snapshot.supabaseHost) {
    return stageResult("supabase_not_configured");
  }

  if (snapshot.signInError) {
    if (isInvalidCredentialError(snapshot.signInError)) {
      return stageResult("invalid_credentials");
    }
    if (detectWrongSupabaseEnvironment(snapshot)) {
      return stageResult("wrong_supabase_environment");
    }
    return stageResult("invalid_credentials");
  }

  if (!snapshot.userId) {
    return stageResult("auth_success_no_user");
  }

  if (!snapshot.hasSession) {
    return stageResult("auth_success_no_session");
  }

  const cookies = sessionCookieNames(snapshot.writtenCookieNames);
  if (snapshot.cookieWriteError || cookies.length === 0) {
    return stageResult("session_cookie_not_persisted");
  }

  if (snapshot.hydratedUserId && snapshot.hydratedUserId !== snapshot.userId) {
    return stageResult("redirect_session_hydration");
  }

  if (snapshot.staffLookupError) {
    if (detectWrongSupabaseEnvironment(snapshot)) {
      return stageResult("wrong_supabase_environment");
    }
    if (
      snapshot.serviceRoleRef &&
      snapshot.urlProjectRef &&
      snapshot.serviceRoleRef !== snapshot.urlProjectRef
    ) {
      return stageResult("service_role_project_mismatch");
    }
    return stageResult("staff_lookup_failed");
  }

  if (snapshot.staffActive === false) {
    return stageResult("staff_inactive");
  }

  if (!snapshot.staffLinked) {
    if (detectWrongSupabaseEnvironment(snapshot)) {
      return stageResult("wrong_supabase_environment");
    }
    return stageResult("staff_not_linked");
  }

  return stageResult("complete");
}

export function debugFromSnapshot(
  snapshot: StaffLoginAttemptSnapshot,
  stage: StaffLoginStage,
): StaffLoginDebug {
  return {
    stage,
    signInOk: !snapshot.signInError,
    hasUser: Boolean(snapshot.userId),
    hasSession: snapshot.hasSession,
    cookiePersisted: sessionCookieNames(snapshot.writtenCookieNames).length > 0,
    cookieNames: sessionCookieNames(snapshot.writtenCookieNames),
    authUserId: snapshot.userId,
    hydratedUserId: snapshot.hydratedUserId,
    staffRowAuthUserId: snapshot.staffRowAuthUserId,
    staffActive: snapshot.staffActive,
    supabaseHost: snapshot.supabaseHost,
    vercelEnv: snapshot.vercelEnv,
    lookupErrorClass: snapshot.staffLookupErrorClass ?? null,
    serviceRoleRef: snapshot.serviceRoleRef ?? null,
    urlProjectRef: snapshot.urlProjectRef ?? null,
  };
}

function stageResult(stage: StaffLoginStage): { stage: StaffLoginStage; status: number } {
  return { stage, status: staffLoginHttpStatus(stage) };
}

function isInvalidCredentialError(message: string): boolean {
  return /invalid login|invalid credentials|invalid email or password|email not confirmed/i.test(
    message,
  );
}
