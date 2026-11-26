import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/src/lib/supabase/server";
import { createAdminClient } from "@/src/lib/supabase/admin";
import type { UserRole } from "@/src/lib/supabase/database.types";
import {
  extractEmailDomain,
  isAllowedInstitutionalEmail,
  sanitizeRedirectPath,
} from "@/src/lib/auth/domain";

function deriveDisplayName(email: string, metadata: Record<string, unknown>): string {
  const metaFullName =
    typeof metadata.full_name === "string" ? metadata.full_name.trim() : "";
  if (metaFullName) return metaFullName;

  const metaName =
    typeof metadata.name === "string" ? metadata.name.trim() : "";
  if (metaName) return metaName;

  const localPart = email.split("@")[0] ?? "Campus User";
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

/**
 * Maps institutional email domain to canonical `public.users.role` (`student` | `staff` | `admin`)
 * when creating a fallback profile record (if not already configured in `public.users`).
 * - `@president.ac.id` -> `'admin'` (unless already configured in `public.users`)
 * - `@student.president.ac.id` -> `'student'` (canonical submitter role per `users_role_check`)
 */
function resolveFallbackProfileRole(email: string): UserRole {
  const domain = extractEmailDomain(email);
  if (domain === "president.ac.id") {
    return "admin";
  }
  return "student";
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const otpType = requestUrl.searchParams.get("type") as EmailOtpType | null;
  const nextPath = sanitizeRedirectPath(requestUrl.searchParams.get("next"));

  const buildLoginErrorRedirect = (errorCode: string) => {
    const loginUrl = new URL("/login", requestUrl.origin);
    loginUrl.searchParams.set("error", errorCode);
    return NextResponse.redirect(loginUrl);
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

    // Ensure a corresponding profile record exists in `public.users` without overwriting configured roles
    const dbClient = process.env.SUPABASE_SERVICE_ROLE_KEY
      ? createAdminClient()
      : supabase;

    const { data: existingProfile, error: selectError } = await dbClient
      .from("users")
      .select("id, role")
      .eq("id", user.id)
      .maybeSingle();

    if (selectError) {
      return buildLoginErrorRedirect("profile_lookup_failed");
    }

    if (!existingProfile) {
      const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
      const fullName = deriveDisplayName(normalizedEmail, metadata);
      const organizationUnit =
        typeof metadata.organization_unit === "string" &&
        metadata.organization_unit.trim() !== ""
          ? metadata.organization_unit.trim()
          : null;

      const defaultRole = resolveFallbackProfileRole(normalizedEmail);

      const { error: insertError } = await dbClient.from("users").insert({
        id: user.id,
        email: normalizedEmail,
        full_name: fullName,
        organization_unit: organizationUnit,
        role: defaultRole,
      });

      if (insertError) {
        return buildLoginErrorRedirect("profile_sync_failed");
      }
    }

    return NextResponse.redirect(new URL(nextPath, requestUrl.origin));
  } catch {
    return buildLoginErrorRedirect("unexpected_auth_error");
  }
}
