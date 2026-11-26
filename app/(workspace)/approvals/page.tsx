import React, { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthGuardError, requireRole } from "@/src/lib/auth/guard";
import { createClient } from "@/src/lib/supabase/server";

async function ApprovalQueueSection() {
  let profile;
  try {
    profile = await requireRole(["staff", "admin"]);
  } catch (err) {
    if (err instanceof AuthGuardError && err.code === "FORBIDDEN_ROLE") {
      redirect("/dashboard");
    }
    redirect("/login");
  }

  const supabase = await createClient();

  const signersQuery = supabase
    .from("proposal_signers")
    .select(
      "id, proposal_id, step_order, status, proposals(id, proposal_code, title, organization_name, event_date, total_budget, status, current_version)"
    )
    .eq("status", "pending")
    .order("step_order", { ascending: true });

  const { data: queueItems } =
    profile.role === "admin"
      ? await signersQuery
      : await signersQuery.eq("approver_id", profile.id);

  const items = queueItems ?? [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-[#1E3A8A]">
            Sequential Digital TTD
          </span>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#0F172A]">
            Approval Queue
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Proposals awaiting your official digital signature (TTD) or revision
            review.
          </p>
        </div>

        <Link
          href="/profile"
          className="inline-flex items-center gap-2 rounded-full border border-[#E2E8F0] bg-white px-4 py-2 text-xs font-semibold text-[#0F172A] shadow-2xs transition hover:bg-slate-50"
        >
          <span>
            {profile.signature_storage_path
              ? "✓ Active Signature Configured"
              : "Configure Signature (TTD) →"}
          </span>
        </Link>
      </div>

      <div className="mt-6 rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-2xs">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#E2E8F0] bg-[#F8FAFC] p-10 text-center">
            <p className="text-sm font-bold text-[#0F172A]">
              Your approval queue is clear
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Pending proposals routed to {profile.email} will appear here when
              their sequential TTD step becomes active.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {items.map((item) => {
              const prop = Array.isArray(item.proposals)
                ? item.proposals[0]
                : item.proposals;
              if (!prop) return null;

              return (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-4 py-4"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-slate-500">
                        {prop.proposal_code}
                      </span>
                      <span className="rounded-full bg-[#0F172A] px-2 py-0.5 text-[10px] font-bold text-white">
                        Step {item.step_order} • v{prop.current_version}.0
                      </span>
                    </div>
                    <h2 className="mt-1 text-sm font-bold text-[#0F172A]">
                      {prop.title}
                    </h2>
                    <p className="text-xs text-slate-500">
                      {prop.organization_name} • Event Date: {prop.event_date}
                    </p>
                  </div>

                  <span className="rounded-full border border-[#1E3A8A]/25 bg-[#1E3A8A]/10 px-3 py-1 text-xs font-semibold text-[#1E3A8A]">
                    Awaiting Step {item.step_order} TTD
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

export default function ApprovalsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-xs font-medium text-slate-500">
          Loading approval queue...
        </div>
      }
    >
      <ApprovalQueueSection />
    </Suspense>
  );
}
