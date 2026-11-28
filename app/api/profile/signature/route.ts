import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  requireAuth,
  SIGNATURES_BUCKET,
  SIGNED_URL_TTL_SECONDS,
  toAuthErrorResponse,
} from "@/src/lib/auth/guard";
import { createClient } from "@/src/lib/supabase/server";
import { createAdminClient } from "@/src/lib/supabase/admin";
import type { Database } from "@/src/lib/supabase/database.types";
import { normalizeEnvValue } from "@/src/lib/supabase/url";
import {
  sanitizeStorageFilename,
  validateSignaturePngFile,
} from "@/src/lib/validations/proposal";

function getOptionalAdminClient(): SupabaseClient<Database> | null {
  if (!normalizeEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    return null;
  }
  try {
    return createAdminClient();
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const profile = await requireAuth();

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_FORM_DATA",
            message: "Expected multipart/form-data upload payload.",
          },
        },
        { status: 400 }
      );
    }

    const uploadedEntry = formData.get("file");
    if (!(uploadedEntry instanceof File)) {
      return NextResponse.json(
        {
          error: {
            code: "MISSING_FILE",
            message:
              "Please attach a PNG signature image under the 'file' field.",
          },
        },
        { status: 400 }
      );
    }

    // Validate MIME (`image/png`), size (<= 2 MB), safe filename, and PNG magic bytes
    const validation = await validateSignaturePngFile(uploadedEntry, {
      verifyMagicBytes: true,
    });

    if (!validation.valid) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_SIGNATURE_PNG",
            message:
              validation.error ??
              "Only valid PNG files up to 2 MB are accepted.",
          },
        },
        { status: 400 }
      );
    }

    // Enforce canonical storage path `<user_id>/signature-<timestamp>.png`
    const safeGeneratedName = sanitizeStorageFilename(
      `signature-${Date.now()}.png`
    );
    const newStoragePath = `${profile.id}/${safeGeneratedName}`;

    const supabase = await createClient();
    const adminClient = getOptionalAdminClient();
    const fileBuffer = await uploadedEntry.arrayBuffer();

    // 1. Upload PNG to private `user-signatures` bucket (try user session first, fallback to adminClient)
    let { error: uploadError } = await supabase.storage
      .from(SIGNATURES_BUCKET)
      .upload(newStoragePath, fileBuffer, {
        contentType: "image/png",
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError && adminClient) {
      const retryUpload = await adminClient.storage
        .from(SIGNATURES_BUCKET)
        .upload(newStoragePath, fileBuffer, {
          contentType: "image/png",
          cacheControl: "3600",
          upsert: false,
        });
      uploadError = retryUpload.error;
    }

    if (uploadError) {
      console.error(
        "[POST /api/profile/signature] Storage upload failed:",
        uploadError
      );
      return NextResponse.json(
        {
          error: {
            code: "STORAGE_UPLOAD_FAILED",
            message:
              uploadError.message ||
              "Failed to upload signature to private storage.",
          },
        },
        { status: 500 }
      );
    }

    // 2. Link uploaded signature path to `public.users.signature_url` (using Service Role scoped strictly to `profile.id`)
    //    AND sync `auth.users` `user_metadata.signature_storage_path` for resilient resolution.
    const privilegedDbClient = adminClient ?? supabase;
    let linkedInUsersTable = false;
    let linkedInAuthMetadata = false;

    const { error: userUpdateError } = await privilegedDbClient
      .from("users")
      .update({ signature_url: newStoragePath })
      .eq("id", profile.id);

    if (!userUpdateError) {
      linkedInUsersTable = true;
    }

    const { error: authMetaError } = await supabase.auth.updateUser({
      data: { signature_storage_path: newStoragePath },
    });

    if (!authMetaError) {
      linkedInAuthMetadata = true;
    } else if (adminClient) {
      const { data: existingAuthUser } =
        await adminClient.auth.admin.getUserById(profile.id);
      const currentMeta =
        (existingAuthUser?.user?.user_metadata as
          | Record<string, unknown>
          | undefined) ?? {};
      const { error: adminMetaError } =
        await adminClient.auth.admin.updateUserById(profile.id, {
          user_metadata: {
            ...currentMeta,
            signature_storage_path: newStoragePath,
          },
        });
      if (!adminMetaError) {
        linkedInAuthMetadata = true;
      }
    }

    // Only fail if NEITHER `public.users.signature_url` NOR `auth.users` metadata persisted the path
    if (!linkedInUsersTable && !linkedInAuthMetadata) {
      console.error(
        "[POST /api/profile/signature] Failed to link signature path:",
        {
          userId: profile.id,
          userUpdateError,
          authMetaError,
        }
      );
      await privilegedDbClient.storage
        .from(SIGNATURES_BUCKET)
        .remove([newStoragePath]);
      return NextResponse.json(
        {
          error: {
            code: "PROFILE_SIGNATURE_SAVE_FAILED",
            message: "Failed to link uploaded signature to user profile.",
          },
        },
        { status: 500 }
      );
    }

    // 3. Safely delete previous profile signature ONLY if owned by this user AND not
    //    referenced by any historical signed proposal in `public.proposal_signers`.
    const previousPath = profile.signature_storage_path;
    if (
      previousPath &&
      previousPath !== newStoragePath &&
      previousPath.startsWith(`${profile.id}/`) &&
      !previousPath.includes("..")
    ) {
      const { count: referencedCount } = await privilegedDbClient
        .from("proposal_signers")
        .select("id", { count: "exact", head: true })
        .eq("signature_storage_path", previousPath);

      if ((referencedCount ?? 0) === 0) {
        await privilegedDbClient.storage
          .from(SIGNATURES_BUCKET)
          .remove([previousPath]);
      }
    }

    // 4. Generate short-lived signed preview URL (`createSignedUrl`)
    let { data: signedData, error: signedError } = await supabase.storage
      .from(SIGNATURES_BUCKET)
      .createSignedUrl(newStoragePath, SIGNED_URL_TTL_SECONDS);

    if ((!signedData?.signedUrl || signedError) && adminClient) {
      const adminSigned = await adminClient.storage
        .from(SIGNATURES_BUCKET)
        .createSignedUrl(newStoragePath, SIGNED_URL_TTL_SECONDS);
      signedData = adminSigned.data;
      signedError = adminSigned.error;
    }

    if (signedError || !signedData?.signedUrl) {
      return NextResponse.json(
        {
          error: {
            code: "SIGNED_URL_GENERATION_FAILED",
            message:
              "Signature saved, but short-lived preview URL could not be generated.",
          },
        },
        { status: 500 }
      );
    }

    revalidatePath("/profile");
    revalidatePath("/dashboard");
    revalidatePath("/approvals");
    revalidatePath("/proposals/new");

    return NextResponse.json({
      ok: true,
      storagePath: newStoragePath,
      signedUrl: signedData.signedUrl,
      expiresIn: SIGNED_URL_TTL_SECONDS,
    });
  } catch (error) {
    const authResponse = toAuthErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("[POST /api/profile/signature] Unexpected error:", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Unexpected error while saving digital signature.",
        },
      },
      { status: 500 }
    );
  }
}
