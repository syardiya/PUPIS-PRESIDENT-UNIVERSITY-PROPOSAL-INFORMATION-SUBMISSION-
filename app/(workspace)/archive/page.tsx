import React, { Suspense } from "react";
import { requireAuth } from "@/src/lib/auth/guard";
import { createClient } from "@/src/lib/supabase/server";

async function ArchiveSection() {
  await requireAuth();
  const supabase = await createClient();

  const { data: archivedProposals } = await supabase
    .from("proposals")
    .select(
      "id, proposal_code, title, organization_name, event_date, total_budget, status, current_version, updated_at"
    )
    .in("status", ["approved", "rejected"])
    .order("updated_at", { ascending: false });

  const list = archivedProposals ?? [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <span className="text-xs font-bold uppercase tracking-wider text-[#1E3A8A]">
          Completed Records
        </span>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#0F172A]">
          Proposal Archive
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Immutable repository of approved and rejected campus proposals with
          preserved TTD audit trails.
        </p>
      </div>

      <div className="mt-6 rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-2xs">
        {list.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#E2E8F0] bg-[#F8FAFC] p-10 text-center">
            <p className="text-sm font-bold text-[#0F172A]">
              No archived proposals yet
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Once proposals reach a final Approved or Rejected decision, they
              are archived here automatically.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {list.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-4 py-4"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-slate-500">
                      {item.proposal_code}
                    </span>
                    <span className="rounded-full bg-[#0F172A] px-2 py-0.5 text-[10px] font-bold text-white">
                      v{item.current_version}.0
                    </span>
                  </div>
                  <h2 className="mt-1 text-sm font-bold text-[#0F172A]">
                    {item.title}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {item.organization_name} • Event Date: {item.event_date}
                  </p>
                </div>

                <span
                  className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${
                    item.status === "approved"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-rose-200 bg-rose-50 text-rose-800"
                  }`}
                >
                  {item.status === "approved" ? "Approved" : "Rejected"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ArchivePage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-xs font-medium text-slate-500">
          Loading archive...
        </div>
      }
    >
      <ArchiveSection />
    </Suspense>
  );
}
