import React, { Suspense } from "react";
import Link from "next/link";
import { requireAuth } from "@/src/lib/auth/guard";
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

async function ProposalsListSection() {
  const profile = await requireAuth();
  const supabase = await createClient();

  const { data: proposals } = await supabase
    .from("proposals")
    .select(
      "id, proposal_code, title, organization_name, person_in_charge, event_date, venue, total_budget, status, current_version, updated_at"
    )
    .in("status", ["draft", "pending_ttd", "needs_revision"])
    .order("updated_at", { ascending: false });

  const list = proposals ?? [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-[#1E3A8A]">
            Active Submissions
          </span>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#0F172A]">
            Proposals
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Drafts, active TTD sign-off chains, and proposals awaiting revision.
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

      <div className="mt-6 rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-2xs">
        {list.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#E2E8F0] bg-[#F8FAFC] p-10 text-center">
            <p className="text-sm font-bold text-[#0F172A]">
              No active proposals in progress
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Completed or rejected proposals can be inspected in the Archive.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {list.map((proposal) => {
              const badge = getStatusBadge(proposal.status);
              return (
                <div
                  key={proposal.id}
                  className="flex flex-wrap items-center justify-between gap-4 py-4"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-slate-500">
                        {proposal.proposal_code}
                      </span>
                      <span className="rounded-full bg-[#0F172A] px-2 py-0.5 text-[10px] font-bold text-white">
                        v{proposal.current_version}.0
                      </span>
                    </div>
                    <h2 className="mt-1 text-sm font-bold text-[#0F172A]">
                      {proposal.title}
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {proposal.organization_name} • PIC:{" "}
                      {proposal.person_in_charge} • {proposal.venue} (
                      {proposal.event_date})
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
      </div>
    </div>
  );
}

export default function ProposalsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-xs font-medium text-slate-500">
          Loading proposals...
        </div>
      }
    >
      <ProposalsListSection />
    </Suspense>
  );
}
