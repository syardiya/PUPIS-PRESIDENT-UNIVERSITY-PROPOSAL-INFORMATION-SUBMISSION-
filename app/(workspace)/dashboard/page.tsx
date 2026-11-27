import React, { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { requireAuth, isApproverOrAdminRole } from "@/src/lib/auth/guard";
import { createClient } from "@/src/lib/supabase/server";
import type { ProposalStatusDb } from "@/src/lib/supabase/database.types";

function getStatusBadge(status: ProposalStatusDb) {
  switch (status) {
    case "approved":
      return {
        label: "Approved",
        classes: "bg-emerald-50 text-emerald-800 border-emerald-200",
      };
    case "needs_revision":
      return {
        label: "Revision Requested",
        classes: "bg-amber-50 text-amber-800 border-amber-200",
      };
    case "rejected":
      return {
        label: "Rejected",
        classes: "bg-rose-50 text-rose-800 border-rose-200",
      };
    case "draft":
      return {
        label: "Draft",
        classes: "bg-slate-100 text-slate-700 border-slate-200",
      };
    case "pending_ttd":
    default:
      return {
        label: "In Review (Pending TTD)",
        classes: "bg-[#1E3A8A]/10 text-[#1E3A8A] border-[#1E3A8A]/25",
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

async function DashboardDataSection() {
  await connection();
  const profile = await requireAuth();
  const supabase = await createClient();

  const [{ data: allVisibleProposals }, { data: notifications }] =
    await Promise.all([
      supabase
        .from("proposals")
        .select(
          "id, proposal_code, title, activity_type, organization_name, event_date, total_budget, status, current_version, updated_at"
        )
        .order("updated_at", { ascending: false }),
      supabase
        .from("notifications")
        .select("id, proposal_id, title, message, is_read, created_at")
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(6),
    ]);

  const allProposals = allVisibleProposals ?? [];
  const recentList = allProposals.slice(0, 8);

  const pendingCount = allProposals.filter(
    (p) => p.status === "pending_ttd"
  ).length;
  const revisionCount = allProposals.filter(
    (p) => p.status === "needs_revision"
  ).length;
  const approvedProposals = allProposals.filter((p) => p.status === "approved");
  const approvedBudgetTotal = approvedProposals.reduce(
    (sum, p) => sum + Number(p.total_budget || 0),
    0
  );

  // Category analytics summary for Student Affairs / Admins
  const categoryStatsMap = new Map<
    string,
    { count: number; totalBudget: number }
  >();
  for (const prop of allProposals) {
    if (prop.status === "draft") continue;
    const key = prop.activity_type || "Uncategorized";
    const prev = categoryStatsMap.get(key) ?? { count: 0, totalBudget: 0 };
    categoryStatsMap.set(key, {
      count: prev.count + 1,
      totalBudget: prev.totalBudget + Number(prop.total_budget || 0),
    });
  }
  const categoryBreakdown = Array.from(categoryStatsMap.entries())
    .map(([category, meta]) => ({ category, ...meta }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Greeting & Quick Actions */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-[#1E3A8A]">
            Campus Governance Overview
          </span>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#0F172A]">
            Welcome back, {profile.full_name}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Monitor proposal activity, sequential digital TTD progress, budget
            allocations, and campus notifications.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {!profile.signature_storage_path && (
            <Link
              href="/profile"
              className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-900 transition hover:bg-amber-100"
            >
              <span>Configure Digital Signature (TTD) →</span>
            </Link>
          )}

          {isApproverOrAdminRole(profile.role) && (
            <>
              <Link
                href="/admin"
                className="inline-flex items-center gap-2 rounded-full border border-[#E2E8F0] bg-white px-4 py-2 text-xs font-semibold text-[#0F172A] shadow-2xs transition hover:bg-slate-50"
              >
                <span>Analytics &amp; Explorer</span>
              </Link>
              <Link
                href="/approvals"
                className="inline-flex items-center gap-2 rounded-full bg-[#0F172A] px-5 py-2 text-xs font-semibold text-white transition hover:bg-[#1E3A8A]"
              >
                <span>Open Approval Queue</span>
              </Link>
            </>
          )}
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-2xs">
          <span className="text-xs font-semibold text-slate-500">
            Visible Proposals
          </span>
          <p className="mt-2 text-3xl font-bold text-[#0F172A]">
            {allProposals.length}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            Scoped by PostgreSQL RLS
          </p>
        </div>

        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-2xs">
          <span className="text-xs font-semibold text-slate-500">
            In Review (Pending TTD)
          </span>
          <p className="mt-2 text-3xl font-bold text-[#1E3A8A]">
            {pendingCount}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            Active sequential routing
          </p>
        </div>

        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-2xs">
          <span className="text-xs font-semibold text-slate-500">
            Revision Requested
          </span>
          <p className="mt-2 text-3xl font-bold text-amber-600">
            {revisionCount}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            Awaiting submitter update
          </p>
        </div>

        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-2xs">
          <span className="text-xs font-semibold text-slate-500">
            Approved ({approvedProposals.length})
          </span>
          <p className="mt-2 truncate text-xl font-bold text-emerald-700 sm:text-2xl">
            {formatIdr(approvedBudgetTotal)}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            Total approved budget
          </p>
        </div>
      </div>

      {/* Category Breakdown Strip for Staff & Admins */}
      {isApproverOrAdminRole(profile.role) && categoryBreakdown.length > 0 && (
        <section className="mt-6 rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] pb-3.5">
            <div>
              <h2 className="text-sm font-bold text-[#0F172A]">
                Submitted Proposals by Activity Category
              </h2>
              <p className="text-xs text-slate-500">
                Volume and requested budget across campus activity types
              </p>
            </div>
            <Link
              href="/archive"
              className="text-xs font-semibold text-[#1E3A8A] hover:underline"
            >
              Open Decided Archive →
            </Link>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {categoryBreakdown.map((item) => (
              <div
                key={item.category}
                className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3.5"
              >
                <p className="truncate text-xs font-bold text-[#0F172A]">
                  {item.category}
                </p>
                <p className="mt-1 text-lg font-bold text-[#1E3A8A]">
                  {item.count}{" "}
                  <span className="text-xs font-normal text-slate-500">
                    proposal(s)
                  </span>
                </p>
                <p className="mt-0.5 font-mono text-[11px] text-slate-600">
                  {formatIdr(item.totalBudget)}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Two-Column Recent Proposals & Notifications */}
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="lg:col-span-8 rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-2xs">
          <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-4">
            <div>
              <h2 className="text-base font-bold text-[#0F172A]">
                Recent Proposals
              </h2>
              <p className="text-xs text-slate-500">
                Click any proposal to inspect details, TTD chain, or printable
                approval sheet
              </p>
            </div>
            <Link
              href="/proposals"
              className="text-xs font-semibold text-[#1E3A8A] hover:underline"
            >
              View All →
            </Link>
          </div>

          {recentList.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-[#E2E8F0] bg-[#F8FAFC] p-8 text-center">
              <p className="text-sm font-bold text-[#0F172A]">
                No proposals available yet
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Proposals where you are the Submitter, Approver (TTD), or CC
                Stakeholder will appear here automatically.
              </p>
              {(profile.role === "student" || profile.role === "admin") && (
                <Link
                  href="/proposals/new"
                  className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#0F172A] px-5 py-2 text-xs font-semibold text-white transition hover:bg-[#1E3A8A]"
                >
                  <span>Create Your First Proposal</span>
                </Link>
              )}
            </div>
          ) : (
            <div className="mt-3 divide-y divide-slate-100">
              {recentList.map((item) => {
                const badge = getStatusBadge(item.status);
                return (
                  <Link
                    key={item.id}
                    href={`/proposals/${item.id}`}
                    className="flex flex-wrap items-center justify-between gap-4 rounded-xl px-2 py-3.5 transition hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-slate-500">
                          {item.proposal_code}
                        </span>
                        <span className="rounded-full bg-[#0F172A] px-2 py-0.5 text-[10px] font-bold text-white">
                          v{item.current_version}.0
                        </span>
                        {item.activity_type && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                            {item.activity_type}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 truncate text-sm font-bold text-[#0F172A]">
                        {item.title || "Untitled Proposal Draft"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {item.organization_name || "Unspecified Unit"} • Event:{" "}
                        {item.event_date} •{" "}
                        {formatIdr(Number(item.total_budget))}
                      </p>
                    </div>

                    <span
                      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${badge.classes}`}
                    >
                      {badge.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <section
          id="notifications"
          className="lg:col-span-4 rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-2xs"
        >
          <div className="border-b border-[#E2E8F0] pb-4">
            <h2 className="text-base font-bold text-[#0F172A]">
              Recent Notifications
            </h2>
            <p className="text-xs text-slate-500">
              Direct links to active proposal events
            </p>
          </div>

          {!notifications || notifications.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-[#E2E8F0] bg-[#F8FAFC] p-6 text-center text-xs text-slate-500">
              You have no notifications yet.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {notifications.map((note) => {
                const cardBody = (
                  <div
                    className={`rounded-xl border p-3.5 transition ${
                      note.is_read
                        ? "border-[#E2E8F0] bg-[#F8FAFC] hover:bg-slate-100/70"
                        : "border-[#1E3A8A]/30 bg-[#1E3A8A]/[0.04] hover:bg-[#1E3A8A]/[0.08]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-[#0F172A]">
                        {note.title}
                      </p>
                      {!note.is_read && (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-[#1E3A8A]" />
                      )}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">
                      {note.message}
                    </p>
                    {note.proposal_id && (
                      <span className="mt-1.5 inline-block text-[11px] font-semibold text-[#1E3A8A]">
                        Open Proposal →
                      </span>
                    )}
                  </div>
                );

                return note.proposal_id ? (
                  <Link
                    key={note.id}
                    href={`/proposals/${note.proposal_id}`}
                    className="block"
                  >
                    {cardBody}
                  </Link>
                ) : (
                  <div key={note.id}>{cardBody}</div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-xs font-medium text-slate-500">
          Loading dashboard...
        </div>
      }
    >
      <DashboardDataSection />
    </Suspense>
  );
}
