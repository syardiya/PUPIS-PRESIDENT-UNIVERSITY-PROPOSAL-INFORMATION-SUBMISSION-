import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { requireAuth, toAuthErrorResponse } from "@/src/lib/auth/guard";
import { createClient } from "@/src/lib/supabase/server";
import type { SecretaryReviewStatusDb } from "@/src/lib/supabase/database.types";
import {
  computeBudgetItemsGrandTotal,
  proposalFinalSubmissionSchema,
  proposalSubmitBodySchema,
  uuidSchema,
} from "@/src/lib/validations/proposal";
import {
  formatBudgetBreakdownText,
  formatExecutiveSummaryText,
  parseBudgetItemsFromJson,
} from "@/src/lib/proposals/server-helpers";
import {
  canBeAssignedAsApprover,
  isFacultySecretaryProfile,
} from "@/src/lib/proposals/approver-authority";

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

    const parsedBody = proposalSubmitBodySchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message:
              parsedBody.error.issues[0]?.message ??
              "Invalid submission request payload.",
          },
        },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const { data: proposal, error: propError } = await supabase
      .from("proposals")
      .select("*")
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
            message: "Only the proposal owner can submit this proposal.",
          },
        },
        { status: 403 }
      );
    }

    if (proposal.status !== "draft" && proposal.status !== "needs_revision") {
      return NextResponse.json(
        {
          error: {
            code: "ALREADY_SUBMITTED",
            message: `Proposal cannot be submitted from '${proposal.status}' status.`,
          },
        },
        { status: 409 }
      );
    }

    const [
      { data: signers },
      { data: attachments },
      { data: staffUsers },
    ] = await Promise.all([
      supabase
        .from("proposal_signers")
        .select(
          "id, approver_id, role_title, step_order, status, users:approver_id(id, email, full_name, role, functional_role, organization_unit)"
        )
        .eq("proposal_id", proposal.id)
        .order("step_order", { ascending: true }),
      supabase
        .from("proposal_attachments")
        .select("id, storage_path, mime_type, attachment_kind, created_at")
        .eq("proposal_id", proposal.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("users")
        .select("id, email, full_name, role, functional_role, organization_unit")
        .eq("role", "staff"),
    ]);

    // PBI-04 Defense-in-Depth: Verify every assigned signer holds official approver authority
    for (const s of signers ?? []) {
      const approverUser = Array.isArray(s.users)
        ? s.users[0] ?? null
        : s.users ?? null;
      const authorityCheck = canBeAssignedAsApprover(approverUser);
      if (!authorityCheck.allowed) {
        return NextResponse.json(
          {
            error: {
              code: "UNAUTHORIZED_APPROVER",
              message: `Step ${s.step_order} approver '${
                approverUser?.full_name ?? s.approver_id
              }' is not authorized: ${
                authorityCheck.reason ?? "Invalid approver authority."
              }`,
            },
          },
          { status: 422 }
        );
      }
    }

    const budgetItems = parseBudgetItemsFromJson(proposal.budget_items);
    const computedGrandTotal = computeBudgetItemsGrandTotal(budgetItems);
    const hasSubmitterSignature = Boolean(profile.signature_storage_path);

    if (!hasSubmitterSignature) {
      return NextResponse.json(
        {
          error: {
            code: "SIGNATURE_REQUIRED",
            message:
              "Please configure your active Digital Signature (TTD) on the Profile & Signature page before submitting a proposal.",
          },
        },
        { status: 422 }
      );
    }

    // Validate complete proposal state against strict submission schema
    const validation = proposalFinalSubmissionSchema.safeParse({
      title: proposal.title,
      activity_type: proposal.activity_type ?? "",
      organization_name: proposal.organization_name,
      person_in_charge: proposal.person_in_charge,
      event_date: proposal.event_date,
      event_end_date: proposal.event_end_date,
      venue: proposal.venue,
      background: proposal.background ?? "",
      objectives: proposal.objectives ?? "",
      target_audience: proposal.target_audience ?? "",
      budget_items: budgetItems,
      total_budget: computedGrandTotal,
      signers: (signers ?? []).map((s) => ({
        approver_id: s.approver_id,
        role_title: s.role_title,
        step_order: s.step_order,
      })),
      has_submitter_signature: true as const,
      attachments_count: (attachments ?? []).length,
    });

    if (!validation.success) {
      const firstIssue = validation.error.issues[0];
      return NextResponse.json(
        {
          error: {
            code: "SUBMISSION_VALIDATION_FAILED",
            message:
              firstIssue?.message ??
              "Proposal is incomplete. Please review all required steps.",
            issues: validation.error.issues.map((iss) => ({
              path: iss.path.join("."),
              message: iss.message,
            })),
          },
        },
        { status: 422 }
      );
    }

    const isResubmission = proposal.status === "needs_revision";
    const targetVersion = isResubmission
      ? proposal.current_version + 1
      : proposal.current_version;
    const nowIso = new Date().toISOString();

    const primaryAttachment =
      (attachments ?? []).find(
        (a) => a.attachment_kind === "primary_proposal_pdf"
      ) ??
      (attachments ?? []).find((a) => a.mime_type === "application/pdf") ??
      (attachments ?? [])[0];

    const pdfStoragePath = primaryAttachment?.storage_path ?? "";
    const budgetBreakdownText = formatBudgetBreakdownText(budgetItems);
    const executiveSummaryText = formatExecutiveSummaryText({
      activityType: proposal.activity_type,
      background: proposal.background,
      objectives: proposal.objectives,
      targetAudience: proposal.target_audience,
    });

    // 1. Insert immutable snapshot in `public.proposal_versions`
    const { error: versionError } = await supabase
      .from("proposal_versions")
      .insert({
        proposal_id: proposal.id,
        version_number: targetVersion,
        budget_breakdown: budgetBreakdownText,
        executive_summary: executiveSummaryText,
        pdf_storage_path: pdfStoragePath,
      });

    if (versionError) {
      return NextResponse.json(
        {
          error: {
            code: "VERSION_SNAPSHOT_FAILED",
            message:
              versionError.message ||
              "Failed to record immutable proposal version.",
          },
        },
        { status: 500 }
      );
    }

    // 2. Reset any non-signed signers (e.g. 'revision_requested') back to 'pending'
    //    while strictly preserving already-'signed' signers.
    const { error: signerActivateError } = await supabase
      .from("proposal_signers")
      .update({ status: "pending" })
      .eq("proposal_id", proposal.id)
      .neq("status", "signed");

    if (signerActivateError) {
      return NextResponse.json(
        {
          error: {
            code: "SIGNER_ACTIVATION_FAILED",
            message: "Failed to activate sequential TTD signers.",
          },
        },
        { status: 500 }
      );
    }

    // Determine PBI-05 Faculty Secretary Intake routing:
    // Route through `pending_review` when at least one Faculty Secretary exists and no TTD signer has signed yet.
    const facultySecretaries = (staffUsers ?? []).filter((u) =>
      isFacultySecretaryProfile(u)
    );
    const hasPriorSignedSteps = (signers ?? []).some(
      (s) => s.status === "signed"
    );
    const shouldRouteViaSecretary =
      !hasPriorSignedSteps && facultySecretaries.length > 0;

    const nextSecretaryStatus: SecretaryReviewStatusDb = shouldRouteViaSecretary
      ? "pending_review"
      : hasPriorSignedSteps && proposal.secretary_review_status === "forwarded"
      ? "forwarded"
      : "not_started";

    // 3. Transition proposal status to 'pending_ttd' (In Review) and record `submitted_at` + intake status
    const { data: submittedProposal, error: statusUpdateError } = await supabase
      .from("proposals")
      .update({
        status: "pending_ttd",
        current_version: targetVersion,
        total_budget: computedGrandTotal,
        submitted_at: nowIso,
        secretary_review_status: nextSecretaryStatus,
      })
      .eq("id", proposal.id)
      .select(
        "id, proposal_code, title, status, secretary_review_status, submitted_at, current_version, updated_at"
      )
      .single();

    if (statusUpdateError || !submittedProposal) {
      return NextResponse.json(
        {
          error: {
            code: "STATUS_TRANSITION_FAILED",
            message:
              statusUpdateError?.message ??
              "Failed to transition proposal into review.",
          },
        },
        { status: 500 }
      );
    }

    // 4. Append immutable audit log entry in `public.revision_logs`
    const auditNote =
      parsedBody.data.submission_note ||
      (isResubmission
        ? shouldRouteViaSecretary
          ? `Resubmitted revised proposal v${targetVersion}.0 for Faculty Secretary intake verification.`
          : `Resubmitted revised proposal v${targetVersion}.0.`
        : shouldRouteViaSecretary
        ? `Initial proposal v${targetVersion}.0 submitted. Routed to Faculty Secretary for completeness verification.`
        : `Initial proposal v${targetVersion}.0 submitted for sequential TTD review.`);

    await supabase.from("revision_logs").insert({
      proposal_id: proposal.id,
      actor_id: profile.id,
      from_version: isResubmission ? proposal.current_version : null,
      to_version: targetVersion,
      action_type: isResubmission ? "resubmitted" : "submitted",
      note: auditNote,
    });

    // 5. Notify Faculty Secretary (if routed via intake) or the active first pending approver
    const firstPendingSigner = (signers ?? [])
      .filter((s) => s.status !== "signed")
      .sort((a, b) => a.step_order - b.step_order)[0];

    if (shouldRouteViaSecretary) {
      const secretaryNotifications = facultySecretaries.map((sec) => ({
        user_id: sec.id,
        proposal_id: proposal.id,
        title: isResubmission
          ? `Resubmitted Proposal for Intake Check (${proposal.proposal_code})`
          : `New Incoming Proposal for Intake Check (${proposal.proposal_code})`,
        message: `${profile.full_name} (${proposal.organization_name}) submitted "${proposal.title}" (v${targetVersion}.0). Verify document completeness and forward to Step ${
          firstPendingSigner?.step_order ?? 1
        } (${firstPendingSigner?.role_title ?? "Approver"}).`,
      }));
      await supabase.from("notifications").insert(secretaryNotifications);
    } else if (firstPendingSigner) {
      await supabase.from("notifications").insert({
        user_id: firstPendingSigner.approver_id,
        proposal_id: proposal.id,
        title: isResubmission
          ? `Revised Proposal Ready for TTD (${proposal.proposal_code})`
          : `New Proposal Awaiting Your TTD (${proposal.proposal_code})`,
        message: `${profile.full_name} submitted "${proposal.title}" (v${targetVersion}.0) for Step ${firstPendingSigner.step_order} (${firstPendingSigner.role_title}) approval.`,
      });
    }

    revalidatePath("/proposals");
    revalidatePath(`/proposals/${proposal.id}`);
    revalidatePath("/dashboard");
    revalidatePath("/approvals");

    return NextResponse.json({
      ok: true,
      proposal: submittedProposal,
    });
  } catch (error) {
    const authResp = toAuthErrorResponse(error);
    if (authResp) return authResp;

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Unexpected server error while submitting proposal.",
        },
      },
      { status: 500 }
    );
  }
}
