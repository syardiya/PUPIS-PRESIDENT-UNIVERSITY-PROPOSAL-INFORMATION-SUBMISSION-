import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/src/lib/supabase/server";
import {
  isAllowedInstitutionalEmail,
  sanitizeRedirectPath,
} from "@/src/lib/auth/domain";

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
    const firstIssue = parsed.error.issues[0]?.message ?? "Invalid campus email.";
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
  const origin = new URL(request.url).origin;
  const callbackUrl = new URL("/auth/callback", origin);
  callbackUrl.searchParams.set("next", safeNext);

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: callbackUrl.toString(),
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

    return NextResponse.json({
      ok: true,
      message: `Verification link and OTP code sent to ${email}.`,
    });
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
