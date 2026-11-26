import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { requireAuth, toAuthErrorResponse } from "@/src/lib/auth/guard";
import { createClient } from "@/src/lib/supabase/server";
import type { AttachmentKindDb } from "@/src/lib/supabase/database.types";
import {
  uuidSchema,
  validateSupportingAttachmentFile,
} from "@/src/lib/validations/proposal";
import {
  ATTACHMENT_SIGNED_URL_TTL_SECONDS,
  PROPOSAL_ATTACHMENTS_BUCKET,
} from "@/src/lib/proposals/server-helpers";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const profile = await requireAuth();
    const { id } = await context.params;

    const idCheck = uuidSchema.safeParse(id);
    if (!idCheck.success) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_ID",
            message: "Invalid proposal ID format.",
          },
        },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const { data: proposal, error: propError } = await supabase
      .from("proposals")
      .select("id, submitter_id, status, current_version")
      .eq("id", idCheck.data)
      .maybeSingle();

    if (propError || !proposal) {
      return NextResponse.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Proposal not found.",
          },
        },
        { status: 404 }
      );
    }

    if (proposal.submitter_id !== profile.id && profile.role !== "admin") {
      return NextResponse.json(
        {
          error: {
            code: "FORBIDDEN",
            message: "Only the proposal owner can upload attachments.",
          },
        },
        { status: 403 }
      );
    }

    if (proposal.status !== "draft" && proposal.status !== "needs_revision") {
      return NextResponse.json(
        {
          error: {
            code: "PROPOSAL_LOCKED",
            message: "Attachments cannot be added once a proposal is locked in review.",
          },
        },
        { status: 409 }
      );
    }

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

    const fileEntry = formData.get("file");
    if (!(fileEntry instanceof File)) {
      return NextResponse.json(
        {
          error: {
            code: "MISSING_FILE",
            message: "Please attach a file under the 'file' field.",
          },
        },
        { status: 400 }
      );
    }

    const validation = await validateSupportingAttachmentFile(fileEntry);
    if (!validation.valid || !validation.safeFilename || !validation.detectedMime) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_ATTACHMENT",
            message:
              validation.error ??
              "Unsupported or invalid supporting attachment file.",
          },
        },
        { status: 400 }
      );
    }

    const requestedKind = formData.get("attachment_kind");
    const attachmentKind: AttachmentKindDb =
      requestedKind === "primary_proposal_pdf" &&
      validation.detectedMime === "application/pdf"
        ? "primary_proposal_pdf"
        : "supporting";

    const storagePath = `${profile.id}/${proposal.id}/${Date.now()}-${validation.safeFilename}`;
    const fileBuffer = await fileEntry.arrayBuffer();

    const { error: uploadError } = await supabase.storage
      .from(PROPOSAL_ATTACHMENTS_BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: validation.detectedMime,
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
              "Failed to upload attachment to private storage.",
          },
        },
        { status: 500 }
      );
    }

    const targetVersion =
      proposal.status === "needs_revision"
        ? proposal.current_version + 1
        : proposal.current_version;

    const { data: insertedAttachment, error: dbInsertError } = await supabase
      .from("proposal_attachments")
      .insert({
        proposal_id: proposal.id,
        uploaded_by: profile.id,
        file_name: validation.safeFilename,
        mime_type: validation.detectedMime,
        file_size: fileEntry.size,
        storage_path: storagePath,
        attachment_kind: attachmentKind,
        version_number: targetVersion,
      })
      .select("*")
      .single();

    if (dbInsertError || !insertedAttachment) {
      await supabase.storage
        .from(PROPOSAL_ATTACHMENTS_BUCKET)
        .remove([storagePath]);

      return NextResponse.json(
        {
          error: {
            code: "METADATA_INSERT_FAILED",
            message:
              dbInsertError?.message ??
              "Failed to record attachment metadata.",
          },
        },
        { status: 500 }
      );
    }

    const { data: signedData } = await supabase.storage
      .from(PROPOSAL_ATTACHMENTS_BUCKET)
      .createSignedUrl(storagePath, ATTACHMENT_SIGNED_URL_TTL_SECONDS);

    revalidatePath(`/proposals/${proposal.id}/edit`);
    revalidatePath(`/proposals/${proposal.id}`);

    return NextResponse.json(
      {
        ok: true,
        attachment: {
          ...insertedAttachment,
          signed_url: signedData?.signedUrl ?? null,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    const authResp = toAuthErrorResponse(error);
    if (authResp) return authResp;

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Unexpected server error while uploading attachment.",
        },
      },
      { status: 500 }
    );
  }
}
