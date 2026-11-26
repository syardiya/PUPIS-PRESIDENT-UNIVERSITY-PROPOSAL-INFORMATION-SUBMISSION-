import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { requireAuth, toAuthErrorResponse } from "@/src/lib/auth/guard";
import { createClient } from "@/src/lib/supabase/server";
import { uuidSchema } from "@/src/lib/validations/proposal";
import { PROPOSAL_ATTACHMENTS_BUCKET } from "@/src/lib/proposals/server-helpers";

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string; attachmentId: string }> }
) {
  try {
    const profile = await requireAuth();
    const { id, attachmentId } = await context.params;

    const propIdCheck = uuidSchema.safeParse(id);
    const attIdCheck = uuidSchema.safeParse(attachmentId);
    if (!propIdCheck.success || !attIdCheck.success) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_ID",
            message: "Invalid proposal or attachment UUID.",
          },
        },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const { data: proposal, error: propError } = await supabase
      .from("proposals")
      .select("id, submitter_id, status")
      .eq("id", propIdCheck.data)
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
            message: "Only the proposal owner can delete attachments.",
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
            message:
              "Attachments cannot be removed once a proposal is locked in review.",
          },
        },
        { status: 409 }
      );
    }

    // Anti-IDOR: scope lookup to BOTH attachmentId AND proposal.id
    const { data: attachment, error: attError } = await supabase
      .from("proposal_attachments")
      .select("id, proposal_id, storage_path")
      .eq("id", attIdCheck.data)
      .eq("proposal_id", proposal.id)
      .maybeSingle();

    if (attError || !attachment) {
      return NextResponse.json(
        {
          error: {
            code: "ATTACHMENT_NOT_FOUND",
            message: "Attachment not found on this proposal.",
          },
        },
        { status: 404 }
      );
    }

    await supabase.storage
      .from(PROPOSAL_ATTACHMENTS_BUCKET)
      .remove([attachment.storage_path]);

    const { error: deleteError } = await supabase
      .from("proposal_attachments")
      .delete()
      .eq("id", attachment.id)
      .eq("proposal_id", proposal.id);

    if (deleteError) {
      return NextResponse.json(
        {
          error: {
            code: "ATTACHMENT_DELETE_FAILED",
            message: deleteError.message || "Unable to remove attachment record.",
          },
        },
        { status: 500 }
      );
    }

    revalidatePath(`/proposals/${proposal.id}/edit`);
    revalidatePath(`/proposals/${proposal.id}`);

    return NextResponse.json({
      ok: true,
      deletedId: attachment.id,
    });
  } catch (error) {
    const authResp = toAuthErrorResponse(error);
    if (authResp) return authResp;

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Unexpected error while deleting attachment.",
        },
      },
      { status: 500 }
    );
  }
}
