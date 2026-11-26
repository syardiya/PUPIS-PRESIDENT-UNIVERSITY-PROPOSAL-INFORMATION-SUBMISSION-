import React, { Suspense } from "react";
import Link from "next/link";
import { requireAuth } from "@/src/lib/auth/guard";
import { createClient } from "@/src/lib/supabase/server";
import { ACTIVITY_CATEGORIES } from "@/src/lib/validations/proposal";

const ISO_DATE_CHECK = /^\d{4}-\d{2}-\d{2}$/;

function formatIdr(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}

async function ArchiveSection({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<{
    decision?: string;
    category?: string;
    from?: string;
    to?: string;
    q?: string;
  }>;
}) {
  await requireAuth();
  const params = await searchParamsPromise;

  const decisionFilter =
    params.decision === "approved" || params.decision === "rejected"
      ? params.decision
      : "all";
  const categoryFilter = params.category?.trim() ?? "";
  const fromDate =
    params.from && ISO_DATE_CHECK.test(params.from) ? params.from : "";
  const toDate = params.to && ISO_DATE_CHECK.test(params.to) ? params.to : "";
  const rawSearch = params.q?.trim() ?? "";
  const safeSearch = rawSearch.replace(/[,%()]/g, "").slice(0, 100);

  const supabase = await createClient();

  let query = supabase
    .from("proposals")
    .select(
      "id, proposal_code, title, activity_type, organization_name, person_in_charge, event_date, venue, total_budget, status, current_version, updated_at"
    )
    .order("updated_at", { ascending: false });

  if (decisionFilter === "approved" || decisionFilter === "rejected") {
    query = query.eq("status", decisionFilter);
  } else {
    query = query.in("status", ["approved", "rejected"]);
  }

  if (categoryFilter) {
    query = query.eq("activity_type", categoryFilter);
  }
  if (fromDate) {
    query = query.gte("event_date", fromDate);
  }
  if (toDate) {
    query = query.lte("event_date", toDate);
  }
  if (safeSearch) {
    query = query.or(
      `title.ilike.%${safeSearch}%,proposal_code.ilike.%${safeSearch}%,organization_name.ilike.%${safeSearch}%`
    );
  }

  const [{ data: filteredProposals }, { data: allDecidedSummary }] =
    await Promise.all([
      query,
      supabase
        .from("proposals")
        .select("status, total_budget")
        .in("status", ["approved", "rejected"]),
    ]);

  const list = filteredProposals ?? [];
  const summaryRows = allDecidedSummary ?? [];
  const totalDecided = summaryRows.length;
  const approvedRows = summaryRows.filter((r) => r.status === "approved");
  const rejectedCount = summaryRows.filter((r) => r.status === "rejected").length;
  const approvedBudgetSum = approvedRows.reduce(
    (acc, r) => acc + Number(r.total_budget || 0),
    0
  );
  const approvalRate =
    totalDecided > 0 ? Math.round((approvedRows.length / totalDecided) * 100) : 0;

  const hasActiveFilters = Boolean(
    decisionFilter !== "all" || categoryFilter || fromDate || toDate || safeSearch
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-[#1E3A8A]">
            Completed Institutional Records
          </span>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#0F172A]">
            Proposal Archive &amp; Analytics
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Search and audit finalized campus proposals with preserved digital
            TTD verification records.
          </p>
        </div>

        {hasActiveFilters && (
          <Link
            href="/archive"
            className="rounded-full border border-[#E2E8F0] bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Reset Filters
          </Link>
        )}
      </div>

      {/* Analytics KPI Strip */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-2xs">
          <span className="text-xs font-semibold text-slate-500">
            Total Decided Proposals
          </span>
          <p className="mt-2 text-3xl font-bold text-[#0F172A]">
            {totalDecided}
          </p>
        </div>

        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-2xs">
          <span className="text-xs font-semibold text-slate-500">
            Approved ({approvedRows.length})
          </span>
          <p className="mt-2 truncate text-xl font-bold text-emerald-700 sm:text-2xl">
            {formatIdr(approvedBudgetSum)}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400">
            Cumulative approved budget
          </p>
        </div>

        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-2xs">
          <span className="text-xs font-semibold text-slate-500">
            Rejected Proposals
          </span>
          <p className="mt-2 text-3xl font-bold text-rose-700">
            {rejectedCount}
          </p>
        </div>

        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-2xs">
          <span className="text-xs font-semibold text-slate-500">
            Approval Rate
          </span>
          <p className="mt-2 text-3xl font-bold text-[#1E3A8A]">
            {approvalRate}%
          </p>
        </div>
      </div>

      {/* Multi-Filter Search Bar */}
      <div className="mt-6 rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-2xs">
        <form
          method="GET"
          action="/archive"
          className="grid grid-cols-1 gap-3 border-b border-[#E2E8F0] pb-5 sm:grid-cols-2 lg:grid-cols-12"
        >
          <div className="lg:col-span-3">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Keyword Search
            </label>
            <input
              type="search"
              name="q"
              defaultValue={rawSearch}
              placeholder="Title, code, or organization..."
              className="mt-1 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-xs text-[#0F172A] focus:border-[#1E3A8A] focus:bg-white focus:outline-none"
            />
          </div>

          <div className="lg:col-span-2">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Decision
            </label>
            <select
              name="decision"
              defaultValue={decisionFilter}
              className="mt-1 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-xs font-medium text-[#0F172A] focus:border-[#1E3A8A] focus:bg-white focus:outline-none"
            >
              <option value="all">All Decided</option>
              <option value="approved">Approved Only</option>
              <option value="rejected">Rejected Only</option>
            </select>
          </div>

          <div className="lg:col-span-3">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Activity Category
            </label>
            <select
              name="category"
              defaultValue={categoryFilter}
              className="mt-1 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-xs font-medium text-[#0F172A] focus:border-[#1E3A8A] focus:bg-white focus:outline-none"
            >
              <option value="">All Categories</option>
              {ACTIVITY_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-2">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Event From
            </label>
            <input
              type="date"
              name="from"
              defaultValue={fromDate}
              className="mt-1 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 py-2 text-xs text-[#0F172A] focus:border-[#1E3A8A] focus:bg-white focus:outline-none"
            />
          </div>

          <div className="lg:col-span-2 flex items-end gap-2">
            <div className="flex-1">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Event To
              </label>
              <input
                type="date"
                name="to"
                defaultValue={toDate}
                className="mt-1 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 py-2 text-xs text-[#0F172A] focus:border-[#1E3A8A] focus:bg-white focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="rounded-xl bg-[#0F172A] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#1E3A8A] cursor-pointer"
            >
              Filter
            </button>
          </div>
        </form>

        {/* Archived Proposal List */}
        {list.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-[#E2E8F0] bg-[#F8FAFC] p-10 text-center">
            <p className="text-sm font-bold text-[#0F172A]">
              No archived proposals match your filter
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Once proposals reach a final Approved or Rejected decision, they
              appear here automatically.
            </p>
          </div>
        ) : (
          <div className="mt-2 divide-y divide-slate-100">
            {list.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-4 py-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-slate-500">
                      {item.proposal_code}
                    </span>
                    <span className="rounded-full bg-[#0F172A] px-2 py-0.5 text-[10px] font-bold text-white">
                      v{item.current_version}.0
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                        item.status === "approved"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : "border-rose-200 bg-rose-50 text-rose-800"
                      }`}
                    >
                      {item.status === "approved" ? "Approved" : "Rejected"}
                    </span>
                    {item.activity_type && (
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-medium text-slate-600">
                        {item.activity_type}
                      </span>
                    )}
                  </div>

                  <h2 className="mt-1.5 truncate text-sm font-bold text-[#0F172A]">
                    {item.title}
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {item.organization_name} • PIC: {item.person_in_charge} •
                    Event: {item.event_date} ({item.venue}) •{" "}
                    <strong className="text-[#0F172A]">
                      {formatIdr(Number(item.total_budget))}
                    </strong>
                  </p>
                </div>

                <Link
                  href={`/proposals/${item.id}`}
                  className="shrink-0 rounded-full border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-1.5 text-xs font-semibold text-[#0F172A] transition hover:border-slate-300 hover:bg-white"
                >
                  Inspect &amp; Print Sheet →
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ArchivePage({
  searchParams,
}: {
  searchParams: Promise<{
    decision?: string;
    category?: string;
    from?: string;
    to?: string;
    q?: string;
  }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-xs font-medium text-slate-500">
          Loading proposal archive...
        </div>
      }
    >
      <ArchiveSection searchParamsPromise={searchParams} />
    </Suspense>
  );
}
