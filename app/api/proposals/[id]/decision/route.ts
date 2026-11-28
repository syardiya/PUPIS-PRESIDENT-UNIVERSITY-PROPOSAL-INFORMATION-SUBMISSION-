import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { requireAuth, toAuthErrorResponse } from "@/src/lib/auth/guard";
import { createClient } from "@/src/lib/supabase/server";
import { uuidSchema } from "@/src/lib/validations/proposal";
import {
  approvalDecisionBodySchema,
  signerTurnEligibilitySchema,
} from "@/src/lib/validations/approval";
import { generateVerificationCode } from "@/src/lib/proposals/approval-helpers";
import {
  isFacultySecretaryProfile,
  isStudentAffairsProfile,
} from "@/src/lib/proposals/approver-authority";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const profile = await requireAuth();
    const { id } = await context.params;

    // PBI-05 Zero-Trust Guard: Faculty Secretary strictly cannot approve, reject, or stamp TTD decisions
    if (isFacultySecretaryProfile(profile)) {
      return NextResponse.json(
        {
          error: {
            code: "FORBIDDEN_SECRETARY_APPROVAL",
            message:
              "Faculty Secretary accounts manage proposal intake, clarification follow-up, and forwarding, and are not permitted to directly approve or reject proposals.",
          },
        },
        { status: 403 }
      );
    }

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
            message: "Invalid JSON decision payload.",
          },
        },
        { status: 400 }
      );
    }

    const parsedBody = approvalDecisionBodySchema.safeParse(rawBody);
    if (!parsedBody.success) {
      const issue = parsedBody.error.issues[0];
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: issue?.message ?? "Invalid decision payload.",
            issues: parsedBody.error.issues,
          },
        },
        { status: 400 }
      );
    }

    const { action, notes, signature_type } = parsedBody.data;
    const supabase = await createClient();

    const { data: proposal, error: propError } = await supabase
      .from("proposals")
      .select(
        "id, proposal_code, submitter_id, title, status, secretary_review_status, current_version"
      )
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

    const { data: allSigners, error: signersError } = await supabase
      .from("proposal_signers")
      .select(
        "id, proposal_id, approver_id, role_title, step_order, status"
      )
      .eq("proposal_id", proposal.id)
      .order("step_order", { ascending: true });

    if (signersError || !allSigners) {
      return NextResponse.json(
        {
          error: {
            code: "SIGNERS_FETCH_FAILED",
            message: "Unable to load sequential TTD chain.",
          },
        },
        { status: 500 }
      );
    }

    const pendingSteps = allSigners.filter((s) => s.status === "pending");
    const lowestPendingStep = pendingSteps[0] ?? null;

    // Locate the current user's signer row (preferring their pending row if any)
    const userSignerRow =
      allSigners.find(
        (s) => s.approver_id === profile.id && s.status === "pending"
      ) ?? allSigners.find((s) => s.approver_id === profile.id);

    const hasSavedSignature = Boolean(profile.signature_storage_path);

    const eligibility = signerTurnEligibilitySchema.safeParse({
      action,
      is_faculty_secretary: isFacultySecretaryProfile(profile),
      proposal_status: proposal.status,
      secretary_review_status: proposal.secretary_review_status,
      is_assigned_signer: Boolean(userSignerRow),
      signer_status: userSignerRow?.status ?? null,
      is_lowest_pending_step: Boolean(
        userSignerRow &&
          lowestPendingStep &&
          userSignerRow.id === lowestPendingStep.id
      ),
      has_saved_signature: hasSavedSignature,
    });

    if (!eligibility.success) {
      const firstIssue = eligibility.error.issues[0];
      const issuePath = firstIssue?.path[0];

      const status =
        issuePath === "is_faculty_secretary" ||
        issuePath === "is_assigned_signer"
          ? 403
          : issuePath === "has_saved_signature"
          ? 422
          : 409;

      const code =
        issuePath === "is_faculty_secretary"
          ? "FORBIDDEN_SECRETARY_APPROVAL"
          : issuePath === "is_assigned_signer"
          ? "FORBIDDEN_NOT_ASSIGNED_SIGNER"
          : issuePath === "secretary_review_status"
          ? "AWAITING_SECRETARY_INTAKE"
          : issuePath === "has_saved_signature"
          ? "SIGNATURE_REQUIRED"
          : "NOT_ACTIVE_SIGNER_TURN";

      return NextResponse.json(
        {
          error: {
            code,
            message:
              firstIssue?.message ??
              "You cannot perform this approval action at this time.",
          },
        },
        { status }
      );
    }

    const activeRow = userSignerRow!;
    const nowIso = new Date().toISOString();
    const trimmedNotes = notes?.trim() ? notes.trim() : null;

    // Helper for appending immutable audit entries (gracefully falls back if migration 004
    // step_order / role_title columns have not been applied yet on a remote DB).
    const insertAuditLog = async (params: {
      actionType: "signed" | "revision_requested" | "rejected";
      noteText: string;
    }) => {
      const { error: logErr } = await supabase.from("revision_logs").insert({
        proposal_id: proposal.id,
        actor_id: profile.id,
        from_version: proposal.current_version,
        to_version: proposal.current_version,
        action_type: params.actionType,
        step_order: activeRow.step_order,
        role_title: activeRow.role_title,
        note: params.noteText,
      });

      if (logErr && (logErr.code === "PGRST204" || logErr.code === "42703")) {
        await supabase.from("revision_logs").insert({
          proposal_id: proposal.id,
          actor_id: profile.id,
          from_version: proposal.current_version,
          to_version: proposal.current_version,
          action_type: params.actionType,
          note: `[Step ${activeRow.step_order} — ${activeRow.role_title}] ${params.noteText}`,
        });
      }
    };

    // ------------------------------------------------------------------------
    // ACTION 1: APPROVE & STAMP DIGITAL SIGNATURE
    // ------------------------------------------------------------------------
    if (action === "approve") {
      const verificationCode = generateVerificationCode();

      let { error: signerUpdateError } = await supabase
        .from("proposal_signers")
        .update({
          status: "signed",
          signature_type: signature_type ?? "drawn",
          signature_storage_path: profile.signature_storage_path,
          signed_on_version: proposal.current_version,
          signed_at: nowIso,
          decided_at: nowIso,
          decision_note: trimmedNotes,
          verification_code: verificationCode,
        })
        .eq("id", activeRow.id)
        .eq("status", "pending");

      if (
        signerUpdateError &&
        (signerUpdateError.code === "PGRST204" ||
          signerUpdateError.code === "42703")
      ) {
        const retry = await supabase
          .from("proposal_signers")
          .update({
            status: "signed",
            signature_type: signature_type ?? "drawn",
            signature_storage_path: profile.signature_storage_path,
            signed_on_version: proposal.current_version,
            signed_at: nowIso,
          })
          .eq("id", activeRow.id)
          .eq("status", "pending");
        signerUpdateError = retry.error;
      }

      if (signerUpdateError) {
        return NextResponse.json(
          {
            error: {
              code: "SIGNER_UPDATE_FAILED",
              message:
                signerUpdateError.message ||
                "Failed to stamp digital signature on step.",
            },
          },
          { status: 500 }
        );
      }

      const remainingPendingSteps = pendingSteps.filter(
        (s) => s.id !== activeRow.id
      );
      const nextSigner = remainingPendingSteps[0] ?? null;
      const nextProposalStatus = nextSigner ? "pending_ttd" : "approved";

      const { error: propUpdateError } = await supabase
        .from("proposals")
        .update({ status: nextProposalStatus })
        .eq("id", proposal.id);

      if (propUpdateError) {
        return NextResponse.json(
          {
            error: {
              code: "PROPOSAL_STATUS_UPDATE_FAILED",
              message:
                propUpdateError.message || "Failed to update proposal status.",
            },
          },
          { status: 500 }
        );
      }

      const defaultAuditNote = nextSigner
        ? `Approved & digitally signed Step ${activeRow.step_order} (${activeRow.role_title}) [${verificationCode}]. Forwarded to Step ${nextSigner.step_order} (${nextSigner.role_title}).`
        : `Approved & digitally signed final Step ${activeRow.step_order} (${activeRow.role_title}) [${verificationCode}]. Proposal is now fully Approved.`;

      await insertAuditLog({
        actionType: "signed",
        noteText: trimmedNotes
          ? `${defaultAuditNote} — Note: ${trimmedNotes}`
          : defaultAuditNote,
      });

      if (nextSigner) {
        await supabase.from("notifications").insert([
          {
            user_id: nextSigner.approver_id,
            proposal_id: proposal.id,
            title: `Action Required: Step ${nextSigner.step_order} TTD (${proposal.proposal_code})`,
            message: `${profile.full_name} approved Step ${activeRow.step_order}. "${proposal.title}" (v${proposal.current_version}.0) is now awaiting your Step ${nextSigner.step_order} (${nextSigner.role_title}) signature.`,
          },
          {
            user_id: proposal.submitter_id,
            proposal_id: proposal.id,
            title: `Step ${activeRow.step_order} TTD Approved (${proposal.proposal_code})`,
            message: `${profile.full_name} (${activeRow.role_title}) signed "${proposal.title}". Next: Step ${nextSigner.step_order} (${nextSigner.role_title}).`,
          },
        ]);
      } else {
        const { data: saCandidates } = await supabase
          .from("users")
          .select("id, email, role, functional_role, organization_unit")
          .in("role", ["staff", "admin"]);

        const studentAffairsRecipients = (saCandidates ?? []).filter(
          (u) =>
            isStudentAffairsProfile(u) &&
            u.id !== profile.id &&
            u.id !== proposal.submitter_id
        );

        const notificationRows = [
          {
            user_id: proposal.submitter_id,
            proposal_id: proposal.id,
            title: `Proposal Approved — Awaiting Final Signature (${proposal.proposal_code})`,
            message: `All sequential approvers have approved "${proposal.title}" (v${proposal.current_version}.0), signed by ${profile.full_name}. Next step: Student Affairs Final Signature.`,
          },
          ...studentAffairsRecipients.map((sa) => ({
            user_id: sa.id,
            proposal_id: proposal.id,
            title: `Awaiting Final Signature (${proposal.proposal_code})`,
            message: `"${proposal.title}" (v${proposal.current_version}.0) has been approved by all sequential approvers (${profile.full_name}) and is ready for Student Affairs final signature.`,
          })),
        ];

        await supabase.from("notifications").insert(notificationRows);
      }

      revalidatePath("/approvals");
      revalidatePath("/proposals");
      revalidatePath(`/proposals/${proposal.id}`);
      revalidatePath("/dashboard");
      revalidatePath("/archive");

      return NextResponse.json({
        ok: true,
        action: "approve",
        proposalStatus: nextProposalStatus,
        verificationCode,
        nextStepOrder: nextSigner?.step_order ?? null,
      });
    }

    // ------------------------------------------------------------------------
    // ACTION 2: REQUEST REVISION (UNLOCKS SUBMITTER EDITING, PRESERVES PRIOR TTDs)
    // ------------------------------------------------------------------------
    if (action === "request_revision") {
      let { error: signerRevErr } = await supabase
        .from("proposal_signers")
        .update({
          status: "revision_requested",
          decided_at: nowIso,
          decision_note: trimmedNotes,
        })
        .eq("id", activeRow.id)
        .eq("status", "pending");

      if (
        signerRevErr &&
        (signerRevErr.code === "PGRST204" || signerRevErr.code === "42703")
      ) {
        const retry = await supabase
          .from("proposal_signers")
          .update({ status: "revision_requested" })
          .eq("id", activeRow.id)
          .eq("status", "pending");
        signerRevErr = retry.error;
      }

      if (signerRevErr) {
        return NextResponse.json(
          {
            error: {
              code: "SIGNER_UPDATE_FAILED",
              message:
                signerRevErr.message || "Failed to record revision request.",
            },
          },
          { status: 500 }
        );
      }

      const { error: propRevErr } = await supabase
        .from("proposals")
        .update({ status: "needs_revision" })
        .eq("id", proposal.id);

      if (propRevErr) {
        return NextResponse.json(
          {
            error: {
              code: "PROPOSAL_STATUS_UPDATE_FAILED",
              message:
                propRevErr.message ||
                "Failed to transition proposal to needs_revision.",
            },
          },
          { status: 500 }
        );
      }

      await insertAuditLog({
        actionType: "revision_requested",
        noteText: trimmedNotes ?? "Revision requested by approver.",
      });

      await supabase.from("notifications").insert({
        user_id: proposal.submitter_id,
        proposal_id: proposal.id,
        title: `Revision Requested (${proposal.proposal_code})`,
        message: `${profile.full_name} (Step ${activeRow.step_order} — ${activeRow.role_title}) requested revisions on "${proposal.title}": ${trimmedNotes}`,
      });

      revalidatePath("/approvals");
      revalidatePath("/proposals");
      revalidatePath(`/proposals/${proposal.id}`);
      revalidatePath(`/proposals/${proposal.id}/edit`);
      revalidatePath("/dashboard");

      return NextResponse.json({
        ok: true,
        action: "request_revision",
        proposalStatus: "needs_revision",
      });
    }

    // ------------------------------------------------------------------------
    // ACTION 3: REJECT PROPOSAL (TERMINAL LOCKED STATE)
    // ------------------------------------------------------------------------
    let { error: signerRejErr } = await supabase
      .from("proposal_signers")
      .update({
        status: "rejected",
        decided_at: nowIso,
        decision_note: trimmedNotes,
      })
      .eq("id", activeRow.id)
      .eq("status", "pending");

    if (
      signerRejErr &&
      (signerRejErr.code === "PGRST204" || signerRejErr.code === "42703")
    ) {
      const retry = await supabase
        .from("proposal_signers")
        .update({ status: "rejected" })
        .eq("id", activeRow.id)
        .eq("status", "pending");
      signerRejErr = retry.error;
    }

    if (signerRejErr) {
      return NextResponse.json(
        {
          error: {
            code: "SIGNER_UPDATE_FAILED",
            message: signerRejErr.message || "Failed to record rejection.",
          },
        },
        { status: 500 }
      );
    }

    const { error: propRejErr } = await supabase
      .from("proposals")
      .update({ status: "rejected" })
      .eq("id", proposal.id);

    if (propRejErr) {
      return NextResponse.json(
        {
          error: {
            code: "PROPOSAL_STATUS_UPDATE_FAILED",
            message:
              propRejErr.message || "Failed to mark proposal as rejected.",
          },
        },
        { status: 500 }
      );
    }

    await insertAuditLog({
      actionType: "rejected",
      noteText: trimmedNotes ?? "Proposal rejected.",
    });

    await supabase.from("notifications").insert({
      user_id: proposal.submitter_id,
      proposal_id: proposal.id,
      title: `Proposal Rejected (${proposal.proposal_code})`,
      message: `${profile.full_name} (Step ${activeRow.step_order} — ${activeRow.role_title}) rejected "${proposal.title}": ${trimmedNotes}`,
    });

    revalidatePath("/approvals");
    revalidatePath("/proposals");
    revalidatePath(`/proposals/${proposal.id}`);
    revalidatePath("/dashboard");
    revalidatePath("/archive");

    return NextResponse.json({
      ok: true,
      action: "reject",
      proposalStatus: "rejected",
    });
  } catch (error) {
    const authResp = toAuthErrorResponse(error);
    if (authResp) return authResp;

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Unexpected server error while recording approval decision.",
        },
      },
      { status: 500 }
    );
  }
}
