import React, { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { requireAuth } from "@/src/lib/auth/guard";
import { createClient } from "@/src/lib/supabase/server";
import {
  approvalQueueFilterSchema,
  secretaryQueueFilterSchema,
  studentAffairsQueueFilterSchema,
  type ApprovalQueueFilter,
  type SecretaryQueueFilter,
  type StudentAffairsQueueFilter,
} from "@/src/lib/validations/approval";
import {
  fetchSecretaryIntakeQueue,
  fetchStudentAffairsFinalQueue,
  fetchUserApprovalQueue,
  type ApprovalQueueItem,
  type SecretaryIntakeQueueItem,
  type StudentAffairsFinalQueueItem,
} from "@/src/lib/proposals/approval-helpers";
import { isFacultySecretaryProfile } from "@/src/lib/proposals/approver-authority";

const QUEUE_TABS: ReadonlyArray<{
  key: ApprovalQueueFilter;
  label: string;
  countKey: "action_required" | "upcoming" | "completed" | "all";
}> = [
  {
    key: "action_required",
    label: "Action Required",
    countKey: "action_required",
  },
  { key: "upcoming", label: "Upcoming", countKey: "upcoming" },
  {
    key: "completed",
    label: "Completed Decisions",
    countKey: "completed",
  },
  { key: "all", label: "All Assigned", countKey: "all" },
];

const SECRETARY_TABS: ReadonlyArray<{
  key: SecretaryQueueFilter;
  label: string;
  countKey: "pending_review" | "clarification_needed" | "forwarded" | "all";
}> = [
  {
    key: "pending_review",
    label: "Needs Intake Check",
    countKey: "pending_review",
  },
  {
    key: "clarification_needed",
    label: "Clarification Follow-Up",
    countKey: "clarification_needed",
  },
  {
    key: "forwarded",
    label: "Forwarded to Approver",
    countKey: "forwarded",
  },
  {
    key: "all",
    label: "All Incoming",
    countKey: "all",
  },
];

const STUDENT_AFFAIRS_TABS: ReadonlyArray<{
  key: StudentAffairsQueueFilter;
  label: string;
  countKey: "awaiting_signature" | "completed" | "all";
}> = [
  {
    key: "awaiting_signature",
    label: "Awaiting Final Signature",
    countKey: "awaiting_signature",
  },
  {
    key: "completed",
    label: "Completed",
    countKey: "completed",
  },
  {
    key: "all",
    label: "All Finalized",
    countKey: "all",
  },
];

function formatIdr(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function getSignerDecisionBadge(item: ApprovalQueueItem) {
  if (item.queue_bucket === "action_required") {
    return {
      label: `Your Active Turn • Step ${item.my_step_order}`,
      classes: "border-[#1E3A8A]/30 bg-[#1E3A8A]/10 text-[#1E3A8A]",
      dotClasses: "bg-[#1E3A8A] animate-pulse",
    };
  }
  if (item.my_signer_status === "signed") {
    return {
      label: "Approved & Signed",
      classes: "border-emerald-200 bg-emerald-50 text-emerald-800",
      dotClasses: "bg-emerald-600",
    };
  }
  if (item.my_signer_status === "revision_requested") {
    return {
      label: "Needs Revision",
      classes: "border-rose-200 bg-rose-50 text-rose-800",
      dotClasses: "bg-rose-600",
    };
  }
  if (item.my_signer_status === "rejected") {
    return {
      label: "Rejected",
      classes: "border-rose-300 bg-rose-100/70 text-rose-900",
      dotClasses: "bg-rose-700",
    };
  }
  if (item.proposal_status === "needs_revision") {
    return {
      label:
        item.secretary_review_status === "clarification_needed"
          ? "Awaiting Submitter Clarification"
          : "With Submitter for Revision",
      classes: "border-rose-200 bg-rose-50 text-rose-800",
      dotClasses: "bg-rose-600",
    };
  }
  if (item.awaiting_secretary_intake) {
    return {
      label: "Awaiting Faculty Secretary Intake",
      classes: "border-amber-200 bg-amber-50 text-amber-800",
      dotClasses: "bg-amber-500",
    };
  }
  return {
    label: item.active_step_order
      ? `Waiting on Step ${item.active_step_order}`
      : "Queued",
    classes: "border-slate-200 bg-slate-100 text-slate-700",
    dotClasses: "bg-slate-400",
  };
}

function getSecretaryIntakeBadge(item: SecretaryIntakeQueueItem) {
  if (item.intake_bucket === "pending_review") {
    return {
      label: "Pending Intake Verification",
      classes: "border-[#1E3A8A]/30 bg-[#1E3A8A]/10 text-[#1E3A8A]",
      dotClasses: "bg-[#1E3A8A] animate-pulse",
    };
  }
  if (item.intake_bucket === "clarification_needed") {
    return {
      label: "Clarification Requested",
      classes: "border-amber-300 bg-amber-50 text-amber-900",
      dotClasses: "bg-amber-600",
    };
  }
  return {
    label: "Verified & Forwarded",
    classes: "border-emerald-200 bg-emerald-50 text-emerald-800",
    dotClasses: "bg-emerald-600",
  };
}

function getStudentAffairsFinalBadge(item: StudentAffairsFinalQueueItem) {
  if (item.queue_bucket === "awaiting_signature") {
    return {
      label: "Awaiting Final Signature",
      classes: "border-[#1E3A8A]/30 bg-[#1E3A8A]/10 text-[#1E3A8A]",
      dotClasses: "bg-[#1E3A8A] animate-pulse",
    };
  }
  return {
    label: "Completed",
    classes: "border-emerald-300 bg-emerald-100/80 text-emerald-900",
    dotClasses: "bg-emerald-700",
  };
}

async function ApprovalQueueSection({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<{ filter?: string }>;
}) {
  await connection();
  const profile = await requireAuth();
  const resolvedParams = await searchParamsPromise;
  const supabase = await createClient();

  // ==========================================================================
  // PBI-05: DEDICATED FACULTY SECRETARY PROPOSAL INTAKE VIEW
  // ==========================================================================
  if (isFacultySecretaryProfile(profile)) {
    const parsedSecFilter = secretaryQueueFilterSchema.safeParse(
      resolvedParams.filter ?? "pending_review"
    );
    const activeSecFilter: SecretaryQueueFilter = parsedSecFilter.success
      ? parsedSecFilter.data
      : "pending_review";

    const { counts, items } = await fetchSecretaryIntakeQueue(
      supabase,
      activeSecFilter
    );

    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[#1E3A8A]">
              Faculty Secretary Governance
            </span>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#0F172A]">
              Secretary Proposal Intake Management
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Inspect incoming student organization proposals, verify document
              completeness, request follow-up clarifications, or forward to Head
              of Study Program (Kaprodi).
            </p>
          </div>

          <span className="inline-flex items-center gap-2 rounded-full border border-[#E2E8F0] bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-2xs">
            <span>Intake &amp; Routing Only (No Direct Approve/Reject)</span>
          </span>
        </div>

        {/* Summary KPI Strip */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-2xs">
            <span className="text-xs font-semibold text-slate-500">
              Needs Intake Verification
            </span>
            <p className="mt-2 text-3xl font-bold text-[#1E3A8A]">
              {counts.pending_review}
            </p>
          </div>
          <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-2xs">
            <span className="text-xs font-semibold text-slate-500">
              Clarification / Follow-Up Pending
            </span>
            <p className="mt-2 text-3xl font-bold text-amber-600">
              {counts.clarification_needed}
            </p>
          </div>
          <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-2xs">
            <span className="text-xs font-semibold text-slate-500">
              Verified &amp; Forwarded to Approver
            </span>
            <p className="mt-2 text-3xl font-bold text-emerald-700">
              {counts.forwarded}
            </p>
          </div>
        </div>

        {/* Secretary Intake Filter Tabs & Incoming Proposals List */}
        <div className="mt-6 rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-2xs">
          <div
            role="tablist"
            aria-label="Filter incoming proposals for secretary intake"
            className="flex flex-wrap items-center gap-1.5 border-b border-[#E2E8F0] pb-4"
          >
            {SECRETARY_TABS.map((tab) => {
              const isSelected = tab.key === activeSecFilter;
              const href =
                tab.key === "pending_review"
                  ? "/approvals"
                  : `/approvals?filter=${tab.key}`;

              return (
                <Link
                  key={tab.key}
                  href={href}
                  role="tab"
                  aria-selected={isSelected}
                  className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                    isSelected
                      ? "bg-[#0F172A] text-white shadow-2xs"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-[#0F172A]"
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                      isSelected
                        ? "bg-white/20 text-white"
                        : "bg-white text-slate-700"
                    }`}
                  >
                    {counts[tab.countKey]}
                  </span>
                </Link>
              );
            })}
          </div>

          {items.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-[#E2E8F0] bg-[#F8FAFC] p-10 text-center">
              <p className="text-sm font-bold text-[#0F172A]">
                {activeSecFilter === "pending_review"
                  ? "No incoming proposals currently awaiting intake check"
                  : activeSecFilter === "clarification_needed"
                  ? "No proposals awaiting clarification follow-up"
                  : activeSecFilter === "forwarded"
                  ? "No proposals forwarded yet"
                  : "No submitted proposals recorded yet"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Submitted student organization proposals appear here
                automatically for completeness verification.
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-3.5">
              {items.map((item) => {
                const badge = getSecretaryIntakeBadge(item);
                const isPendingCheck = item.intake_bucket === "pending_review";
                const comp = item.document_completeness;

                return (
                  <div
                    key={item.proposal_id}
                    className={`rounded-2xl border p-5 transition ${
                      isPendingCheck
                        ? "border-[#1E3A8A] bg-[#0F172A]/[0.015] ring-2 ring-[#1E3A8A]/15"
                        : "border-[#E2E8F0] bg-white hover:border-slate-300"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-500">
                          {item.proposal_code}
                        </span>
                        <span className="rounded-full bg-[#0F172A] px-2.5 py-0.5 text-[10px] font-bold text-white">
                          v{item.current_version}.0
                        </span>
                        {item.activity_type && (
                          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-700">
                            {item.activity_type}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                            comp.is_complete
                              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                              : "border-amber-300 bg-amber-50 text-amber-900"
                          }`}
                        >
                          {comp.is_complete
                            ? `✓ Docs Complete (${comp.attachments_count} File${
                                comp.attachments_count === 1 ? "" : "s"
                              })`
                            : `! Incomplete (${
                                comp.has_primary_pdf ? "PDF" : "No PDF"
                              } • ${comp.attachments_count} File${
                                comp.attachments_count === 1 ? "" : "s"
                              })`}
                        </span>

                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${badge.classes}`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${badge.dotClasses}`}
                          />
                          {badge.label}
                        </span>
                      </div>
                    </div>

                    <p className="mt-2 text-xs font-bold uppercase tracking-wider text-[#1E3A8A]">
                      {item.organization_name || "Unspecified Organization"}
                    </p>
                    <h2 className="mt-0.5 text-base font-bold text-[#0F172A]">
                      {item.title || "Untitled Event Proposal"}
                    </h2>

                    {item.secretary_review_note && (
                      <div className="mt-2.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2 text-xs text-slate-700">
                        <strong className="text-[#0F172A]">
                          Secretary Intake Note:
                        </strong>{" "}
                        {item.secretary_review_note}
                      </div>
                    )}

                    <div className="mt-3.5 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-3">
                      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                        <span>
                          Submitted:{" "}
                          <strong className="font-medium text-slate-700">
                            {formatDateTime(item.submitted_at)}
                          </strong>
                        </span>
                        <span>
                          Event Date:{" "}
                          <strong className="font-medium text-slate-700">
                            {item.event_date}
                            {item.event_end_date
                              ? ` → ${item.event_end_date}`
                              : ""}
                          </strong>
                        </span>
                        <span>
                          Budget:{" "}
                          <strong className="text-[#0F172A]">
                            {formatIdr(item.total_budget)}
                          </strong>
                        </span>
                        {item.first_approver && (
                          <span>
                            Target Approver:{" "}
                            <strong className="text-[#1E3A8A]">
                              {item.first_approver.full_name} (
                              {item.first_approver.role_title})
                            </strong>
                          </span>
                        )}
                      </div>

                      <Link
                        href={`/proposals/${item.proposal_id}`}
                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-5 py-2 text-xs font-semibold transition ${
                          isPendingCheck
                            ? "bg-[#0F172A] text-white shadow-xs hover:bg-[#1E3A8A]"
                            : "border border-[#E2E8F0] bg-[#F8FAFC] text-[#0F172A] hover:border-slate-300 hover:bg-white"
                        }`}
                      >
                        <span>
                          {isPendingCheck
                            ? "Verify & Forward / Follow-Up →"
                            : "Inspect Proposal →"}
                        </span>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ==========================================================================
  // STUDENT AFFAIRS FINAL SIGNATURE QUEUE
  // ==========================================================================
  if (profile.functional_role === "student_affairs") {
    const parsedSaFilter = studentAffairsQueueFilterSchema.safeParse(
      resolvedParams.filter ?? "awaiting_signature"
    );
    const activeSaFilter: StudentAffairsQueueFilter = parsedSaFilter.success
      ? parsedSaFilter.data
      : "awaiting_signature";

    const { counts, items } = await fetchStudentAffairsFinalQueue(
      supabase,
      activeSaFilter
    );

    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[#1E3A8A]">
              Directorate of Student Affairs
            </span>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#0F172A]">
              Final Signature Queue
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Review proposals approved by all sequential approvers, apply the
              Student Affairs final signature, and complete proposal processing.
            </p>
          </div>

          <Link
            href="/profile"
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold shadow-2xs transition ${
              profile.signature_storage_path
                ? "border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
                : "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
            }`}
          >
            <span>
              {profile.signature_storage_path
                ? "✓ Digital Signature Ready"
                : "! Configure Digital Signature →"}
            </span>
          </Link>
        </div>

        {/* Summary KPI Strip */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-2xs">
            <span className="text-xs font-semibold text-slate-500">
              Awaiting Final Signature
            </span>
            <p className="mt-2 text-3xl font-bold text-[#1E3A8A]">
              {counts.awaiting_signature}
            </p>
          </div>
          <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-2xs">
            <span className="text-xs font-semibold text-slate-500">
              Completed Proposals
            </span>
            <p className="mt-2 text-3xl font-bold text-emerald-700">
              {counts.completed}
            </p>
          </div>
          <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-2xs">
            <span className="text-xs font-semibold text-slate-500">
              Total Final-Stage Proposals
            </span>
            <p className="mt-2 text-3xl font-bold text-[#0F172A]">
              {counts.all}
            </p>
          </div>
        </div>

        {/* Tabs & Queue Items */}
        <div className="mt-6 rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-2xs">
          <div
            role="tablist"
            aria-label="Filter Student Affairs final signature queue"
            className="flex flex-wrap items-center gap-1.5 border-b border-[#E2E8F0] pb-4"
          >
            {STUDENT_AFFAIRS_TABS.map((tab) => {
              const isSelected = tab.key === activeSaFilter;
              const href =
                tab.key === "awaiting_signature"
                  ? "/approvals"
                  : `/approvals?filter=${tab.key}`;

              return (
                <Link
                  key={tab.key}
                  href={href}
                  role="tab"
                  aria-selected={isSelected}
                  className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                    isSelected
                      ? "bg-[#0F172A] text-white shadow-2xs"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-[#0F172A]"
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                      isSelected
                        ? "bg-white/20 text-white"
                        : "bg-white text-slate-700"
                    }`}
                  >
                    {counts[tab.countKey]}
                  </span>
                </Link>
              );
            })}
          </div>

          {items.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-[#E2E8F0] bg-[#F8FAFC] p-10 text-center">
              <p className="text-sm font-bold text-[#0F172A]">
                {activeSaFilter === "awaiting_signature"
                  ? "No approved proposals currently awaiting final signature"
                  : activeSaFilter === "completed"
                  ? "No completed proposals recorded yet"
                  : "No proposals have reached Student Affairs final stage yet"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Proposals approved by Head of Study Program and sequential
                approvers appear here automatically.
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-3.5">
              {items.map((item) => {
                const badge = getStudentAffairsFinalBadge(item);
                const isAwaiting = item.queue_bucket === "awaiting_signature";

                return (
                  <div
                    key={item.proposal_id}
                    className={`rounded-2xl border p-5 transition ${
                      isAwaiting
                        ? "border-[#1E3A8A] bg-[#0F172A]/[0.015] ring-2 ring-[#1E3A8A]/15"
                        : "border-[#E2E8F0] bg-white hover:border-slate-300"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-500">
                          {item.proposal_code}
                        </span>
                        <span className="rounded-full bg-[#0F172A] px-2.5 py-0.5 text-[10px] font-bold text-white">
                          v{item.current_version}.0
                        </span>
                        <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800">
                          {item.signed_approvers_count} Approver(s) Signed
                        </span>
                      </div>

                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${badge.classes}`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${badge.dotClasses}`}
                        />
                        {badge.label}
                      </span>
                    </div>

                    <p className="mt-2 text-xs font-bold uppercase tracking-wider text-[#1E3A8A]">
                      {item.organization_name}
                    </p>
                    <h2 className="mt-0.5 text-base font-bold text-[#0F172A]">
                      {item.title}
                    </h2>

                    {item.final_signature_note && (
                      <div className="mt-2.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2 text-xs text-slate-700">
                        <strong className="text-[#0F172A]">
                          Student Affairs Note:
                        </strong>{" "}
                        {item.final_signature_note}
                      </div>
                    )}

                    <div className="mt-3.5 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-3">
                      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                        <span>
                          Submitter:{" "}
                          <strong className="font-medium text-slate-700">
                            {item.submitter
                              ? `${item.submitter.full_name} (${item.submitter.email})`
                              : item.person_in_charge}
                          </strong>
                        </span>
                        <span>Event: {item.event_date}</span>
                        <span>
                          Budget:{" "}
                          <strong className="text-[#0F172A]">
                            {formatIdr(item.total_budget)}
                          </strong>
                        </span>
                        {item.final_signed_at && (
                          <span>
                            Completed: {formatDateTime(item.final_signed_at)}
                          </span>
                        )}
                        {item.final_signer && (
                          <span>
                            Signed by:{" "}
                            <strong className="text-[#0F172A]">
                              {item.final_signer.full_name}
                            </strong>
                          </span>
                        )}
                        {item.final_verification_code && (
                          <span className="font-mono text-[11px] font-semibold text-emerald-800">
                            {item.final_verification_code}
                          </span>
                        )}
                      </div>

                      <Link
                        href={`/proposals/${item.proposal_id}`}
                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-5 py-2 text-xs font-semibold transition ${
                          isAwaiting
                            ? "bg-[#0F172A] text-white shadow-xs hover:bg-[#1E3A8A]"
                            : "border border-[#E2E8F0] bg-[#F8FAFC] text-[#0F172A] hover:border-slate-300 hover:bg-white"
                        }`}
                      >
                        <span>
                          {isAwaiting
                            ? "Review & Apply Final Signature →"
                            : "View Completed Proposal →"}
                        </span>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ==========================================================================
  // STANDARD SEQUENTIAL TTD APPROVER QUEUE (PBI-06 / PBI-08)
  // ==========================================================================
  const parsedFilter = approvalQueueFilterSchema.safeParse(
    resolvedParams.filter ?? "action_required"
  );
  const activeFilter: ApprovalQueueFilter = parsedFilter.success
    ? parsedFilter.data
    : "action_required";

  const { counts, items } = await fetchUserApprovalQueue(
    supabase,
    profile.id,
    activeFilter
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-[#1E3A8A]">
            Sequential Digital TTD Governance
          </span>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#0F172A]">
            Approval Queue
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Review proposals routed to your sequential signing turn, monitor
            upcoming sign-offs, and inspect your decision history.
          </p>
        </div>

        <Link
          href="/profile"
          className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold shadow-2xs transition ${
            profile.signature_storage_path
              ? "border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
              : "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
          }`}
        >
          <span>
            {profile.signature_storage_path
              ? "✓ Digital Signature Ready"
              : "! Configure Digital Signature (TTD) →"}
          </span>
        </Link>
      </div>

      {/* Summary KPI Strip */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-2xs">
          <span className="text-xs font-semibold text-slate-500">
            Action Required (Your Turn)
          </span>
          <p className="mt-2 text-3xl font-bold text-[#1E3A8A]">
            {counts.action_required}
          </p>
        </div>
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-2xs">
          <span className="text-xs font-semibold text-slate-500">
            Upcoming in Chain
          </span>
          <p className="mt-2 text-3xl font-bold text-[#0F172A]">
            {counts.upcoming}
          </p>
        </div>
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-2xs">
          <span className="text-xs font-semibold text-slate-500">
            Completed Decisions
          </span>
          <p className="mt-2 text-3xl font-bold text-emerald-700">
            {counts.completed}
          </p>
        </div>
      </div>

      {/* Queue Tabs & List Card */}
      <div className="mt-6 rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-2xs">
        <div
          role="tablist"
          aria-label="Filter approval queue"
          className="flex flex-wrap items-center gap-1.5 border-b border-[#E2E8F0] pb-4"
        >
          {QUEUE_TABS.map((tab) => {
            const isSelected = tab.key === activeFilter;
            const href =
              tab.key === "action_required"
                ? "/approvals"
                : `/approvals?filter=${tab.key}`;

            return (
              <Link
                key={tab.key}
                href={href}
                role="tab"
                aria-selected={isSelected}
                className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                  isSelected
                    ? "bg-[#0F172A] text-white shadow-2xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-[#0F172A]"
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                    isSelected
                      ? "bg-white/20 text-white"
                      : "bg-white text-slate-700"
                  }`}
                >
                  {counts[tab.countKey]}
                </span>
              </Link>
            );
          })}
        </div>

        {items.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-[#E2E8F0] bg-[#F8FAFC] p-10 text-center">
            <p className="text-sm font-bold text-[#0F172A]">
              {activeFilter === "action_required"
                ? "No proposals currently require your immediate signature"
                : activeFilter === "upcoming"
                ? "No upcoming proposals waiting on earlier steps"
                : activeFilter === "completed"
                ? "No completed approval decisions yet"
                : "No proposals assigned to your account yet"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Assigned sequential sign-offs for{" "}
              <span className="font-mono text-slate-700">{profile.email}</span>{" "}
              appear here automatically.
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-3.5">
            {items.map((item) => {
              const badge = getSignerDecisionBadge(item);
              const isActionRequired = item.queue_bucket === "action_required";

              return (
                <div
                  key={item.signer_row_id}
                  className={`rounded-2xl border p-5 transition ${
                    isActionRequired
                      ? "border-[#1E3A8A] bg-[#0F172A]/[0.015] ring-2 ring-[#1E3A8A]/15"
                      : "border-[#E2E8F0] bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-500">
                        {item.proposal_code}
                      </span>
                      <span className="rounded-full bg-[#0F172A] px-2.5 py-0.5 text-[10px] font-bold text-white">
                        v{item.current_version}.0
                      </span>
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700">
                        Step {item.my_step_order} of {item.total_steps} •{" "}
                        {item.my_role_title}
                      </span>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${badge.classes}`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${badge.dotClasses}`}
                      />
                      {badge.label}
                    </span>
                  </div>

                  <p className="mt-2 text-xs font-bold uppercase tracking-wider text-[#1E3A8A]">
                    {item.organization_name}
                  </p>
                  <h2 className="mt-0.5 text-base font-bold text-[#0F172A]">
                    {item.title}
                  </h2>

                  {item.my_decision_note && (
                    <div className="mt-2.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2 text-xs text-slate-700">
                      <strong className="text-[#0F172A]">Your Note:</strong>{" "}
                      {item.my_decision_note}
                    </div>
                  )}

                  <div className="mt-3.5 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-3">
                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                      <span>
                        Submitter:{" "}
                        <strong className="font-medium text-slate-700">
                          {item.submitter
                            ? `${item.submitter.full_name} (${item.submitter.email})`
                            : item.person_in_charge}
                        </strong>
                      </span>
                      <span>Event: {item.event_date}</span>
                      <span>
                        Budget:{" "}
                        <strong className="text-[#0F172A]">
                          {formatIdr(item.total_budget)}
                        </strong>
                      </span>
                      <span>
                        TTD:{" "}
                        <strong className="text-[#0F172A]">
                          {item.signed_steps_count}/{item.total_steps} Signed
                        </strong>
                      </span>
                      {item.my_decided_at && (
                        <span>
                          Decided: {formatDateTime(item.my_decided_at)}
                        </span>
                      )}
                      {item.my_verification_code && (
                        <span className="font-mono text-[11px] font-semibold text-emerald-800">
                          {item.my_verification_code}
                        </span>
                      )}
                    </div>

                    <Link
                      href={`/proposals/${item.proposal_id}`}
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-5 py-2 text-xs font-semibold transition ${
                        isActionRequired
                          ? "bg-[#0F172A] text-white shadow-xs hover:bg-[#1E3A8A]"
                          : "border border-[#E2E8F0] bg-[#F8FAFC] text-[#0F172A] hover:border-slate-300 hover:bg-white"
                      }`}
                    >
                      <span>
                        {isActionRequired
                          ? "Approve & Sign →"
                          : "View Proposal →"}
                      </span>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-xs font-medium text-slate-500">
          Loading approval queue...
        </div>
      }
    >
      <ApprovalQueueSection searchParamsPromise={searchParams} />
    </Suspense>
  );
}
