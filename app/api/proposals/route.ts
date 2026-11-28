import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { requireAuth, toAuthErrorResponse } from "@/src/lib/auth/guard";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { createClient } from "@/src/lib/supabase/server";
import { normalizeEnvValue } from "@/src/lib/supabase/url";
import type { Json, ProposalStatusDb } from "@/src/lib/supabase/database.types";
import { proposalDraftCreateSchema } from "@/src/lib/validations/proposal";
import {
  generateProposalCode,
  normalizeDraftBudgetItems,
  resolveSignersAndCcUsers,
  syncProposalRouting,
} from "@/src/lib/proposals/server-helpers";

function mapStatusFilter(raw: string | null): ProposalStatusDb | null {
  if (!raw || raw === "all") return null;
  switch (raw.toLowerCase()) {
    case "draft":
      return "draft";
    case "pending_ttd":
    case "in_review":
    case "submitted":
      return "pending_ttd";
    case "needs_revision":
    case "revision_requested":
      return "needs_revision";
    case "approved":
      return "approved";
    case "completed":
      return "completed";
    case "rejected":
      return "rejected";
    default:
      return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const supabase = await createClient();

    const searchParams = request.nextUrl.searchParams;
    const statusParam = mapStatusFilter(searchParams.get("status"));
    const rawSearch = searchParams.get("q")?.trim() ?? "";
    const safeSearch = rawSearch.replace(/[,%()]/g, "").slice(0, 100);

    const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);
    const pageSize = Math.min(
      50,
      Math.max(1, Number.parseInt(searchParams.get("pageSize") ?? "10", 10) || 10)
    );
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from("proposals")
      .select(
        "id, proposal_code, submitter_id, title, activity_type, organization_name, person_in_charge, submitted_at, event_date, event_end_date, venue, total_budget, status, secretary_review_status, current_version, created_at, updated_at",
        { count: "exact" }
      )
      .order("updated_at", { ascending: false })
      .range(from, to);

    if (statusParam) {
      query = query.eq("status", statusParam);
    }

    if (safeSearch.length > 0) {
      query = query.or(
        `title.ilike.%${safeSearch}%,proposal_code.ilike.%${safeSearch}%,organization_name.ilike.%${safeSearch}%`
      );
    }

    const { data: items, count, error } = await query;

    if (error) {
      return NextResponse.json(
        {
          error: {
            code: "PROPOSALS_FETCH_FAILED",
            message: error.message || "Failed to fetch proposals.",
          },
        },
        { status: 500 }
      );
    }

    const total = count ?? 0;
    return NextResponse.json({
      ok: true,
      items: items ?? [],
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (error) {
    const authResp = toAuthErrorResponse(error);
    if (authResp) return authResp;

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Unexpected server error while listing proposals.",
        },
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const profile = await requireAuth();

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

    const parsed = proposalDraftCreateSchema.safeParse(rawBody);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: issue?.message ?? "Invalid proposal draft payload.",
            issues: parsed.error.issues,
          },
        },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const supabase = await createClient();
    const dbClient = normalizeEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY)
      ? createAdminClient()
      : supabase;

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
            message: resolvedRouting.error ?? "Invalid signer or CC user.",
          },
        },
        { status: 400 }
      );
    }

    const { normalized: budgetItems, grandTotal } = normalizeDraftBudgetItems(
      data.budget_items ?? []
    );

    const todayIso = new Date().toISOString().slice(0, 10);
    const effectiveStartDate = data.event_date ?? todayIso;
    const effectiveTotalBudget =
      data.budget_items !== undefined ? grandTotal : (data.total_budget ?? 0);

    const proposalCode = generateProposalCode();

    const { data: created, error: insertError } = await dbClient
      .from("proposals")
      .insert({
        proposal_code: proposalCode,
        submitter_id: profile.id,
        title: data.title ?? "",
        activity_type: data.activity_type ?? null,
        organization_name:
          data.organization_name ?? profile.organization_unit ?? "",
        person_in_charge: data.person_in_charge ?? profile.full_name,
        event_date: effectiveStartDate,
        event_end_date: data.event_end_date ?? null,
        venue: data.venue ?? "",
        background: data.background ?? null,
        objectives: data.objectives ?? null,
        target_audience: data.target_audience ?? null,
        budget_items: budgetItems as unknown as Json,
        total_budget: effectiveTotalBudget,
        status: "draft",
        current_version: 1,
      })
      .select("*")
      .single();

    if (insertError || !created) {
      return NextResponse.json(
        {
          error: {
            code: "DRAFT_CREATE_FAILED",
            message: insertError?.message ?? "Unable to create proposal draft.",
          },
        },
        { status: 500 }
      );
    }

    if (
      resolvedRouting.signers !== undefined ||
      resolvedRouting.ccStakeholderIds !== undefined
    ) {
      const routingResult = await syncProposalRouting(
        dbClient,
        created.id,
        resolvedRouting.signers,
        resolvedRouting.ccStakeholderIds
      );
      if (!routingResult.ok) {
        return NextResponse.json(
          {
            error: {
              code: "ROUTING_SAVE_FAILED",
              message: routingResult.error ?? "Failed to save draft signers.",
            },
          },
          { status: 400 }
        );
      }
    }

    revalidatePath("/proposals");
    revalidatePath("/dashboard");

    return NextResponse.json(
      {
        ok: true,
        id: created.id,
        proposal: created,
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
          message: "Unexpected server error while creating draft.",
        },
      },
      { status: 500 }
    );
  }
}
