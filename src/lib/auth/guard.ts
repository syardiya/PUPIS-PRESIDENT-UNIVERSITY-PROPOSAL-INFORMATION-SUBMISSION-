import "server-only";

import { NextResponse } from "next/server";
import { createClient } from "../supabase/server";
import type { UserRole } from "../supabase/database.types";
import { isAllowedInstitutionalEmail } from "./domain";

const SIGNATURES_BUCKET =
  process.env.NEXT_PUBLIC_SIGNATURES_BUCKET || "user-signatures";
const SIGNED_URL_TTL_SECONDS = 300; // 5-minute short-lived signed URL per Zero Trust standard

export type AuthGuardErrorCode =
  | "UNAUTHENTICATED"
  | "UNAUTHORIZED_DOMAIN"
  | "PROFILE_NOT_FOUND"
  | "FORBIDDEN_ROLE";

export class AuthGuardError extends Error {
  public readonly status: 401 | 403 | 404;
  public readonly code: AuthGuardErrorCode;

  constructor(
    code: AuthGuardErrorCode,
    message: string,
    status: 401 | 403 | 404
  ) {
    super(message);
    this.name = "AuthGuardError";
    this.code = code;
    this.status = status;
  }
}

export interface AuthenticatedUserProfile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  /** Canonical column from `public.users` */
  organization_unit: string | null;
  /** Convenience alias mapped from `organization_unit` */
  organization_name: string | null;
  /** Short-lived signed URL for user's latest saved signature (if any), never a public bucket URL */
  signature_url: string | null;
  created_at: string;
}

/**
 * Resolves the current authenticated user strictly from server-side Supabase Auth
 * (`supabase.auth.getUser()`) together with their `public.users` profile.
 * Returns `null` when no active session exists.
 * Throws `AuthGuardError` if the session email violates the institutional whitelist.
 */
export async function getCurrentUserProfile(): Promise<AuthenticatedUserProfile | null> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return null;
  }

  if (!isAllowedInstitutionalEmail(user.email)) {
    await supabase.auth.signOut();
    throw new AuthGuardError(
      "UNAUTHORIZED_DOMAIN",
      "Access restricted to President University (@student.president.ac.id or @president.ac.id) accounts.",
      403
    );
  }

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("id, email, full_name, organization_unit, role, created_at")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile) {
    throw new AuthGuardError(
      "PROFILE_NOT_FOUND",
      "Authenticated campus user profile was not found in public.users.",
      403
    );
  }

  // Resolve optional short-lived signed URL from the user's most recent signature in `proposal_signers`
  let signatureUrl: string | null = null;
  const { data: latestSignature } = await supabase
    .from("proposal_signers")
    .select("signature_storage_path")
    .eq("approver_id", profile.id)
    .not("signature_storage_path", "is", null)
    .order("signed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestSignature?.signature_storage_path) {
    const { data: signedData } = await supabase.storage
      .from(SIGNATURES_BUCKET)
      .createSignedUrl(
        latestSignature.signature_storage_path,
        SIGNED_URL_TTL_SECONDS
      );
    signatureUrl = signedData?.signedUrl ?? null;
  }

  return {
    id: profile.id,
    email: profile.email,
    full_name: profile.full_name,
    role: profile.role,
    organization_unit: profile.organization_unit,
    organization_name: profile.organization_unit,
    signature_url: signatureUrl,
    created_at: profile.created_at,
  };
}

/**
 * Enforces that the request comes from an authenticated President University user
 * with a valid `public.users` record.
 */
export async function requireAuth(): Promise<AuthenticatedUserProfile> {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    throw new AuthGuardError(
      "UNAUTHENTICATED",
      "Authentication required. Please sign in with your President University account.",
      401
    );
  }
  return profile;
}

/**
 * Enforces both authentication and role membership (`student` | `staff` | `admin`).
 */
export async function requireRole(
  allowedRoles: readonly UserRole[]
): Promise<AuthenticatedUserProfile> {
  const profile = await requireAuth();
  if (!allowedRoles.includes(profile.role)) {
    throw new AuthGuardError(
      "FORBIDDEN_ROLE",
      `Insufficient permissions. Required role: ${allowedRoles.join(" or ")}.`,
      403
    );
  }
  return profile;
}

/**
 * Converts an `AuthGuardError` into a standardized JSON `NextResponse` for API Route Handlers.
 */
export function toAuthErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof AuthGuardError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
        },
      },
      { status: error.status }
    );
  }
  return null;
}
