import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import {
  requireAuth,
  SIGNATURES_BUCKET,
  SIGNED_URL_TTL_SECONDS,
  toAuthErrorResponse,
} from "@/src/lib/auth/guard";
import { createClient } from "@/src/lib/supabase/server";
import { createAdminClient } from "@/src/lib/supabase/admin";
import {
  sanitizeStorageFilename,
  validateSignaturePngFile,
} from "@/src/lib/validations/proposal";

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
            message: "Please attach a PNG signature image under the 'file' field.",
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
    const fileBuffer = await uploadedEntry.arrayBuffer();

    const { error: uploadError } = await supabase.storage
      .from(SIGNATURES_BUCKET)
      .upload(newStoragePath, fileBuffer, {
        contentType: "image/png",
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
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

    // Persist storage object path to `public.users.signature_url`
    const { error: userUpdateError } = await supabase
      .from("users")
      .update({ signature_url: newStoragePath })
      .eq("id", profile.id);

    if (userUpdateError) {
      // Fallback: if migration 002 (`public.users.signature_url`) has not been applied
      // on a remote DB yet, also persist in user_metadata so active signature resolution works.
      const isMissingColumnError =
        userUpdateError.code === "PGRST204" ||
        userUpdateError.code === "42703" ||
        userUpdateError.message.includes("signature_url");

      if (!isMissingColumnError) {
        await supabase.storage.from(SIGNATURES_BUCKET).remove([newStoragePath]);
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
    }

    // Keep auth metadata synced as well for resilient server-side lookup
    await supabase.auth.updateUser({
      data: { signature_storage_path: newStoragePath },
    });

    // Safely delete previous profile signature ONLY if owned by this user AND not
    // referenced by any historical signed proposal in `public.proposal_signers`.
    const previousPath = profile.signature_storage_path;
    if (
      previousPath &&
      previousPath !== newStoragePath &&
      previousPath.startsWith(`${profile.id}/`) &&
      !previousPath.includes("..")
    ) {
      const privilegedOrUserClient = process.env.SUPABASE_SERVICE_ROLE_KEY
        ? createAdminClient()
        : supabase;

      const { count: referencedCount } = await privilegedOrUserClient
        .from("proposal_signers")
        .select("id", { count: "exact", head: true })
        .eq("signature_storage_path", previousPath);

      if ((referencedCount ?? 0) === 0) {
        await privilegedOrUserClient.storage
          .from(SIGNATURES_BUCKET)
          .remove([previousPath]);
      }
    }

    // Generate short-lived signed preview URL (`createSignedUrl`)
    const { data: signedData, error: signedError } = await supabase.storage
      .from(SIGNATURES_BUCKET)
      .createSignedUrl(newStoragePath, SIGNED_URL_TTL_SECONDS);

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

    return NextResponse.json({
      ok: true,
      storagePath: newStoragePath,
      signedUrl: signedData.signedUrl,
      expiresIn: SIGNED_URL_TTL_SECONDS,
    });
  } catch (error) {
    const authResponse = toAuthErrorResponse(error);
    if (authResponse) return authResponse;

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
