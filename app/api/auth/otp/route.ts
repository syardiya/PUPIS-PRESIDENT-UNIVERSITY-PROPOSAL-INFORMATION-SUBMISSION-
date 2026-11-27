import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/src/lib/supabase/server";
import { isAllowedInstitutionalEmail } from "@/src/lib/auth/domain";
import {
  AuthGuardError,
  ensureCampusUserProfile,
} from "@/src/lib/auth/guard";

/**
 * Magic Link / OTP dispatch is disabled in favor of institutional Email + Password sign-in.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: {
        code: "OTP_DISABLED",
        message:
          "Magic Link & OTP sign-in is disabled. Please sign in with your President University email and password.",
      },
    },
    { status: 410 }
  );
}

/**
 * Verifies Zero-Trust campus domain guard and idempotently initializes `public.users`
 * using the server-side Service Role client immediately after `signInWithPassword`.
 */
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Extract optional Bearer token in case browser cookies are still flushing right after signInWithPassword
    const authHeader = request.headers.get("authorization") ?? "";
    const bearerToken = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : "";

    let {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if ((authError || !user) && bearerToken) {
      const tokenResult = await supabase.auth.getUser(bearerToken);
      user = tokenResult.data.user;
      authError = tokenResult.error;
    }

    if (authError || !user || !user.email) {
      console.error("[PUT /api/auth/otp] Unauthenticated session:", authError);
      return NextResponse.json(
        {
          error: {
            code: "UNAUTHENTICATED",
            message: "No active authenticated session found.",
          },
        },
        { status: 401 }
      );
    }

    const normalizedEmail = user.email.trim().toLowerCase();
    if (!isAllowedInstitutionalEmail(normalizedEmail)) {
      console.error(
        "[PUT /api/auth/otp] Rejected non-campus email domain:",
        normalizedEmail
      );
      await supabase.auth.signOut();
      return NextResponse.json(
        {
          error: {
            code: "UNAUTHORIZED_DOMAIN",
            message:
              "Access restricted to President University (@student.president.ac.id or @president.ac.id) accounts.",
          },
        },
        { status: 403 }
      );
    }

    const profile = await ensureCampusUserProfile(supabase, user);

    return NextResponse.json({
      ok: true,
      profile: {
        id: profile.id,
        email: profile.email,
        role: profile.role,
      },
    });
  } catch (error) {
    console.error("[PUT /api/auth/otp] Profile provisioning error:", error);

    if (error instanceof AuthGuardError) {
      // Return 403 strictly for unauthorized domain; surface server provisioning failures as 500 with clear message
      const status = error.code === "UNAUTHORIZED_DOMAIN" ? 403 : 500;
      return NextResponse.json(
        {
          error: {
            code: error.code,
            message: error.message,
          },
        },
        { status }
      );
    }

    return NextResponse.json(
      {
        error: {
          code: "PROFILE_SYNC_FAILED",
          message:
            "Authenticated campus account could not be initialized in public.users.",
        },
      },
      { status: 500 }
    );
  }
}
