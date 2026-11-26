import React, { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthGuardError, requireRole } from "@/src/lib/auth/guard";
import { createClient } from "@/src/lib/supabase/server";
import type { ProposalStatusDb } from "@/src/lib/supabase/database.types";
import { ACTIVITY_CATEGORIES } from "@/src/lib/validations/proposal";

const ISO_DATE_CHECK = /^\d{4}-\d{2}-\d{2}$/;

const VALID_STATUSES: readonly ProposalStatusDb[] = [
  "draft",
  "pending_ttd",
  "needs_revision",
  "approved",
  "rejected",
];

function getStatusBadge(status: ProposalStatusDb) {
  switch (status) {
    case "approved":
      return {
        label: "Approved",
        classes: "border-emerald-200 bg-emerald-50 text-emerald-800",
      };
    case "needs_revision":
      return {
        label: "Revision Requested",
        classes: "border-amber-200 bg-amber-50 text-amber-800",
      };
    case "rejected":
      return {
        label: "Rejected",
        classes: "border-rose-200 bg-rose-50 text-rose-800",
      };
    case "draft":
      return {
        label: "Draft",
        classes: "border-slate-200 bg-slate-100 text-slate-700",
      };
    case "pending_ttd":
    default:
      return {
        label: "In Review (Pending TTD)",
        classes: "border-[#1E3A8A]/25 bg-[#1E3A8A]/10 text-[#1E3A8A]",
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

async function AdminPanelSection({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<{
    status?: string;
    category?: string;
    from?: string;
    to?: string;
    q?: string;
  }>;
}) {
  let profile;
  try {
    profile = await requireRole(["staff", "admin"]);
  } catch (err) {
    if (err instanceof AuthGuardError && err.code === "FORBIDDEN_ROLE") {
      redirect("/dashboard");
    }
    redirect("/login");
  }

  const params = await searchParamsPromise;
  const statusFilter = VALID_STATUSES.includes(params.status as ProposalStatusDb)
    ? (params.status as ProposalStatusDb)
    : "all";
  const categoryFilter = params.category?.trim() ?? "";
  const fromDate =
    params.from && ISO_DATE_CHECK.test(params.from) ? params.from : "";
  const toDate = params.to && ISO_DATE_CHECK.test(params.to) ? params.to : "";
  const rawSearch = params.q?.trim() ?? "";
  const safeSearch = rawSearch.replace(/[,%()]/g, "").slice(0, 100);

  const supabase = await createClient();

  let proposalsQuery = supabase
    .from("proposals")
    .select(
      "id, proposal_code, title, activity_type, organization_name, person_in_charge, event_date, venue, total_budget, status, current_version, updated_at"
    )
    .order("updated_at", { ascending: false })
    .limit(50);

  if (statusFilter !== "all") {
    proposalsQuery = proposalsQuery.eq("status", statusFilter);
  }
  if (categoryFilter) {
    proposalsQuery = proposalsQuery.eq("activity_type", categoryFilter);
  }
  if (fromDate) {
    proposalsQuery = proposalsQuery.gte("event_date", fromDate);
  }
  if (toDate) {
    proposalsQuery = proposalsQuery.lte("event_date", toDate);
  }
  if (safeSearch) {
    proposalsQuery = proposalsQuery.or(
      `title.ilike.%${safeSearch}%,proposal_code.ilike.%${safeSearch}%,organization_name.ilike.%${safeSearch}%,person_in_charge.ilike.%${safeSearch}%`
    );
  }

  const [
    { data: filteredProposals },
    { data: allScopedProposals },
    usersResult,
  ] = await Promise.all([
    proposalsQuery,
    supabase
      .from("proposals")
      .select("status, activity_type, total_budget"),
    profile.role === "admin"
      ? supabase
          .from("users")
          .select("id, email, full_name, organization_unit, role, created_at")
          .order("created_at", { ascending: false })
          .limit(30)
      : Promise.resolve({ data: null }),
  ]);

  const proposalsList = filteredProposals ?? [];
  const summaryRows = allScopedProposals ?? [];
  const userList = usersResult.data ?? [];

  const counts = {
    total: summaryRows.length,
    pending_ttd: summaryRows.filter((p) => p.status === "pending_ttd").length,
    needs_revision: summaryRows.filter((p) => p.status === "needs_revision")
      .length,
    approved: summaryRows.filter((p) => p.status === "approved").length,
    rejected: summaryRows.filter((p) => p.status === "rejected").length,
  };

  const totalApprovedBudget = summaryRows
    .filter((p) => p.status === "approved")
    .reduce((acc, p) => acc + Number(p.total_budget || 0), 0);

  const hasActiveFilters = Boolean(
    statusFilter !== "all" || categoryFilter || fromDate || toDate || safeSearch
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-[#1E3A8A]">
            Student Affairs &amp; Institutional Governance
          </span>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#0F172A]">
            {profile.role === "admin"
              ? "Admin Governance & Analytics Panel"
              : "Student Affairs Analytics & Proposal Explorer"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Search, filter, and audit campus proposals across statuses,
            categories, and event dates within your RLS authorization scope.
          </p>
        </div>

        {hasActiveFilters && (
          <Link
            href="/admin"
            className="rounded-full border border-[#E2E8F0] bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Reset All Filters
          </Link>
        )}
      </div>

      {/* Summary Analytics Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-2xs">
          <span className="text-xs font-semibold text-slate-500">
            Scoped Proposals
          </span>
          <p className="mt-2 text-3xl font-bold text-[#0F172A]">
            {counts.total}
          </p>
        </div>
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-2xs">
          <span className="text-xs font-semibold text-slate-500">
            In Review (TTD)
          </span>
          <p className="mt-2 text-3xl font-bold text-[#1E3A8A]">
            {counts.pending_ttd}
          </p>
        </div>
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-2xs">
          <span className="text-xs font-semibold text-slate-500">
            Needs Revision
          </span>
          <p className="mt-2 text-3xl font-bold text-amber-600">
            {counts.needs_revision}
          </p>
        </div>
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-2xs">
          <span className="text-xs font-semibold text-slate-500">
            Approved ({counts.approved})
          </span>
          <p className="mt-2 truncate text-lg font-bold text-emerald-700">
            {formatIdr(totalApprovedBudget)}
          </p>
        </div>
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-2xs">
          <span className="text-xs font-semibold text-slate-500">Rejected</span>
          <p className="mt-2 text-3xl font-bold text-rose-700">
            {counts.rejected}
          </p>
        </div>
      </div>

      {/* Multi-Dimensional Proposal Explorer */}
      <section className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-2xs">
        <h2 className="text-base font-bold text-[#0F172A]">
          Proposal Governance Explorer ({proposalsList.length})
        </h2>

        <form
          method="GET"
          action="/admin"
          className="mt-4 grid grid-cols-1 gap-3 border-b border-[#E2E8F0] pb-5 sm:grid-cols-2 lg:grid-cols-12"
        >
          <div className="lg:col-span-3">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Search
            </label>
            <input
              type="search"
              name="q"
              defaultValue={rawSearch}
              placeholder="Code, title, org, or PIC..."
              className="mt-1 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-xs text-[#0F172A] focus:border-[#1E3A8A] focus:bg-white focus:outline-none"
            />
          </div>

          <div className="lg:col-span-2">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Status
            </label>
            <select
              name="status"
              defaultValue={statusFilter}
              className="mt-1 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-xs font-medium text-[#0F172A] focus:border-[#1E3A8A] focus:bg-white focus:outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="pending_ttd">In Review (Pending TTD)</option>
              <option value="needs_revision">Revision Requested</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="draft">Draft</option>
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
              Apply
            </button>
          </div>
        </form>

        {proposalsList.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-[#E2E8F0] bg-[#F8FAFC] p-8 text-center text-xs text-slate-500">
            No proposals matched the selected governance filters.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E2E8F0] text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="pb-3 pr-4">Code &amp; Title</th>
                  <th className="pb-3 pr-4">Organization &amp; Category</th>
                  <th className="pb-3 pr-4">Event Date</th>
                  <th className="pb-3 pr-4">Budget</th>
                  <th className="pb-3 pr-4">Status</th>
                  <th className="pb-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {proposalsList.map((prop) => {
                  const badge = getStatusBadge(prop.status);
                  return (
                    <tr key={prop.id}>
                      <td className="py-3.5 pr-4">
                        <span className="font-mono text-[11px] text-slate-500">
                          {prop.proposal_code} • v{prop.current_version}.0
                        </span>
                        <p className="mt-0.5 font-bold text-[#0F172A]">
                          {prop.title || "Untitled Proposal"}
                        </p>
                      </td>
                      <td className="py-3.5 pr-4">
                        <p className="font-semibold text-slate-700">
                          {prop.organization_name || "—"}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {prop.activity_type || "Uncategorized"}
                        </p>
                      </td>
                      <td className="py-3.5 pr-4 font-mono text-slate-600">
                        {prop.event_date}
                      </td>
                      <td className="py-3.5 pr-4 font-mono font-semibold text-[#0F172A]">
                        {formatIdr(Number(prop.total_budget))}
                      </td>
                      <td className="py-3.5 pr-4">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${badge.classes}`}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="py-3.5 text-right">
                        <Link
                          href={`/proposals/${prop.id}`}
                          className="font-semibold text-[#1E3A8A] hover:underline"
                        >
                          Inspect / Print →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Campus Accounts Directory (Admin Role Only) */}
      {profile.role === "admin" && (
        <section className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-2xs">
          <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3.5">
            <div>
              <h2 className="text-base font-bold text-[#0F172A]">
                Verified Campus Accounts Directory ({userList.length})
              </h2>
              <p className="text-xs text-slate-500">
                Whitelisted @student.president.ac.id &amp; @president.ac.id
                profiles
              </p>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E2E8F0] text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="pb-3 pr-4">Full Name</th>
                  <th className="pb-3 pr-4">Email</th>
                  <th className="pb-3 pr-4">Organization Unit</th>
                  <th className="pb-3">Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {userList.map((u) => (
                  <tr key={u.id}>
                    <td className="py-3 pr-4 font-semibold text-[#0F172A]">
                      {u.full_name}
                    </td>
                    <td className="py-3 pr-4 font-mono text-slate-600">
                      {u.email}
                    </td>
                    <td className="py-3 pr-4 text-slate-600">
                      {u.organization_unit ?? "—"}
                    </td>
                    <td className="py-3">
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-semibold text-slate-800">
                        {u.role}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

export default function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
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
          Loading governance &amp; analytics console...
        </div>
      }
    >
      <AdminPanelSection searchParamsPromise={searchParams} />
    </Suspense>
  );
}
