import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  ProposalStatusDb,
  SignerStatusDb,
} from "../supabase/database.types";
import type { ApprovalQueueFilter } from "../validations/approval";

export type ApprovalQueueBucket = "action_required" | "upcoming" | "completed";

export interface ApprovalQueueItem {
  signer_row_id: string;
  proposal_id: string;
  proposal_code: string;
  title: string;
  activity_type: string | null;
  organization_name: string;
  person_in_charge: string;
  event_date: string;
  venue: string;
  total_budget: number;
  proposal_status: ProposalStatusDb;
  current_version: number;
  updated_at: string;
  submitter: {
    id: string;
    full_name: string;
    email: string;
    organization_unit: string | null;
  } | null;
  my_step_order: number;
  my_role_title: string;
  my_signer_status: SignerStatusDb;
  my_signed_at: string | null;
  my_decided_at: string | null;
  my_decision_note: string | null;
  my_verification_code: string | null;
  active_step_order: number | null;
  total_steps: number;
  signed_steps_count: number;
  queue_bucket: ApprovalQueueBucket;
}

export interface ApprovalQueueResponse {
  counts: {
    action_required: number;
    upcoming: number;
    completed: number;
    all: number;
  };
  items: ApprovalQueueItem[];
}

export function generateVerificationCode(): string {
  const year = new Date().getUTCFullYear();
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
    .join("");
  return `TTD-PU-${year}-${hex}`;
}

/**
 * Fetches and classifies all approval queue items assigned to `userId`
 * into `action_required` (active sequential turn), `upcoming` (waiting on earlier step),
 * and `completed` (historical decisions taken by this user).
 */
export async function fetchUserApprovalQueue(
  supabase: SupabaseClient<Database>,
  userId: string,
  filter: ApprovalQueueFilter = "action_required"
): Promise<ApprovalQueueResponse> {
  const { data: mySignerRows } = await supabase
    .from("proposal_signers")
    .select(
      "*, proposals(id, proposal_code, submitter_id, title, activity_type, organization_name, person_in_charge, event_date, venue, total_budget, status, current_version, updated_at, submitter:submitter_id(id, full_name, email, organization_unit))"
    )
    .eq("approver_id", userId)
    .order("step_order", { ascending: true });

  const rows = mySignerRows ?? [];
  const proposalIds = Array.from(new Set(rows.map((r) => r.proposal_id)));

  const { data: allSiblingSigners } =
    proposalIds.length > 0
      ? await supabase
          .from("proposal_signers")
          .select("proposal_id, step_order, status")
          .in("proposal_id", proposalIds)
      : { data: [] };

  const siblingsByProposal = new Map<
    string,
    Array<{ step_order: number; status: SignerStatusDb }>
  >();

  for (const sib of allSiblingSigners ?? []) {
    const arr = siblingsByProposal.get(sib.proposal_id) ?? [];
    arr.push({ step_order: sib.step_order, status: sib.status });
    siblingsByProposal.set(sib.proposal_id, arr);
  }

  const allItems: ApprovalQueueItem[] = [];

  for (const row of rows) {
    const propRaw = Array.isArray(row.proposals)
      ? row.proposals[0]
      : row.proposals;
    if (!propRaw) continue;

    // Never show unsubmitted drafts in the approval queue
    if (propRaw.status === "draft") continue;

    const siblings = siblingsByProposal.get(row.proposal_id) ?? [];
    const totalSteps = Math.max(1, siblings.length);
    const signedStepsCount = siblings.filter((s) => s.status === "signed").length;
    const pendingSteps = siblings
      .filter((s) => s.status === "pending")
      .map((s) => s.step_order)
      .sort((a, b) => a - b);

    const activeStepOrder =
      propRaw.status === "pending_ttd" && pendingSteps.length > 0
        ? pendingSteps[0]
        : null;

    let bucket: ApprovalQueueBucket;
    if (
      row.status === "signed" ||
      row.status === "revision_requested" ||
      row.status === "rejected"
    ) {
      bucket = "completed";
    } else if (
      propRaw.status === "pending_ttd" &&
      row.status === "pending" &&
      activeStepOrder === row.step_order
    ) {
      bucket = "action_required";
    } else if (
      propRaw.status === "approved" ||
      propRaw.status === "rejected"
    ) {
      bucket = "completed";
    } else {
      bucket = "upcoming";
    }

    const submitterObj = Array.isArray(propRaw.submitter)
      ? propRaw.submitter[0] ?? null
      : propRaw.submitter ?? null;

    allItems.push({
      signer_row_id: row.id,
      proposal_id: propRaw.id,
      proposal_code: propRaw.proposal_code,
      title: propRaw.title,
      activity_type: propRaw.activity_type,
      organization_name: propRaw.organization_name,
      person_in_charge: propRaw.person_in_charge,
      event_date: propRaw.event_date,
      venue: propRaw.venue,
      total_budget: Number(propRaw.total_budget),
      proposal_status: propRaw.status,
      current_version: propRaw.current_version,
      updated_at: propRaw.updated_at,
      submitter: submitterObj,
      my_step_order: row.step_order,
      my_role_title: row.role_title ?? "Institutional Approver",
      my_signer_status: row.status,
      my_signed_at: row.signed_at ?? null,
      my_decided_at: row.decided_at ?? row.signed_at ?? null,
      my_decision_note: row.decision_note ?? null,
      my_verification_code: row.verification_code ?? null,
      active_step_order: activeStepOrder,
      total_steps: totalSteps,
      signed_steps_count: signedStepsCount,
      queue_bucket: bucket,
    });
  }

  // Sort: action_required first, then upcoming, then completed (newest updated_at first within each bucket)
  const bucketWeight: Record<ApprovalQueueBucket, number> = {
    action_required: 0,
    upcoming: 1,
    completed: 2,
  };

  allItems.sort((a, b) => {
    if (bucketWeight[a.queue_bucket] !== bucketWeight[b.queue_bucket]) {
      return bucketWeight[a.queue_bucket] - bucketWeight[b.queue_bucket];
    }
    return b.updated_at.localeCompare(a.updated_at);
  });

  const counts = {
    action_required: allItems.filter((i) => i.queue_bucket === "action_required")
      .length,
    upcoming: allItems.filter((i) => i.queue_bucket === "upcoming").length,
    completed: allItems.filter((i) => i.queue_bucket === "completed").length,
    all: allItems.length,
  };

  const filteredItems =
    filter === "all"
      ? allItems
      : allItems.filter((item) => item.queue_bucket === filter);

  return {
    counts,
    items: filteredItems,
  };
}
