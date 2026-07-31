import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Protect FVMLTD staff routes. Requires a Supabase Auth session.
 * Active staff membership is verified again in staff pages / API handlers.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isStaffLogin = pathname === "/staff/login";
  const isStaffPage = pathname === "/staff" || pathname.startsWith("/staff/");
  const isStaffApi = pathname.startsWith("/api/staff");

  if (!isStaffPage && !isStaffApi) {
    return NextResponse.next();
  }

  // Login page is public (API still checks membership after sign-in).
  if (isStaffLogin) {
    return NextResponse.next();
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    if (isStaffApi) {
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
    if (isStaffApi) {
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

  return response;
}

export const config = {
  matcher: ["/staff", "/staff/:path*", "/api/staff/:path*"],
};
