import React, { Suspense } from "react";
import Link from "next/link";
import { requireAuth } from "@/src/lib/auth/guard";
import { createClient } from "@/src/lib/supabase/server";
import {
  approvalQueueFilterSchema,
  type ApprovalQueueFilter,
} from "@/src/lib/validations/approval";
import {
  fetchUserApprovalQueue,
  type ApprovalQueueItem,
} from "@/src/lib/proposals/approval-helpers";

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
    };
  }
  if (item.my_signer_status === "signed") {
    return {
      label: "Approved & Signed",
      classes: "border-emerald-200 bg-emerald-50 text-emerald-800",
    };
  }
  if (item.my_signer_status === "revision_requested") {
    return {
      label: "Revision Requested",
      classes: "border-amber-200 bg-amber-50 text-amber-800",
    };
  }
  if (item.my_signer_status === "rejected") {
    return {
      label: "Rejected",
      classes: "border-rose-200 bg-rose-50 text-rose-800",
    };
  }
  if (item.proposal_status === "needs_revision") {
    return {
      label: "With Submitter for Revision",
      classes: "border-amber-200 bg-amber-50 text-amber-800",
    };
  }
  return {
    label: item.active_step_order
      ? `Waiting on Step ${item.active_step_order}`
      : "Queued",
    classes: "border-slate-200 bg-slate-100 text-slate-700",
  };
}

async function ApprovalQueueSection({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<{ filter?: string }>;
}) {
  const profile = await requireAuth();
  const resolvedParams = await searchParamsPromise;

  const parsedFilter = approvalQueueFilterSchema.safeParse(
    resolvedParams.filter ?? "action_required"
  );
  const activeFilter: ApprovalQueueFilter = parsedFilter.success
    ? parsedFilter.data
    : "action_required";

  const supabase = await createClient();
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
          <div className="mt-2 divide-y divide-slate-100">
            {items.map((item) => {
              const badge = getSignerDecisionBadge(item);
              const isActionRequired = item.queue_bucket === "action_required";

              return (
                <div
                  key={item.signer_row_id}
                  className="flex flex-wrap items-center justify-between gap-4 py-5"
                >
                  <div className="min-w-0 flex-1">
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
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${badge.classes}`}
                      >
                        {badge.label}
                      </span>
                    </div>

                    <h2 className="mt-1.5 text-base font-bold text-[#0F172A]">
                      {item.title}
                    </h2>

                    <p className="mt-1 text-xs text-slate-600">
                      <span className="font-semibold text-[#1E3A8A]">
                        {item.organization_name}
                      </span>{" "}
                      • Submitter:{" "}
                      {item.submitter
                        ? `${item.submitter.full_name} (${item.submitter.email})`
                        : item.person_in_charge}{" "}
                      • Event: {item.event_date}
                    </p>

                    <div className="mt-1.5 flex flex-wrap items-center gap-4 text-xs text-slate-500">
                      <span>
                        Budget:{" "}
                        <strong className="text-[#0F172A]">
                          {formatIdr(item.total_budget)}
                        </strong>
                      </span>
                      <span>
                        Chain Progress:{" "}
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
                        <span className="font-mono text-[11px] text-emerald-800">
                          {item.my_verification_code}
                        </span>
                      )}
                    </div>

                    {item.my_decision_note && (
                      <p className="mt-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-xs text-slate-700">
                        <strong className="text-[#0F172A]">Your Note:</strong>{" "}
                        {item.my_decision_note}
                      </p>
                    )}
                  </div>

                  <div className="shrink-0">
                    <Link
                      href={`/proposals/${item.proposal_id}`}
                      className={`inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-xs font-semibold transition ${
                        isActionRequired
                          ? "bg-[#0F172A] text-white shadow-xs hover:bg-[#1E3A8A]"
                          : "border border-[#E2E8F0] bg-[#F8FAFC] text-[#0F172A] hover:border-slate-300 hover:bg-white"
                      }`}
                    >
                      <span>
                        {isActionRequired
                          ? "Review & Sign →"
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
