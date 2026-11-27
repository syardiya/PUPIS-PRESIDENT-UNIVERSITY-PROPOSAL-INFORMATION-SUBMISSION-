import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "./src/lib/supabase/middleware";

/**
 * Next.js 16 Proxy convention (replaces deprecated `middleware.ts`).
 * Refreshes Supabase Auth sessions, enforces President University email domain
 * whitelist, and guards authenticated routes while allowing `/api/auth/otp`
 * profile-provisioning requests through to the Route Handler.
 */
export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/api/auth/otp") {
    return NextResponse.next({ request });
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
