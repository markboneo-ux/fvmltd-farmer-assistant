import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabasePublicEnv, getSupabaseServiceRoleKey } from "@/lib/supabase/env";
import { tryCreateAdminClient } from "@/lib/supabase/helpers";
import {
  projectRefFromJwt,
  projectRefFromSupabaseUrl,
} from "@/lib/supabase/project-ref";
import { logOps } from "@/lib/security/ops-log";
import { classifyStaffRow, lookupStaffRowForAuthUser } from "./auth";
import {
  classifyStaffLookupError,
  sanitizeLookupError,
} from "./lookup-error";
import type { StaffUser } from "./types";
import {
  classifyStaffLoginAttempt,
  debugFromSnapshot,
  staffLoginPublicError,
  supabaseHostFromUrl,
  type StaffLoginAttemptSnapshot,
  type StaffLoginDebug,
} from "./login-stages";

type WrittenCookie = { name: string; value: string };

export type StaffPasswordLoginResult =
  | {
      ok: true;
      staff: StaffUser;
      debug: StaffLoginDebug;
    }
  | {
      ok: false;
      status: number;
      error: string;
      debug: StaffLoginDebug;
    };

/**
 * Password staff login with each Preview failure stage named explicitly.
 * Session cookies are written on the server so they persist on the Preview host.
 */
export async function staffPasswordLogin(options: {
  email: string;
  password: string;
}): Promise<StaffPasswordLoginResult> {
  const vercelEnv = process.env.VERCEL_ENV ?? null;
  let supabaseHost: string | null = null;
  let urlProjectRef: string | null = null;
  let serviceRoleRef: string | null = null;
  const written: WrittenCookie[] = [];
  let cookieWriteError: string | null = null;

  try {
    const { url, anonKey } = getSupabasePublicEnv();
    supabaseHost = supabaseHostFromUrl(url);
    urlProjectRef = projectRefFromSupabaseUrl(url);
    try {
      serviceRoleRef = projectRefFromJwt(getSupabaseServiceRoleKey());
    } catch {
      serviceRoleRef = null;
    }
    const cookieStore = await cookies();

    const supabase = createServerClient(url, anonKey, {
      cookieOptions: {
        path: "/",
        sameSite: "lax",
      },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              written.push({ name, value });
              cookieStore.set(name, value, options);
            });
          } catch (error) {
            cookieWriteError =
              error instanceof Error ? error.message : "cookie write failed";
          }
        },
      },
    });

    const { data, error } = await supabase.auth.signInWithPassword({
      email: options.email,
      password: options.password,
    });

    if (data.session) {
      await supabase.auth.getSession();
    }

    const userId = data.user?.id ?? null;
    const hasSession = Boolean(data.session?.access_token);

    const snapshot: StaffLoginAttemptSnapshot = {
      supabaseHost,
      vercelEnv,
      signInError: error?.message ?? null,
      userId,
      hasSession,
      writtenCookieNames: written.map((cookie) => cookie.name),
      cookieWriteError,
      hydratedUserId: null,
      staffLookupError: null,
      staffLookupErrorClass: null,
      staffRowAuthUserId: null,
      staffActive: null,
      staffLinked: false,
      serviceRoleRef,
      urlProjectRef,
    };

    if (error || !userId || !hasSession) {
      return fail(snapshot);
    }

    snapshot.hydratedUserId = await hydrateUserIdFromCookies({
      url,
      anonKey,
      written,
    });

    const admin = tryCreateAdminClient();
    if (!admin.ok) {
      snapshot.staffLookupError = admin.error;
      snapshot.staffLookupErrorClass = classifyStaffLookupError(admin.error);
      return fail(snapshot);
    }

    let lookup = await lookupStaffRowForAuthUser(admin.client, userId);
    if (!lookup.ok) {
      snapshot.staffLookupError = sanitizeLookupError(lookup.error);
      snapshot.staffLookupErrorClass = classifyStaffLookupError(lookup.error);
      const sessionLookup = await lookupStaffRowForAuthUser(supabase, userId);
      if (sessionLookup.ok) {
        lookup = sessionLookup;
        snapshot.staffLookupError = null;
        snapshot.staffLookupErrorClass = null;
      } else {
        return fail(snapshot);
      }
    }

    snapshot.staffRowAuthUserId = lookup.row?.auth_user_id ?? null;
    snapshot.staffActive = lookup.row?.is_active ?? null;
    const classified = classifyStaffRow(lookup.row, userId);
    snapshot.staffLinked = classified.ok;

    if (!classified.ok) {
      await supabase.auth.signOut();
      return fail(snapshot);
    }

    const classifiedAttempt = classifyStaffLoginAttempt(snapshot);
    if (classifiedAttempt.stage !== "complete") {
      await supabase.auth.signOut();
      return fail(snapshot);
    }

    const debug = debugFromSnapshot(snapshot, "complete");
    console.info("[staff-login]", {
      stage: debug.stage,
      signInOk: debug.signInOk,
      hasUser: debug.hasUser,
      hasSession: debug.hasSession,
      cookiePersisted: debug.cookiePersisted,
      authUserMatchesHydration: debug.authUserId === debug.hydratedUserId,
      supabaseHost: debug.supabaseHost,
      vercelEnv: debug.vercelEnv,
    });
    return { ok: true, staff: classified.staff, debug };
  } catch (error) {
    const snapshot: StaffLoginAttemptSnapshot = {
      supabaseHost,
      vercelEnv,
      signInError: error instanceof Error ? error.message : "sign-in failed",
      userId: null,
      hasSession: false,
      writtenCookieNames: written.map((cookie) => cookie.name),
      cookieWriteError,
      hydratedUserId: null,
      staffLookupError: null,
      staffLookupErrorClass: null,
      staffRowAuthUserId: null,
      staffActive: null,
      staffLinked: false,
      serviceRoleRef,
      urlProjectRef,
    };
    return fail(snapshot);
  }
}

async function hydrateUserIdFromCookies(options: {
  url: string;
  anonKey: string;
  written: WrittenCookie[];
}): Promise<string | null> {
  if (options.written.length === 0) return null;
  try {
    const cookieOnly = createServerClient(options.url, options.anonKey, {
      cookies: {
        getAll() {
          return options.written;
        },
        setAll() {
          // Read-only verification client.
        },
      },
    });
    const { data, error } = await cookieOnly.auth.getUser();
    if (error || !data.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

function fail(snapshot: StaffLoginAttemptSnapshot): StaffPasswordLoginResult {
  const classified = classifyStaffLoginAttempt(snapshot);
  const debug = debugFromSnapshot(snapshot, classified.stage);
  logOps("auth_failure", {
    route: "staff-login",
    stage: debug.stage,
    signInOk: debug.signInOk,
    hasUser: debug.hasUser,
    hasSession: debug.hasSession,
    cookiePersisted: debug.cookiePersisted,
    cookieCount: debug.cookieNames.length,
    authUserMatchesHydration:
      Boolean(debug.authUserId) && debug.authUserId === debug.hydratedUserId,
    staffActive: debug.staffActive,
    supabaseHost: debug.supabaseHost,
    vercelEnv: debug.vercelEnv,
    lookupErrorClass: debug.lookupErrorClass ?? null,
    serviceRoleRef: debug.serviceRoleRef ?? null,
    urlProjectRef: debug.urlProjectRef ?? null,
  });
  return {
    ok: false,
    status: classified.status,
    error: staffLoginPublicError(classified.stage),
    debug,
  };
}
