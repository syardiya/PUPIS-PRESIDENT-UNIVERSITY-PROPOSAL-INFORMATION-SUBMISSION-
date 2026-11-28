import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { requireAuth, toAuthErrorResponse } from "@/src/lib/auth/guard";
import { createClient } from "@/src/lib/supabase/server";
import { uuidSchema } from "@/src/lib/validations/proposal";
import { secretaryReviewBodySchema } from "@/src/lib/validations/approval";
import { isFacultySecretaryProfile } from "@/src/lib/proposals/approver-authority";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const profile = await requireAuth();

    // PBI-05 Authorization: Strictly restrict intake review to Faculty Secretary (or System Admin)
    if (!isFacultySecretaryProfile(profile) && profile.role !== "admin") {
      return NextResponse.json(
        {
          error: {
            code: "FORBIDDEN_ROLE",
            message:
              "Only Faculty Secretary accounts are authorized to process proposal intake and forwarding.",
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

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_JSON",
            message: "Invalid JSON intake payload.",
          },
        },
        { status: 400 }
      );
    }

    const parsedBody = secretaryReviewBodySchema.safeParse(rawBody);
    if (!parsedBody.success) {
      const issue = parsedBody.error.issues[0];
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message:
              issue?.message ??
              "Invalid Faculty Secretary intake action. Only 'forward' or 'request_clarification' is permitted.",
            issues: parsedBody.error.issues,
          },
        },
        { status: 400 }
      );
    }

    const { action, notes } = parsedBody.data;
    const trimmedNotes = notes?.trim() ? notes.trim() : null;
    const supabase = await createClient();

    const { data: proposal, error: propError } = await supabase
      .from("proposals")
      .select(
        "id, proposal_code, submitter_id, title, organization_name, status, secretary_review_status, current_version"
      )
      .eq("id", idCheck.data)
      .maybeSingle();

    if (propError || !proposal || proposal.status === "draft") {
      return NextResponse.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Submitted proposal not found.",
          },
        },
        { status: 404 }
      );
    }

    if (proposal.status !== "pending_ttd") {
      return NextResponse.json(
        {
          error: {
            code: "PROPOSAL_NOT_IN_INTAKE",
            message: `Proposal is currently in '${proposal.status}' status and cannot undergo intake processing right now.`,
          },
        },
        { status: 409 }
      );
    }

    const [{ data: signers }, { data: attachments }] = await Promise.all([
      supabase
        .from("proposal_signers")
        .select("id, approver_id, role_title, step_order, status")
        .eq("proposal_id", proposal.id)
        .order("step_order", { ascending: true }),
      supabase
        .from("proposal_attachments")
        .select("id, file_name, mime_type, attachment_kind")
        .eq("proposal_id", proposal.id),
    ]);

    const nowIso = new Date().toISOString();

    // ------------------------------------------------------------------------
    // ACTION 1: FORWARD TO STEP 1 APPROVER / KAPRODI (`forward`)
    // ------------------------------------------------------------------------
    if (action === "forward") {
      if (!attachments || attachments.length === 0) {
        return NextResponse.json(
          {
            error: {
              code: "INCOMPLETE_DOCUMENTS",
              message:
                "Cannot forward proposal without supporting documents. Request clarification from the student organization instead.",
            },
          },
          { status: 422 }
        );
      }

      const pendingSigners = (signers ?? []).filter(
        (s) => s.status === "pending"
      );
      const firstPendingSigner = pendingSigners[0] ?? null;

      if (!firstPendingSigner) {
        return NextResponse.json(
          {
            error: {
              code: "MISSING_APPROVERS",
              message:
                "No pending sequential approver is assigned on this proposal.",
            },
          },
          { status: 422 }
        );
      }

      const { error: updateErr } = await supabase
        .from("proposals")
        .update({
          secretary_review_status: "forwarded",
          secretary_reviewed_by: profile.id,
          secretary_reviewed_at: nowIso,
          secretary_review_note: trimmedNotes,
        })
        .eq("id", proposal.id);

      if (updateErr) {
        return NextResponse.json(
          {
            error: {
              code: "SECRETARY_FORWARD_FAILED",
              message:
                updateErr.message ||
                "Failed to forward proposal to sequential approver.",
            },
          },
          { status: 500 }
        );
      }

      const defaultAuditNote = `Faculty Secretary verified proposal completeness (${attachments.length} attachment(s)) and forwarded to Step ${firstPendingSigner.step_order} (${firstPendingSigner.role_title}).`;
      await supabase.from("revision_logs").insert({
        proposal_id: proposal.id,
        actor_id: profile.id,
        from_version: proposal.current_version,
        to_version: proposal.current_version,
        action_type: "forwarded",
        role_title: "Faculty Secretary",
        note: trimmedNotes
          ? `${defaultAuditNote} — Note: ${trimmedNotes}`
          : defaultAuditNote,
      });

      await supabase.from("notifications").insert([
        {
          user_id: firstPendingSigner.approver_id,
          proposal_id: proposal.id,
          title: `Action Required: Proposal Forwarded for TTD (${proposal.proposal_code})`,
          message: `Faculty Secretary (${profile.full_name}) verified and forwarded "${proposal.title}" (v${proposal.current_version}.0) for your Step ${firstPendingSigner.step_order} (${firstPendingSigner.role_title}) approval.`,
        },
        {
          user_id: proposal.submitter_id,
          proposal_id: proposal.id,
          title: `Intake Verified & Forwarded (${proposal.proposal_code})`,
          message: `Faculty Secretary (${profile.full_name}) verified your proposal documents and forwarded "${proposal.title}" to Step ${firstPendingSigner.step_order} (${firstPendingSigner.role_title}).`,
        },
      ]);

      revalidatePath("/approvals");
      revalidatePath("/proposals");
      revalidatePath(`/proposals/${proposal.id}`);
      revalidatePath("/dashboard");

      return NextResponse.json({
        ok: true,
        action: "forward",
        proposalStatus: proposal.status,
        secretaryReviewStatus: "forwarded",
        forwardedToStepOrder: firstPendingSigner.step_order,
      });
    }

    // ------------------------------------------------------------------------
    // ACTION 2: REQUEST CLARIFICATION / DOCUMENT FOLLOW-UP (`request_clarification`)
    // ------------------------------------------------------------------------
    const { error: clarUpdateErr } = await supabase
      .from("proposals")
      .update({
        status: "needs_revision",
        secretary_review_status: "clarification_needed",
        secretary_reviewed_by: profile.id,
        secretary_reviewed_at: nowIso,
        secretary_review_note: trimmedNotes,
      })
      .eq("id", proposal.id);

    if (clarUpdateErr) {
      return NextResponse.json(
        {
          error: {
            code: "SECRETARY_CLARIFICATION_FAILED",
            message:
              clarUpdateErr.message ||
              "Failed to record clarification follow-up request.",
          },
        },
        { status: 500 }
      );
    }

    await supabase.from("revision_logs").insert({
      proposal_id: proposal.id,
      actor_id: profile.id,
      from_version: proposal.current_version,
      to_version: proposal.current_version,
      action_type: "clarification_requested",
      role_title: "Faculty Secretary",
      note: trimmedNotes ?? "Clarification requested by Faculty Secretary.",
    });

    await supabase.from("notifications").insert({
      user_id: proposal.submitter_id,
      proposal_id: proposal.id,
      title: `Clarification / Follow-Up Requested (${proposal.proposal_code})`,
      message: `Faculty Secretary (${profile.full_name}) requested follow-up/clarification on "${proposal.title}": ${trimmedNotes}`,
    });

    revalidatePath("/approvals");
    revalidatePath("/proposals");
    revalidatePath(`/proposals/${proposal.id}`);
    revalidatePath(`/proposals/${proposal.id}/edit`);
    revalidatePath("/dashboard");

    return NextResponse.json({
      ok: true,
      action: "request_clarification",
      proposalStatus: "needs_revision",
      secretaryReviewStatus: "clarification_needed",
    });
  } catch (error) {
    const authResp = toAuthErrorResponse(error);
    if (authResp) return authResp;

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message:
            "Unexpected server error while recording Faculty Secretary intake action.",
        },
      },
      { status: 500 }
    );
  }
}
