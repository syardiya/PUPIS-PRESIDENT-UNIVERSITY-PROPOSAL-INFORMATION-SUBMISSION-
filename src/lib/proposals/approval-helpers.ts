import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  ProposalStatusDb,
  SecretaryReviewStatusDb,
  SignerStatusDb,
} from "../supabase/database.types";
import type {
  ApprovalQueueFilter,
  SecretaryQueueFilter,
  StudentAffairsQueueFilter,
} from "../validations/approval";
import { parseBudgetItemsFromJson } from "./server-helpers";

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
  secretary_review_status: SecretaryReviewStatusDb;
  awaiting_secretary_intake: boolean;
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

export type SecretaryIntakeBucket =
  | "pending_review"
  | "clarification_needed"
  | "forwarded";

export interface SecretaryIntakeQueueItem {
  proposal_id: string;
  proposal_code: string;
  title: string;
  activity_type: string | null;
  organization_name: string;
  person_in_charge: string;
  submitted_at: string | null;
  event_date: string;
  event_end_date: string | null;
  venue: string;
  total_budget: number;
  proposal_status: ProposalStatusDb;
  current_version: number;
  updated_at: string;
  secretary_review_status: SecretaryReviewStatusDb;
  secretary_reviewed_at: string | null;
  secretary_review_note: string | null;
  intake_bucket: SecretaryIntakeBucket;
  submitter: {
    id: string;
    full_name: string;
    email: string;
    organization_unit: string | null;
  } | null;
  document_completeness: {
    has_primary_pdf: boolean;
    attachments_count: number;
    rab_items_count: number;
    has_approvers: boolean;
    is_complete: boolean;
  };
  first_approver: {
    approver_id: string;
    full_name: string;
    email: string;
    role_title: string;
    step_order: number;
  } | null;
}

export interface SecretaryIntakeQueueResponse {
  counts: {
    pending_review: number;
    clarification_needed: number;
    forwarded: number;
    all: number;
  };
  items: SecretaryIntakeQueueItem[];
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
 * into `action_required` (active sequential turn after secretary intake),
 * `upcoming` (waiting on secretary intake or an earlier step),
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
      "*, proposals(id, proposal_code, submitter_id, title, activity_type, organization_name, person_in_charge, event_date, venue, total_budget, status, secretary_review_status, current_version, updated_at, submitter:submitter_id(id, full_name, email, organization_unit))"
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

    const awaitingSecretaryIntake =
      propRaw.secretary_review_status === "pending_review" ||
      propRaw.secretary_review_status === "clarification_needed";

    const activeStepOrder =
      propRaw.status === "pending_ttd" &&
      !awaitingSecretaryIntake &&
      pendingSteps.length > 0
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
      !awaitingSecretaryIntake &&
      row.status === "pending" &&
      activeStepOrder === row.step_order
    ) {
      bucket = "action_required";
    } else if (
      propRaw.status === "approved" ||
      propRaw.status === "completed" ||
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
      secretary_review_status: propRaw.secretary_review_status,
      awaiting_secretary_intake: awaitingSecretaryIntake,
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

export type StudentAffairsFinalBucket = "awaiting_signature" | "completed";

export interface StudentAffairsFinalQueueItem {
  proposal_id: string;
  proposal_code: string;
  title: string;
  activity_type: string | null;
  organization_name: string;
  person_in_charge: string;
  submitted_at: string | null;
  event_date: string;
  event_end_date: string | null;
  venue: string;
  total_budget: number;
  proposal_status: ProposalStatusDb;
  current_version: number;
  updated_at: string;
  final_signed_at: string | null;
  final_verification_code: string | null;
  final_signature_note: string | null;
  final_signer: {
    id: string;
    full_name: string;
    email: string;
  } | null;
  submitter: {
    id: string;
    full_name: string;
    email: string;
    organization_unit: string | null;
  } | null;
  signed_approvers_count: number;
  queue_bucket: StudentAffairsFinalBucket;
}

export interface StudentAffairsFinalQueueResponse {
  counts: {
    awaiting_signature: number;
    completed: number;
    all: number;
  };
  items: StudentAffairsFinalQueueItem[];
}

/**
 * Fetches proposals that have been fully approved by sequential approvers (`status = 'approved'`)
 * and are awaiting Student Affairs final signature, alongside finalized (`status = 'completed'`) proposals.
 */
export async function fetchStudentAffairsFinalQueue(
  supabase: SupabaseClient<Database>,
  filter: StudentAffairsQueueFilter = "awaiting_signature"
): Promise<StudentAffairsFinalQueueResponse> {
  const { data: proposalsRows } = await supabase
    .from("proposals")
    .select(
      "id, proposal_code, submitter_id, title, activity_type, organization_name, person_in_charge, submitted_at, created_at, event_date, event_end_date, venue, total_budget, status, current_version, updated_at, final_signed_at, final_verification_code, final_signature_note, submitter:submitter_id(id, full_name, email, organization_unit), final_signer:final_signed_by(id, full_name, email)"
    )
    .in("status", ["approved", "completed"])
    .order("updated_at", { ascending: false });

  const proposals = proposalsRows ?? [];
  const proposalIds = proposals.map((p) => p.id);

  const { data: signersRows } =
    proposalIds.length > 0
      ? await supabase
          .from("proposal_signers")
          .select("proposal_id, status")
          .in("proposal_id", proposalIds)
      : { data: [] };

  const signedCountByProposal = new Map<string, number>();
  for (const s of signersRows ?? []) {
    if (s.status === "signed") {
      signedCountByProposal.set(
        s.proposal_id,
        (signedCountByProposal.get(s.proposal_id) ?? 0) + 1
      );
    }
  }

  const allItems: StudentAffairsFinalQueueItem[] = proposals.map((prop) => {
    const submitterObj = Array.isArray(prop.submitter)
      ? prop.submitter[0] ?? null
      : prop.submitter ?? null;
    const finalSignerObj = Array.isArray(prop.final_signer)
      ? prop.final_signer[0] ?? null
      : prop.final_signer ?? null;

    const bucket: StudentAffairsFinalBucket =
      prop.status === "completed" ? "completed" : "awaiting_signature";

    return {
      proposal_id: prop.id,
      proposal_code: prop.proposal_code,
      title: prop.title,
      activity_type: prop.activity_type,
      organization_name: prop.organization_name,
      person_in_charge: prop.person_in_charge,
      submitted_at: prop.submitted_at ?? prop.created_at,
      event_date: prop.event_date,
      event_end_date: prop.event_end_date,
      venue: prop.venue,
      total_budget: Number(prop.total_budget),
      proposal_status: prop.status,
      current_version: prop.current_version,
      updated_at: prop.updated_at,
      final_signed_at: prop.final_signed_at,
      final_verification_code: prop.final_verification_code,
      final_signature_note: prop.final_signature_note,
      final_signer: finalSignerObj,
      submitter: submitterObj,
      signed_approvers_count: signedCountByProposal.get(prop.id) ?? 0,
      queue_bucket: bucket,
    };
  });

  allItems.sort((a, b) => {
    if (a.queue_bucket !== b.queue_bucket) {
      return a.queue_bucket === "awaiting_signature" ? -1 : 1;
    }
    return b.updated_at.localeCompare(a.updated_at);
  });

  const counts = {
    awaiting_signature: allItems.filter(
      (i) => i.queue_bucket === "awaiting_signature"
    ).length,
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

/**
 * Fetches incoming non-draft proposals for Faculty Secretary Intake Management (PBI-05):
 * - Proposal ID (`proposal_code`), Event Title, Organization, Submitted Date, Event Date,
 *   Document Completeness, and Step 1 Approver (Kaprodi) routing target.
 */
export async function fetchSecretaryIntakeQueue(
  supabase: SupabaseClient<Database>,
  filter: SecretaryQueueFilter = "pending_review"
): Promise<SecretaryIntakeQueueResponse> {
  const { data: proposalsRows } = await supabase
    .from("proposals")
    .select(
      "id, proposal_code, submitter_id, title, activity_type, organization_name, person_in_charge, submitted_at, created_at, event_date, event_end_date, venue, budget_items, total_budget, status, current_version, updated_at, secretary_review_status, secretary_reviewed_at, secretary_review_note, submitter:submitter_id(id, full_name, email, organization_unit)"
    )
    .neq("status", "draft")
    .order("updated_at", { ascending: false });

  const proposals = proposalsRows ?? [];
  const proposalIds = proposals.map((p) => p.id);

  const [{ data: attachmentsRows }, { data: signersRows }] =
    proposalIds.length > 0
      ? await Promise.all([
          supabase
            .from("proposal_attachments")
            .select("id, proposal_id, mime_type, attachment_kind")
            .in("proposal_id", proposalIds),
          supabase
            .from("proposal_signers")
            .select(
              "proposal_id, approver_id, role_title, step_order, status, users:approver_id(id, full_name, email)"
            )
            .in("proposal_id", proposalIds)
            .order("step_order", { ascending: true }),
        ])
      : [{ data: [] }, { data: [] }];

  const attachmentsByProposal = new Map<
    string,
    Array<{ mime_type: string; attachment_kind: string }>
  >();
  for (const att of attachmentsRows ?? []) {
    const arr = attachmentsByProposal.get(att.proposal_id) ?? [];
    arr.push({
      mime_type: att.mime_type,
      attachment_kind: att.attachment_kind,
    });
    attachmentsByProposal.set(att.proposal_id, arr);
  }

  type SignerSummary = {
    approver_id: string;
    role_title: string;
    step_order: number;
    status: SignerStatusDb;
    full_name: string;
    email: string;
  };
  const signersByProposal = new Map<string, SignerSummary[]>();
  for (const s of signersRows ?? []) {
    const userObj = Array.isArray(s.users) ? s.users[0] ?? null : s.users ?? null;
    const arr = signersByProposal.get(s.proposal_id) ?? [];
    arr.push({
      approver_id: s.approver_id,
      role_title: s.role_title,
      step_order: s.step_order,
      status: s.status,
      full_name: userObj?.full_name ?? "Campus Approver",
      email: userObj?.email ?? "",
    });
    signersByProposal.set(s.proposal_id, arr);
  }

  const allItems: SecretaryIntakeQueueItem[] = [];

  for (const prop of proposals) {
    const propAttachments = attachmentsByProposal.get(prop.id) ?? [];
    const propSigners = signersByProposal.get(prop.id) ?? [];
    const rabItems = parseBudgetItemsFromJson(prop.budget_items);
    const signedCount = propSigners.filter((s) => s.status === "signed").length;

    const hasPrimaryPdf = propAttachments.some(
      (a) =>
        a.attachment_kind === "primary_proposal_pdf" ||
        a.mime_type === "application/pdf"
    );
    const hasApprovers = propSigners.length > 0;
    const isComplete =
      hasPrimaryPdf &&
      propAttachments.length > 0 &&
      rabItems.length > 0 &&
      hasApprovers;

    let intakeBucket: SecretaryIntakeBucket;
    if (prop.secretary_review_status === "clarification_needed") {
      intakeBucket = "clarification_needed";
    } else if (
      prop.status === "pending_ttd" &&
      (prop.secretary_review_status === "pending_review" ||
        (prop.secretary_review_status === "not_started" && signedCount === 0))
    ) {
      intakeBucket = "pending_review";
    } else {
      intakeBucket = "forwarded";
    }

    const firstPendingOrFirst =
      propSigners.find((s) => s.status === "pending") ?? propSigners[0] ?? null;

    const submitterObj = Array.isArray(prop.submitter)
      ? prop.submitter[0] ?? null
      : prop.submitter ?? null;

    allItems.push({
      proposal_id: prop.id,
      proposal_code: prop.proposal_code,
      title: prop.title,
      activity_type: prop.activity_type,
      organization_name: prop.organization_name,
      person_in_charge: prop.person_in_charge,
      submitted_at: prop.submitted_at ?? prop.created_at,
      event_date: prop.event_date,
      event_end_date: prop.event_end_date,
      venue: prop.venue,
      total_budget: Number(prop.total_budget),
      proposal_status: prop.status,
      current_version: prop.current_version,
      updated_at: prop.updated_at,
      secretary_review_status: prop.secretary_review_status,
      secretary_reviewed_at: prop.secretary_reviewed_at,
      secretary_review_note: prop.secretary_review_note,
      intake_bucket: intakeBucket,
      submitter: submitterObj,
      document_completeness: {
        has_primary_pdf: hasPrimaryPdf,
        attachments_count: propAttachments.length,
        rab_items_count: rabItems.length,
        has_approvers: hasApprovers,
        is_complete: isComplete,
      },
      first_approver: firstPendingOrFirst
        ? {
            approver_id: firstPendingOrFirst.approver_id,
            full_name: firstPendingOrFirst.full_name,
            email: firstPendingOrFirst.email,
            role_title: firstPendingOrFirst.role_title,
            step_order: firstPendingOrFirst.step_order,
          }
        : null,
    });
  }

  const bucketWeight: Record<SecretaryIntakeBucket, number> = {
    pending_review: 0,
    clarification_needed: 1,
    forwarded: 2,
  };

  allItems.sort((a, b) => {
    if (bucketWeight[a.intake_bucket] !== bucketWeight[b.intake_bucket]) {
      return bucketWeight[a.intake_bucket] - bucketWeight[b.intake_bucket];
    }
    const timeA = a.submitted_at ?? a.updated_at;
    const timeB = b.submitted_at ?? b.updated_at;
    return timeB.localeCompare(timeA);
  });

  const counts = {
    pending_review: allItems.filter((i) => i.intake_bucket === "pending_review")
      .length,
    clarification_needed: allItems.filter(
      (i) => i.intake_bucket === "clarification_needed"
    ).length,
    forwarded: allItems.filter((i) => i.intake_bucket === "forwarded").length,
    all: allItems.length,
  };

  const filteredItems =
    filter === "all"
      ? allItems
      : allItems.filter((item) => item.intake_bucket === filter);

  return {
    counts,
    items: filteredItems,
  };
}
