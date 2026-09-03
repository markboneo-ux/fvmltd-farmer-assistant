import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  createGuestSessionId,
  GUEST_COOKIE_NAME,
  guestCookieOptions,
  normalizeGuestSessionId,
} from "@/lib/beta/identity";

function withGuestCookie(request: NextRequest, response: NextResponse) {
  const existing = normalizeGuestSessionId(
    request.cookies.get(GUEST_COOKIE_NAME)?.value ?? null,
  );
  if (existing) return response;
  const created = createGuestSessionId();
  response.cookies.set(GUEST_COOKIE_NAME, created, guestCookieOptions());
  return response;
}

/**
 * Guest cookie for all farmer routes.
 * Staff/admin routes require a Supabase Auth session.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isStaffLogin = pathname === "/staff/login";
  const isProtectedPage =
    pathname === "/staff" ||
    pathname.startsWith("/staff/") ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/");
  const isProtectedApi =
    pathname.startsWith("/api/staff") || pathname.startsWith("/api/admin");

  if (!isProtectedPage && !isProtectedApi) {
    return withGuestCookie(request, NextResponse.next());
  }

  if (isStaffLogin) {
    return withGuestCookie(request, NextResponse.next());
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    if (isProtectedApi) {
      return NextResponse.json(
        {
          error:
            "Supabase is not configured on the server. Add the environment variables and try again.",
        },
        { status: 503 },
      );
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/staff/login";
    loginUrl.searchParams.set("error", "config");
    return NextResponse.redirect(loginUrl);
  }

  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({
          request: { headers: request.headers },
        });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (isProtectedApi) {
      return NextResponse.json(
        { error: "Sign in with your FVMLTD staff account to continue." },
        { status: 401 },
      );
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/staff/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return withGuestCookie(request, response);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|brand/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
