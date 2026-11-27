import React, { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { requireAuth } from "@/src/lib/auth/guard";
import { createClient } from "@/src/lib/supabase/server";
import type { ProposalStatusDb } from "@/src/lib/supabase/database.types";

type StatusTabKey =
  | "all"
  | "draft"
  | "in_review"
  | "revision_requested"
  | "approved"
  | "rejected";

const STATUS_TABS: ReadonlyArray<{
  key: StatusTabKey;
  label: string;
  dbStatus: ProposalStatusDb | null;
}> = [
  { key: "all", label: "All", dbStatus: null },
  { key: "draft", label: "Draft", dbStatus: "draft" },
  { key: "in_review", label: "In Review", dbStatus: "pending_ttd" },
  {
    key: "revision_requested",
    label: "Revision Requested",
    dbStatus: "needs_revision",
  },
  { key: "approved", label: "Approved", dbStatus: "approved" },
  { key: "rejected", label: "Rejected", dbStatus: "rejected" },
];

function getStatusBadge(status: ProposalStatusDb) {
  switch (status) {
    case "approved":
      return {
        label: "Approved",
        classes: "bg-emerald-50 text-emerald-800 border-emerald-200",
        dotClasses: "bg-emerald-600",
      };
    case "needs_revision":
      return {
        label: "Needs Revision",
        classes: "bg-rose-50 text-rose-800 border-rose-200",
        dotClasses: "bg-rose-600",
      };
    case "rejected":
      return {
        label: "Rejected",
        classes: "bg-rose-100/70 text-rose-900 border-rose-300",
        dotClasses: "bg-rose-700",
      };
    case "draft":
      return {
        label: "Draft",
        classes: "bg-slate-100 text-slate-700 border-slate-300",
        dotClasses: "bg-slate-400",
      };
    case "pending_ttd":
    default:
      return {
        label: "Pending TTD",
        classes: "bg-[#1E3A8A]/10 text-[#1E3A8A] border-[#1E3A8A]/25",
        dotClasses: "bg-[#1E3A8A]",
      };
  }
}

function formatIdr(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function normalizeTabKey(raw: string | undefined): StatusTabKey {
  if (!raw) return "all";
  const lower = raw.toLowerCase();
  if (lower === "pending_ttd") return "in_review";
  if (lower === "needs_revision") return "revision_requested";
  const matched = STATUS_TABS.find((t) => t.key === lower);
  return matched ? matched.key : "all";
}

function buildProposalsHref(params: {
  status: StatusTabKey;
  q: string;
  page: number;
}): string {
  const sp = new URLSearchParams();
  if (params.status !== "all") sp.set("status", params.status);
  if (params.q.trim() !== "") sp.set("q", params.q.trim());
  if (params.page > 1) sp.set("page", String(params.page));
  const qs = sp.toString();
  return qs ? `/proposals?${qs}` : "/proposals";
}

async function ProposalsListSection({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<{
    status?: string;
    q?: string;
    page?: string;
  }>;
}) {
  await connection();
  const profile = await requireAuth();
  const resolvedParams = await searchParamsPromise;

  const activeTabKey = normalizeTabKey(resolvedParams.status);
  const activeTabMeta =
    STATUS_TABS.find((t) => t.key === activeTabKey) ?? STATUS_TABS[0];

  const rawQuery = resolvedParams.q?.trim() ?? "";
  const safeQuery = rawQuery.replace(/[,%()]/g, "").slice(0, 100);

  const pageSize = 10;
  const currentPage = Math.max(
    1,
    Number.parseInt(resolvedParams.page ?? "1", 10) || 1
  );
  const from = (currentPage - 1) * pageSize;
  const to = from + pageSize - 1;

  const supabase = await createClient();

  let listQuery = supabase
    .from("proposals")
    .select(
      "id, proposal_code, submitter_id, title, activity_type, organization_name, person_in_charge, event_date, event_end_date, venue, total_budget, status, current_version, updated_at",
      { count: "exact" }
    )
    .order("updated_at", { ascending: false })
    .range(from, to);

  if (activeTabMeta.dbStatus) {
    listQuery = listQuery.eq("status", activeTabMeta.dbStatus);
  }

  if (safeQuery.length > 0) {
    listQuery = listQuery.or(
      `title.ilike.%${safeQuery}%,proposal_code.ilike.%${safeQuery}%,organization_name.ilike.%${safeQuery}%`
    );
  }

  const [{ data: proposals, count }, { data: allStatusesRows }] =
    await Promise.all([
      listQuery,
      supabase.from("proposals").select("status"),
    ]);

  const list = proposals ?? [];
  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const statusCounts: Record<StatusTabKey, number> = {
    all: (allStatusesRows ?? []).length,
    draft: 0,
    in_review: 0,
    revision_requested: 0,
    approved: 0,
    rejected: 0,
  };

  for (const row of allStatusesRows ?? []) {
    if (row.status === "draft") statusCounts.draft += 1;
    else if (row.status === "pending_ttd") statusCounts.in_review += 1;
    else if (row.status === "needs_revision")
      statusCounts.revision_requested += 1;
    else if (row.status === "approved") statusCounts.approved += 1;
    else if (row.status === "rejected") statusCounts.rejected += 1;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-[#1E3A8A]">
            Proposal Management
          </span>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#0F172A]">
            Proposals
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage saved drafts, monitor sequential TTD reviews, and respond to
            revision requests.
          </p>
        </div>

        {(profile.role === "student" || profile.role === "admin") && (
          <Link
            href="/proposals/new"
            className="inline-flex items-center gap-1.5 rounded-full bg-[#0F172A] px-5 py-2.5 text-xs font-semibold text-white shadow-2xs transition hover:bg-[#1E3A8A]"
          >
            <span>+ New Proposal</span>
          </Link>
        )}
      </div>

      {/* Status Filter Tabs & Search Bar */}
      <div className="mt-6 rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E2E8F0] pb-4">
          <div
            role="tablist"
            aria-label="Filter proposals by status"
            className="flex flex-wrap items-center gap-1.5"
          >
            {STATUS_TABS.map((tab) => {
              const isSelected = tab.key === activeTabKey;
              return (
                <Link
                  key={tab.key}
                  href={buildProposalsHref({
                    status: tab.key,
                    q: safeQuery,
                    page: 1,
                  })}
                  role="tab"
                  aria-selected={isSelected}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
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
                    {statusCounts[tab.key]}
                  </span>
                </Link>
              );
            })}
          </div>

          <form
            method="GET"
            action="/proposals"
            className="flex w-full items-center gap-2 sm:w-auto"
          >
            {activeTabKey !== "all" && (
              <input type="hidden" name="status" value={activeTabKey} />
            )}
            <input
              type="search"
              name="q"
              defaultValue={rawQuery}
              placeholder="Search title, code, or org..."
              className="w-full rounded-full border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-1.5 text-xs text-[#0F172A] placeholder:text-slate-400 focus:border-[#1E3A8A] focus:bg-white focus:outline-none sm:w-64"
            />
            <button
              type="submit"
              className="rounded-full bg-[#0F172A] px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-[#1E3A8A] cursor-pointer"
            >
              Search
            </button>
          </form>
        </div>

        {/* Proposals Rows */}
        {list.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-[#E2E8F0] bg-[#F8FAFC] p-10 text-center">
            <p className="text-sm font-bold text-[#0F172A]">
              No proposals match your current filter
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {safeQuery
                ? `No records matched "${safeQuery}". Try clearing your search filter.`
                : "Create a new proposal draft or select a different status tab above."}
            </p>
            {safeQuery && (
              <Link
                href={buildProposalsHref({
                  status: activeTabKey,
                  q: "",
                  page: 1,
                })}
                className="mt-4 inline-flex rounded-full border border-[#E2E8F0] bg-white px-4 py-1.5 text-xs font-semibold text-[#0F172A] hover:bg-slate-50"
              >
                Clear Search
              </Link>
            )}
          </div>
        ) : (
          <div className="mt-4 space-y-3.5">
            {list.map((proposal) => {
              const badge = getStatusBadge(proposal.status);
              const canEdit =
                (proposal.status === "draft" ||
                  proposal.status === "needs_revision") &&
                (proposal.submitter_id === profile.id ||
                  profile.role === "admin");

              return (
                <div
                  key={proposal.id}
                  className={`rounded-2xl border p-4 transition ${
                    proposal.status === "needs_revision"
                      ? "border-rose-200 bg-rose-50/15 hover:border-rose-300"
                      : "border-[#E2E8F0] bg-white hover:border-[#1E3A8A]/40 hover:shadow-2xs"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-slate-500">
                        {proposal.proposal_code}
                      </span>
                      <span className="rounded-full bg-[#0F172A] px-2 py-0.5 text-[10px] font-bold text-white">
                        v{proposal.current_version}.0
                      </span>
                      {proposal.activity_type && (
                        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-medium text-slate-600">
                          {proposal.activity_type}
                        </span>
                      )}
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

                  <p className="mt-2 text-xs font-semibold text-[#1E3A8A]">
                    {proposal.organization_name || "Unspecified Organization"}
                  </p>
                  <h2 className="mt-0.5 truncate text-base font-bold text-[#0F172A]">
                    {proposal.title || "Untitled Proposal Draft"}
                  </h2>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
                    <p className="text-xs text-slate-500">
                      PIC:{" "}
                      <span className="font-medium text-slate-700">
                        {proposal.person_in_charge || "—"}
                      </span>{" "}
                      • Event: {proposal.event_date}
                      {proposal.event_end_date
                        ? ` to ${proposal.event_end_date}`
                        : ""}{" "}
                      •{" "}
                      <strong className="font-semibold text-[#0F172A]">
                        {formatIdr(Number(proposal.total_budget))}
                      </strong>
                    </p>

                    {/* Direct Row Actions */}
                    <div className="flex shrink-0 items-center gap-2">
                      {canEdit ? (
                        <>
                          <Link
                            href={`/proposals/${proposal.id}`}
                            className="rounded-full border border-[#E2E8F0] bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                          >
                            View Details
                          </Link>
                          <Link
                            href={`/proposals/${proposal.id}/edit`}
                            className="inline-flex items-center gap-1 rounded-full bg-[#0F172A] px-4 py-1.5 text-xs font-semibold text-white shadow-2xs transition hover:bg-[#1E3A8A]"
                          >
                            <span>
                              {proposal.status === "needs_revision"
                                ? `Edit & Resubmit (v${proposal.current_version} → v${proposal.current_version + 1}) →`
                                : "Continue Draft →"}
                            </span>
                          </Link>
                        </>
                      ) : (
                        <Link
                          href={`/proposals/${proposal.id}`}
                          className="inline-flex items-center gap-1 rounded-full border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-1.5 text-xs font-semibold text-[#0F172A] transition hover:border-slate-300 hover:bg-white"
                        >
                          <span>View Details →</span>
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination Footer */}
        {totalCount > pageSize && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#E2E8F0] pt-4 text-xs text-slate-500">
            <span>
              Showing {from + 1}–{Math.min(to + 1, totalCount)} of {totalCount}{" "}
              proposals (Page {currentPage} of {totalPages})
            </span>

            <div className="flex items-center gap-2">
              {currentPage > 1 ? (
                <Link
                  href={buildProposalsHref({
                    status: activeTabKey,
                    q: safeQuery,
                    page: currentPage - 1,
                  })}
                  className="rounded-full border border-[#E2E8F0] bg-white px-3.5 py-1.5 font-semibold text-[#0F172A] hover:bg-slate-50"
                >
                  ← Previous
                </Link>
              ) : (
                <span className="rounded-full border border-slate-100 bg-slate-50 px-3.5 py-1.5 font-semibold text-slate-300">
                  ← Previous
                </span>
              )}

              {currentPage < totalPages ? (
                <Link
                  href={buildProposalsHref({
                    status: activeTabKey,
                    q: safeQuery,
                    page: currentPage + 1,
                  })}
                  className="rounded-full border border-[#E2E8F0] bg-white px-3.5 py-1.5 font-semibold text-[#0F172A] hover:bg-slate-50"
                >
                  Next →
                </Link>
              ) : (
                <span className="rounded-full border border-slate-100 bg-slate-50 px-3.5 py-1.5 font-semibold text-slate-300">
                  Next →
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ProposalsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-xs font-medium text-slate-500">
          Loading proposals directory...
        </div>
      }
    >
      <ProposalsListSection searchParamsPromise={searchParams} />
    </Suspense>
  );
}
