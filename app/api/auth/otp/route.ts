import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/src/lib/supabase/server";
import { buildAuthCallbackUrl } from "@/src/lib/supabase/url";
import {
  isAllowedInstitutionalEmail,
  sanitizeRedirectPath,
} from "@/src/lib/auth/domain";
import {
  ensureCampusUserProfile,
  toAuthErrorResponse,
} from "@/src/lib/auth/guard";

const otpRequestSchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .refine(isAllowedInstitutionalEmail, {
        message:
          "Only @student.president.ac.id and @president.ac.id emails are permitted.",
      }),
    next: z.string().optional(),
  })
  .strict();

function resolveRequestOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";

  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  return request.nextUrl.origin;
}

export async function POST(request: NextRequest) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_JSON",
          message: "Invalid JSON request payload.",
        },
      },
      { status: 400 }
    );
  }

  const parsed = otpRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    const firstIssue =
      parsed.error.issues[0]?.message ?? "Invalid campus email.";
    return NextResponse.json(
      {
        error: {
          code: "UNAUTHORIZED_DOMAIN",
          message: firstIssue,
        },
      },
      { status: 400 }
    );
  }

  const { email, next } = parsed.data;
  const safeNext = sanitizeRedirectPath(next);
  const emailRedirectTo = buildAuthCallbackUrl(
    process.env.NEXT_PUBLIC_APP_URL || resolveRequestOrigin(request)
  );

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo,
      },
    });

    if (error) {
      return NextResponse.json(
        {
          error: {
            code: "OTP_DISPATCH_FAILED",
            message: error.message || "Unable to send campus sign-in link.",
          },
        },
        { status: 400 }
      );
    }

    const response = NextResponse.json({
      ok: true,
      message: `Verification link and OTP code sent to ${email}.`,
    });

    if (safeNext !== "/dashboard") {
      response.cookies.set("pupis_auth_next", safeNext, {
        path: "/",
        maxAge: 600,
        sameSite: "lax",
        httpOnly: false,
      });
    }

    return response;
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "AUTH_SERVICE_UNAVAILABLE",
          message:
            "Authentication service is not configured or temporarily unavailable.",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * Verifies domain guard and auto-provisions `public.users` on the server
 * immediately after a client-side 6-digit OTP verification (`verifyOtp`).
 */
export async function PUT() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user || !user.email) {
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

    await ensureCampusUserProfile(supabase, user);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const authErr = toAuthErrorResponse(error);
    if (authErr) return authErr;

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
