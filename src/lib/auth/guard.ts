import "server-only";

import { NextResponse } from "next/server";
import { createClient } from "../supabase/server";
import type { UserRole } from "../supabase/database.types";
import { isAllowedInstitutionalEmail } from "./domain";

export const SIGNATURES_BUCKET =
  process.env.NEXT_PUBLIC_SIGNATURES_BUCKET || "user-signatures";
export const SIGNED_URL_TTL_SECONDS = 300; // 5-minute short-lived signed URL per Zero Trust standard

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
  /** Raw storage object path inside private `user-signatures` bucket (if configured) */
  signature_storage_path: string | null;
  /** Short-lived signed preview URL for the user's active signature (never a public bucket URL) */
  signature_url: string | null;
  created_at: string;
}

/**
 * Returns true if the user holds Approver (`staff`) or `admin` privileges.
 */
export function isApproverOrAdminRole(role: UserRole | string): boolean {
  return role === "staff" || role === "approver" || role === "admin";
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

  // Use `select("*")` so profile resolution works seamlessly whether migration 002
  // (`signature_url` column) has already been applied or only migration 001 is present.
  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile) {
    throw new AuthGuardError(
      "PROFILE_NOT_FOUND",
      "Authenticated campus user profile was not found in public.users.",
      403
    );
  }

  const metadataPath =
    typeof user.user_metadata?.signature_storage_path === "string" &&
    user.user_metadata.signature_storage_path.trim() !== ""
      ? user.user_metadata.signature_storage_path.trim()
      : null;

  let signatureStoragePath: string | null =
    typeof profile.signature_url === "string" && profile.signature_url.trim() !== ""
      ? profile.signature_url.trim()
      : metadataPath;

  if (!signatureStoragePath) {
    const { data: latestSignature } = await supabase
      .from("proposal_signers")
      .select("signature_storage_path")
      .eq("approver_id", profile.id)
      .not("signature_storage_path", "is", null)
      .order("signed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    signatureStoragePath = latestSignature?.signature_storage_path ?? null;
  }

  let signedPreviewUrl: string | null = null;
  if (signatureStoragePath) {
    const { data: signedData } = await supabase.storage
      .from(SIGNATURES_BUCKET)
      .createSignedUrl(signatureStoragePath, SIGNED_URL_TTL_SECONDS);
    signedPreviewUrl = signedData?.signedUrl ?? null;
  }

  return {
    id: profile.id,
    email: profile.email,
    full_name: profile.full_name,
    role: profile.role,
    organization_unit: profile.organization_unit,
    organization_name: profile.organization_unit,
    signature_storage_path: signatureStoragePath,
    signature_url: signedPreviewUrl,
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
