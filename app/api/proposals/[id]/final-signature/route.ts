import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { requireAuth, toAuthErrorResponse } from "@/src/lib/auth/guard";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { createClient } from "@/src/lib/supabase/server";
import { normalizeEnvValue } from "@/src/lib/supabase/url";
import { uuidSchema } from "@/src/lib/validations/proposal";
import { finalSignatureBodySchema } from "@/src/lib/validations/approval";
import { generateVerificationCode } from "@/src/lib/proposals/approval-helpers";
import { isStudentAffairsProfile } from "@/src/lib/proposals/approver-authority";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const profile = await requireAuth();

    if (!isStudentAffairsProfile(profile)) {
      return NextResponse.json(
        {
          error: {
            code: "FORBIDDEN_ROLE",
            message:
              "Only Student Affairs accounts are authorized to apply the final signature on approved proposals.",
          },
        },
        { status: 403 }
      );
    }

    const { id } = await context.params;
    const idCheck = uuidSchema.safeParse(id);
    if (!idCheck.success) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_ID",
            message: "Invalid proposal UUID.",
          },
        },
        { status: 400 }
      );
    }

    let rawBody: unknown = {};
    const contentLength = request.headers.get("content-length");
    if (contentLength && contentLength !== "0") {
      try {
        rawBody = await request.json();
      } catch {
        return NextResponse.json(
          {
            error: {
              code: "INVALID_JSON",
              message: "Invalid JSON payload.",
            },
          },
          { status: 400 }
        );
      }
    }

    const parsedBody = finalSignatureBodySchema.safeParse(rawBody);
    if (!parsedBody.success) {
      const issue = parsedBody.error.issues[0];
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message:
              issue?.message ?? "Invalid final signature request payload.",
          },
        },
        { status: 400 }
      );
    }

    if (!profile.signature_storage_path) {
      return NextResponse.json(
        {
          error: {
            code: "SIGNATURE_REQUIRED",
            message:
              "Please configure your active Digital Signature on the Profile page before applying the final signature.",
          },
        },
        { status: 422 }
      );
    }

    const supabase = await createClient();
    const dbClient = normalizeEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY)
      ? createAdminClient()
      : supabase;

    const { data: proposal, error: propError } = await dbClient
      .from("proposals")
      .select(
        "id, proposal_code, submitter_id, title, organization_name, status, current_version"
      )
      .eq("id", idCheck.data)
      .maybeSingle();

    if (propError || !proposal || proposal.status === "draft") {
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

    if (proposal.status !== "approved") {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_PROPOSAL_STATUS",
            message:
              proposal.status === "completed"
                ? "Final signature has already been recorded for this proposal."
                : `Proposal must be in 'approved' status before Student Affairs final signature can be applied (current status: '${proposal.status}').`,
          },
        },
        { status: 409 }
      );
    }

    const { data: signers } = await dbClient
      .from("proposal_signers")
      .select("id, status")
      .eq("proposal_id", proposal.id);

    const hasUnsignedStep =
      !signers ||
      signers.length === 0 ||
      signers.some((s) => s.status !== "signed");

    if (hasUnsignedStep) {
      return NextResponse.json(
        {
          error: {
            code: "INCOMPLETE_APPROVAL_CHAIN",
            message:
              "All assigned sequential approvers must complete their approval before the final signature can be applied.",
          },
        },
        { status: 409 }
      );
    }

    const nowIso = new Date().toISOString();
    const verificationCode = generateVerificationCode();
    const trimmedNotes = parsedBody.data.notes?.trim()
      ? parsedBody.data.notes.trim()
      : null;

    const { error: updateError } = await dbClient
      .from("proposals")
      .update({
        status: "completed",
        final_signed_by: profile.id,
        final_signature_type: "drawn",
        final_signature_path: profile.signature_storage_path,
        final_verification_code: verificationCode,
        final_signed_at: nowIso,
        final_signature_note: trimmedNotes,
      })
      .eq("id", proposal.id)
      .eq("status", "approved");

    if (updateError) {
      return NextResponse.json(
        {
          error: {
            code: "FINAL_SIGNATURE_UPDATE_FAILED",
            message:
              updateError.message ||
              "Failed to record Student Affairs final signature.",
          },
        },
        { status: 500 }
      );
    }

    const defaultAuditNote = `Student Affairs (${profile.full_name}) applied the final signature [${verificationCode}]. Proposal status is now Completed.`;
    await dbClient.from("revision_logs").insert({
      proposal_id: proposal.id,
      actor_id: profile.id,
      from_version: proposal.current_version,
      to_version: proposal.current_version,
      action_type: "completed",
      role_title: "Student Affairs",
      note: trimmedNotes
        ? `${defaultAuditNote} — Note: ${trimmedNotes}`
        : defaultAuditNote,
    });

    await dbClient.from("notifications").insert({
      user_id: proposal.submitter_id,
      proposal_id: proposal.id,
      title: `Proposal Completed (${proposal.proposal_code})`,
      message: `Student Affairs (${profile.full_name}) has applied the final signature to "${proposal.title}" (v${proposal.current_version}.0). Your proposal is now Completed.`,
    });

    revalidatePath("/approvals");
    revalidatePath("/proposals");
    revalidatePath(`/proposals/${proposal.id}`);
    revalidatePath("/dashboard");
    revalidatePath("/archive");
    revalidatePath("/admin");

    return NextResponse.json({
      ok: true,
      proposalStatus: "completed",
      verificationCode,
      finalSignedAt: nowIso,
    });
  } catch (error) {
    const authResp = toAuthErrorResponse(error);
    if (authResp) return authResp;

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message:
            "Unexpected server error while recording Student Affairs final signature.",
        },
      },
      { status: 500 }
    );
  }
}
