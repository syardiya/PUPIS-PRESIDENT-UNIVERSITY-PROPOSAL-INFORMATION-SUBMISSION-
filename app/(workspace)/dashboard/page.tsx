import React, { Suspense } from "react";
import Link from "next/link";
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
        label: "Needs Revision",
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
        label: "Pending TTD",
        classes: "bg-[#1E3A8A]/10 text-[#1E3A8A] border-[#1E3A8A]/25",
      };
  }
}

function formatIdr(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

async function DashboardDataSection() {
  const profile = await requireAuth();
  const supabase = await createClient();

  const [{ data: proposals }, { data: notifications }] = await Promise.all([
    supabase
      .from("proposals")
      .select(
        "id, proposal_code, title, organization_name, event_date, total_budget, status, current_version, updated_at"
      )
      .order("updated_at", { ascending: false })
      .limit(10),
    supabase
      .from("notifications")
      .select("id, title, message, is_read, created_at")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const list = proposals ?? [];
  const pendingCount = list.filter((p) => p.status === "pending_ttd").length;
  const revisionCount = list.filter((p) => p.status === "needs_revision").length;
  const approvedCount = list.filter((p) => p.status === "approved").length;

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
            Monitor active proposal submissions, sequential digital TTD
            progress, and campus notifications.
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
            <Link
              href="/approvals"
              className="inline-flex items-center gap-2 rounded-full bg-[#0F172A] px-5 py-2 text-xs font-semibold text-white transition hover:bg-[#1E3A8A]"
            >
              <span>Open Approval Queue</span>
            </Link>
          )}
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-2xs">
          <span className="text-xs font-semibold text-slate-500">
            Visible Proposals
          </span>
          <p className="mt-2 text-3xl font-bold text-[#0F172A]">{list.length}</p>
        </div>

        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-2xs">
          <span className="text-xs font-semibold text-slate-500">
            Pending Digital TTD
          </span>
          <p className="mt-2 text-3xl font-bold text-[#1E3A8A]">
            {pendingCount}
          </p>
        </div>

        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-2xs">
          <span className="text-xs font-semibold text-slate-500">
            Needs Revision
          </span>
          <p className="mt-2 text-3xl font-bold text-amber-600">
            {revisionCount}
          </p>
        </div>

        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-2xs">
          <span className="text-xs font-semibold text-slate-500">
            Approved Proposals
          </span>
          <p className="mt-2 text-3xl font-bold text-emerald-700">
            {approvedCount}
          </p>
        </div>
      </div>

      {/* Two-Column Recent Proposals & Notifications */}
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="lg:col-span-8 rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-2xs">
          <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-4">
            <div>
              <h2 className="text-base font-bold text-[#0F172A]">
                Recent Proposals
              </h2>
              <p className="text-xs text-slate-500">
                Scoped automatically by PostgreSQL Row-Level Security
              </p>
            </div>
            <Link
              href="/proposals"
              className="text-xs font-semibold text-[#1E3A8A] hover:underline"
            >
              View All →
            </Link>
          </div>

          {list.length === 0 ? (
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
            <div className="mt-4 divide-y divide-slate-100">
              {list.map((item) => {
                const badge = getStatusBadge(item.status);
                return (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-4 py-3.5"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-slate-500">
                          {item.proposal_code}
                        </span>
                        <span className="rounded-full bg-[#0F172A] px-2 py-0.5 text-[10px] font-bold text-white">
                          v{item.current_version}.0
                        </span>
                      </div>
                      <p className="mt-1 truncate text-sm font-bold text-[#0F172A]">
                        {item.title}
                      </p>
                      <p className="text-xs text-slate-500">
                        {item.organization_name} • Event: {item.event_date} •{" "}
                        {formatIdr(Number(item.total_budget))}
                      </p>
                    </div>

                    <span
                      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${badge.classes}`}
                    >
                      {badge.label}
                    </span>
                  </div>
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
              Workflow updates for your campus account
            </p>
          </div>

          {!notifications || notifications.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-[#E2E8F0] bg-[#F8FAFC] p-6 text-center text-xs text-slate-500">
              You have no notifications yet.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {notifications.map((note) => (
                <div
                  key={note.id}
                  className={`rounded-xl border p-3.5 ${
                    note.is_read
                      ? "border-[#E2E8F0] bg-[#F8FAFC]"
                      : "border-[#1E3A8A]/30 bg-[#1E3A8A]/[0.04]"
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
                </div>
              ))}
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
