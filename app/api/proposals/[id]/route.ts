import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { requireAuth, toAuthErrorResponse } from "@/src/lib/auth/guard";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { createClient } from "@/src/lib/supabase/server";
import { normalizeEnvValue } from "@/src/lib/supabase/url";
import type { Database, Json } from "@/src/lib/supabase/database.types";
import {
  proposalDraftUpdateSchema,
  uuidSchema,
} from "@/src/lib/validations/proposal";
import {
  fetchHydratedProposalDetail,
  normalizeDraftBudgetItems,
  resolveSignersAndCcUsers,
  syncProposalRouting,
} from "@/src/lib/proposals/server-helpers";
import {
  isFacultySecretaryProfile,
  isStudentAffairsProfile,
} from "@/src/lib/proposals/approver-authority";

export async function GET(
  _request: NextRequest,
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
    const dbClient = normalizeEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY)
      ? createAdminClient()
      : supabase;
    const detail = await fetchHydratedProposalDetail(dbClient, idCheck.data);

    if (!detail) {
      return NextResponse.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Proposal not found or you do not have permission to view it.",
          },
        },
        { status: 404 }
      );
    }

    // Explicit defense-in-depth anti-IDOR verification alongside PostgreSQL RLS
    const isAuthorizedViewer =
      profile.role === "admin" ||
      detail.submitter_id === profile.id ||
      detail.signers.some((s) => s.approver_id === profile.id) ||
      detail.cc_users.some((c) => c.stakeholder_id === profile.id) ||
      (detail.status !== "draft" &&
        (isFacultySecretaryProfile(profile) ||
          isStudentAffairsProfile(profile)));

    if (!isAuthorizedViewer) {
      return NextResponse.json(
        {
          error: {
            code: "FORBIDDEN",
            message: "You are not authorized to view this proposal.",
          },
        },
        { status: 403 }
      );
    }

    return NextResponse.json({
      ok: true,
      proposal: detail,
    });
  } catch (error) {
    const authResp = toAuthErrorResponse(error);
    if (authResp) return authResp;

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Unexpected error while loading proposal details.",
        },
      },
      { status: 500 }
    );
  }
}

export async function PATCH(
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

    let rawBody: unknown;
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

    const parsed = proposalDraftUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: issue?.message ?? "Invalid draft update fields.",
            issues: parsed.error.issues,
          },
        },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const dbClient = normalizeEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY)
      ? createAdminClient()
      : supabase;

    const { data: existing, error: fetchError } = await dbClient
      .from("proposals")
      .select("id, submitter_id, status, event_date")
      .eq("id", idCheck.data)
      .maybeSingle();

    if (fetchError || !existing) {
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

    if (existing.submitter_id !== profile.id && profile.role !== "admin") {
      return NextResponse.json(
        {
          error: {
            code: "FORBIDDEN",
            message: "Only the proposal creator can modify this proposal.",
          },
        },
        { status: 403 }
      );
    }

    // Strictly reject edits unless status is 'draft' or 'needs_revision'
    if (existing.status !== "draft" && existing.status !== "needs_revision") {
      return NextResponse.json(
        {
          error: {
            code: "PROPOSAL_LOCKED",
            message: `Proposals in '${existing.status}' status are locked and cannot be edited.`,
          },
        },
        { status: 409 }
      );
    }

    const data = parsed.data;

    // Cross-check event_end_date against existing.event_date when only one is sent
    const effectiveStartDate = data.event_date ?? existing.event_date;
    if (
      data.event_end_date &&
      effectiveStartDate &&
      data.event_end_date < effectiveStartDate
    ) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Event end date cannot be earlier than event start date.",
          },
        },
        { status: 400 }
      );
    }

    const resolvedRouting = await resolveSignersAndCcUsers(
      dbClient,
      data.signers,
      data.cc_users
    );

    if (!resolvedRouting.ok) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_ROUTING_USERS",
            message: resolvedRouting.error ?? "Invalid signer or CC recipient.",
          },
        },
        { status: 400 }
      );
    }

    const updatePayload: Database["public"]["Tables"]["proposals"]["Update"] = {};

    if (data.title !== undefined) updatePayload.title = data.title;
    if (data.activity_type !== undefined)
      updatePayload.activity_type = data.activity_type;
    if (data.organization_name !== undefined)
      updatePayload.organization_name = data.organization_name;
    if (data.person_in_charge !== undefined)
      updatePayload.person_in_charge = data.person_in_charge;
    if (data.event_date) updatePayload.event_date = data.event_date;
    if (data.event_end_date !== undefined)
      updatePayload.event_end_date = data.event_end_date;
    if (data.venue !== undefined) updatePayload.venue = data.venue;
    if (data.background !== undefined) updatePayload.background = data.background;
    if (data.objectives !== undefined) updatePayload.objectives = data.objectives;
    if (data.target_audience !== undefined)
      updatePayload.target_audience = data.target_audience;

    if (data.budget_items !== undefined) {
      const { normalized, grandTotal } = normalizeDraftBudgetItems(
        data.budget_items
      );
      updatePayload.budget_items = normalized as unknown as Json;
      updatePayload.total_budget = grandTotal;
    } else if (data.total_budget !== undefined) {
      updatePayload.total_budget = data.total_budget;
    }

    const { data: updatedProposal, error: updateError } = await dbClient
      .from("proposals")
      .update(updatePayload)
      .eq("id", existing.id)
      .select("id, total_budget, status, current_version, updated_at")
      .single();

    if (updateError || !updatedProposal) {
      return NextResponse.json(
        {
          error: {
            code: "AUTO_SAVE_FAILED",
            message: updateError?.message ?? "Failed to save proposal draft.",
          },
        },
        { status: 500 }
      );
    }

    if (
      resolvedRouting.signers !== undefined ||
      resolvedRouting.ccStakeholderIds !== undefined
    ) {
      const syncResult = await syncProposalRouting(
        dbClient,
        existing.id,
        resolvedRouting.signers,
        resolvedRouting.ccStakeholderIds
      );

      if (!syncResult.ok) {
        return NextResponse.json(
          {
            error: {
              code: "ROUTING_SAVE_FAILED",
              message: syncResult.error ?? "Failed to update approval chain.",
            },
          },
          { status: 400 }
        );
      }
    }

    revalidatePath("/proposals");
    revalidatePath(`/proposals/${existing.id}/edit`);

    return NextResponse.json({
      ok: true,
      proposal: updatedProposal,
    });
  } catch (error) {
    const authResp = toAuthErrorResponse(error);
    if (authResp) return authResp;

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Unexpected error while auto-saving proposal.",
        },
      },
      { status: 500 }
    );
  }
}
