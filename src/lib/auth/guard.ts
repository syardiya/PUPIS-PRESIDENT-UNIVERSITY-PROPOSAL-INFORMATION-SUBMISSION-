import "server-only";

import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/src/lib/supabase/server";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { normalizeEnvValue } from "@/src/lib/supabase/url";
import type { Database, UserRole } from "@/src/lib/supabase/database.types";
import {
  extractEmailDomain,
  isAllowedInstitutionalEmail,
} from "@/src/lib/auth/domain";

export const SIGNATURES_BUCKET =
  process.env.NEXT_PUBLIC_SIGNATURES_BUCKET || "user-signatures";
export const SIGNED_URL_TTL_SECONDS = 300; // 5-minute short-lived signed URL per Zero Trust standard

export type CampusUserRow = Database["public"]["Tables"]["users"]["Row"];

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

function deriveCampusDisplayName(
  email: string,
  metadata: Record<string, unknown>
): string {
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

function resolveDefaultCampusRole(email: string): UserRole {
  const domain = extractEmailDomain(email);
  return domain === "president.ac.id" ? "staff" : "student";
}

/**
 * Idempotently ensures an authenticated President University user
 * (`@student.president.ac.id` or `@president.ac.id`) has a corresponding row
 * in `public.users` without overwriting existing configured roles.
 */
export async function ensureCampusUserProfile(
  supabase: SupabaseClient<Database>,
  user: User
): Promise<CampusUserRow> {
  const normalizedEmail = (user.email ?? "").trim().toLowerCase();
  if (!isAllowedInstitutionalEmail(normalizedEmail)) {
    throw new AuthGuardError(
      "UNAUTHORIZED_DOMAIN",
      "Access restricted to President University (@student.president.ac.id or @president.ac.id) accounts.",
      403
    );
  }

  const dbClient = normalizeEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY)
    ? createAdminClient()
    : supabase;

  const { data: existingProfile, error: selectError } = await dbClient
    .from("users")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (selectError) {
    throw new AuthGuardError(
      "PROFILE_NOT_FOUND",
      "Unable to look up campus user profile in public.users.",
      403
    );
  }

  if (existingProfile) {
    return existingProfile;
  }

  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const fullName = deriveCampusDisplayName(normalizedEmail, metadata);
  const organizationUnit =
    typeof metadata.organization_unit === "string" &&
    metadata.organization_unit.trim() !== ""
      ? metadata.organization_unit.trim()
      : null;
  const defaultRole = resolveDefaultCampusRole(normalizedEmail);

  const { data: insertedProfile, error: insertError } = await dbClient
    .from("users")
    .insert({
      id: user.id,
      email: normalizedEmail,
      full_name: fullName,
      organization_unit: organizationUnit,
      role: defaultRole,
    })
    .select("*")
    .single();

  if (!insertError && insertedProfile) {
    return insertedProfile;
  }

  // Handle concurrent provisioning race (e.g., `on_auth_user_created` DB trigger or parallel SSR requests)
  const { data: racedProfile } = await dbClient
    .from("users")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (racedProfile) {
    return racedProfile;
  }

  throw new AuthGuardError(
    "PROFILE_NOT_FOUND",
    "Authenticated campus user profile could not be provisioned in public.users.",
    403
  );
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

  const profile = await ensureCampusUserProfile(supabase, user);

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
