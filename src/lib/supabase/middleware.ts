import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";
import { isAllowedInstitutionalEmail } from "../auth/domain";

const PROTECTED_ROUTE_PREFIXES = [
  "/dashboard",
  "/proposals",
  "/approvals",
  "/archive",
  "/profile",
  "/notifications",
  "/admin",
] as const;

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function copyCookies(source: NextResponse, target: NextResponse): NextResponse {
  for (const cookie of source.cookies.getAll()) {
    target.cookies.set(cookie);
  }
  return target;
}

/**
 * Refreshes the Supabase SSR session cookie, enforces the President University
 * institutional email domain whitelist (`PBI-01`), and protects workspace routes.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Fail-closed for protected routes if Supabase credentials are not configured in production
  if (!supabaseUrl || !supabaseAnonKey) {
    if (process.env.NODE_ENV === "production" && isProtectedPath(pathname)) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set("error", "auth_not_configured");
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        supabaseResponse = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          supabaseResponse.cookies.set(name, value, options);
        }
      },
    },
  });

  // Always resolve user via server-verified `getUser()` rather than unverified cookie storage
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Enforce institutional domain whitelist (`@student.president.ac.id` / `@president.ac.id`)
  if (user && !isAllowedInstitutionalEmail(user.email)) {
    await supabase.auth.signOut();

    const unauthorizedUrl = request.nextUrl.clone();
    unauthorizedUrl.pathname = "/login";
    unauthorizedUrl.search = "";
    unauthorizedUrl.searchParams.set("error", "unauthorized_domain");

    return copyCookies(supabaseResponse, NextResponse.redirect(unauthorizedUrl));
  }

  // Block unauthenticated access to protected application routes
  if (!user && isProtectedPath(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("next", `${pathname}${search}`);

    return copyCookies(supabaseResponse, NextResponse.redirect(loginUrl));
  }

  // Redirect already-authenticated campus users away from /login unless handling an error
  if (
    user &&
    pathname === "/login" &&
    !request.nextUrl.searchParams.has("error")
  ) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    dashboardUrl.search = "";

    return copyCookies(supabaseResponse, NextResponse.redirect(dashboardUrl));
  }

  return supabaseResponse;
}
