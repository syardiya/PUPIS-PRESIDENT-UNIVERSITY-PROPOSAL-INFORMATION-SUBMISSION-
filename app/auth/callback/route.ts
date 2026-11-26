import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/src/lib/supabase/server";
import { resolveCleanAppOrigin } from "@/src/lib/supabase/url";
import {
  isAllowedInstitutionalEmail,
  sanitizeRedirectPath,
} from "@/src/lib/auth/domain";
import { ensureCampusUserProfile } from "@/src/lib/auth/guard";

function resolveCallbackRedirectOrigin(request: NextRequest): string {
  const forwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  const forwardedProto =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";

  if (forwardedHost) {
    return resolveCleanAppOrigin(`${forwardedProto}://${forwardedHost}`);
  }

  return resolveCleanAppOrigin(request.nextUrl.origin);
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const redirectOrigin = resolveCallbackRedirectOrigin(request);

  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const otpType = requestUrl.searchParams.get("type") as EmailOtpType | null;

  const rawCookieNext = request.cookies.get("pupis_auth_next")?.value;
  let decodedCookieNext: string | undefined;
  if (rawCookieNext) {
    try {
      decodedCookieNext = decodeURIComponent(rawCookieNext);
    } catch {
      decodedCookieNext = undefined;
    }
  }
  const nextPath = sanitizeRedirectPath(
    requestUrl.searchParams.get("next") ?? decodedCookieNext
  );

  const buildLoginErrorRedirect = (errorCode: string) => {
    const loginUrl = new URL("/login", redirectOrigin);
    loginUrl.searchParams.set("error", errorCode);
    if (nextPath !== "/dashboard") {
      loginUrl.searchParams.set("next", nextPath);
    }
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete("pupis_auth_next");
    return response;
  };

  if (!code && !(tokenHash && otpType)) {
    return buildLoginErrorRedirect("missing_auth_code");
  }

  try {
    const supabase = await createClient();

    if (code) {
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(
        code
      );
      if (exchangeError) {
        return buildLoginErrorRedirect("auth_callback_failed");
      }
    } else if (tokenHash && otpType) {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: otpType,
      });
      if (verifyError) {
        return buildLoginErrorRedirect("auth_callback_failed");
      }
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user || !user.email) {
      await supabase.auth.signOut();
      return buildLoginErrorRedirect("auth_user_unavailable");
    }

    const normalizedEmail = user.email.trim().toLowerCase();

    // Strictly enforce President University institutional domain whitelist (`PBI-01`)
    if (!isAllowedInstitutionalEmail(normalizedEmail)) {
      await supabase.auth.signOut();
      return buildLoginErrorRedirect("unauthorized_domain");
    }

    // Ensure profile record exists in `public.users` without overwriting configured roles
    try {
      await ensureCampusUserProfile(supabase, user);
    } catch {
      return buildLoginErrorRedirect("profile_sync_failed");
    }

    const destinationResponse = NextResponse.redirect(
      new URL(nextPath, redirectOrigin)
    );
    destinationResponse.cookies.delete("pupis_auth_next");
    return destinationResponse;
  } catch {
    return buildLoginErrorRedirect("auth_callback_failed");
  }
}
