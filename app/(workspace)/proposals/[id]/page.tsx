import React, { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/src/lib/auth/guard";
import { createClient } from "@/src/lib/supabase/server";
import type { ProposalStatusDb } from "@/src/lib/supabase/database.types";
import { uuidSchema } from "@/src/lib/validations/proposal";
import { fetchHydratedProposalDetail } from "@/src/lib/proposals/server-helpers";

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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function ProposalDetailSection({
  paramsPromise,
  searchParamsPromise,
}: {
  paramsPromise: Promise<{ id: string }>;
  searchParamsPromise: Promise<{ submitted?: string }>;
}) {
  const profile = await requireAuth();
  const [{ id }, query] = await Promise.all([
    paramsPromise,
    searchParamsPromise,
  ]);

  const parsedId = uuidSchema.safeParse(id);
  if (!parsedId.success) {
    notFound();
  }

  const supabase = await createClient();
  const detail = await fetchHydratedProposalDetail(supabase, parsedId.data);

  if (!detail) {
    notFound();
  }

  const isAuthorizedViewer =
    profile.role === "admin" ||
    detail.submitter_id === profile.id ||
    detail.signers.some((s) => s.approver_id === profile.id) ||
    detail.cc_users.some((c) => c.stakeholder_id === profile.id);

  if (!isAuthorizedViewer) {
    notFound();
  }

  const badge = getStatusBadge(detail.status);
  const canEdit =
    (detail.status === "draft" || detail.status === "needs_revision") &&
    (detail.submitter_id === profile.id || profile.role === "admin");

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      {query.submitted === "1" && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-xs font-semibold text-emerald-900">
          Proposal <span className="font-mono">{detail.proposal_code}</span> (v
          {detail.current_version}.0) has been locked and routed to your
          sequential TTD approvers.
        </div>
      )}

      {/* Top Header Card */}
      <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-2xs">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#E2E8F0] pb-5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-bold text-slate-500">
                {detail.proposal_code}
              </span>
              <span className="rounded-full bg-[#0F172A] px-2.5 py-0.5 text-xs font-bold text-white">
                v{detail.current_version}.0
              </span>
              <span
                className={`inline-flex items-center rounded-full border px-3 py-0.5 text-xs font-semibold ${badge.classes}`}
              >
                {badge.label}
              </span>
              {detail.activity_type && (
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                  {detail.activity_type}
                </span>
              )}
            </div>

            <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#0F172A]">
              {detail.title || "Untitled Proposal Draft"}
            </h1>
            <p className="mt-1 text-xs font-semibold text-[#1E3A8A]">
              {detail.organization_name || "Unspecified Organization"} • PIC:{" "}
              {detail.person_in_charge || "—"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              href="/proposals"
              className="rounded-full border border-[#E2E8F0] bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              ← All Proposals
            </Link>
            {canEdit && (
              <Link
                href={`/proposals/${detail.id}/edit`}
                className="rounded-full bg-[#0F172A] px-5 py-2 text-xs font-semibold text-white transition hover:bg-[#1E3A8A]"
              >
                {detail.status === "needs_revision"
                  ? "Edit & Resubmit →"
                  : "Continue Editing →"}
              </Link>
            )}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
            <span className="text-[11px] font-bold uppercase text-slate-400">
              Event Schedule
            </span>
            <p className="mt-1 text-sm font-bold text-[#0F172A]">
              {detail.event_date}
              {detail.event_end_date ? ` → ${detail.event_end_date}` : ""}
            </p>
          </div>
          <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
            <span className="text-[11px] font-bold uppercase text-slate-400">
              Proposed Venue
            </span>
            <p className="mt-1 text-sm font-bold text-[#0F172A]">
              {detail.venue || "—"}
            </p>
          </div>
          <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
            <span className="text-[11px] font-bold uppercase text-slate-400">
              Total Requested Budget
            </span>
            <p className="mt-1 text-sm font-bold text-[#1E3A8A]">
              {formatIdr(Number(detail.total_budget))}
            </p>
          </div>
        </div>
      </div>

      {/* Narrative & Objectives */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7 space-y-6">
          <section className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-2xs">
            <h2 className="text-base font-bold text-[#0F172A]">
              Program Narrative &amp; Objectives
            </h2>
            <div className="mt-4 space-y-4 text-xs leading-relaxed text-slate-700">
              <div>
                <h3 className="font-bold uppercase tracking-wider text-slate-400">
                  Background &amp; Description
                </h3>
                <p className="mt-1 whitespace-pre-line">
                  {detail.background || "No background provided yet."}
                </p>
              </div>
              <div className="border-t border-slate-100 pt-3">
                <h3 className="font-bold uppercase tracking-wider text-slate-400">
                  Objectives
                </h3>
                <p className="mt-1 whitespace-pre-line">
                  {detail.objectives || "No objectives provided yet."}
                </p>
              </div>
              <div className="border-t border-slate-100 pt-3">
                <h3 className="font-bold uppercase tracking-wider text-slate-400">
                  Target Audience
                </h3>
                <p className="mt-1 whitespace-pre-line">
                  {detail.target_audience || "No target audience specified."}
                </p>
              </div>
            </div>
          </section>

          {/* RAB Budget Table */}
          <section className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-2xs">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <h2 className="text-base font-bold text-[#0F172A]">
                Itemized Budget Plan (RAB)
              </h2>
              <span className="text-sm font-bold text-[#1E3A8A]">
                {formatIdr(Number(detail.total_budget))}
              </span>
            </div>

            {detail.budget_items.length === 0 ? (
              <p className="mt-4 text-xs text-slate-500">
                No RAB line items recorded.
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      <th className="pb-2.5 pr-3">Category &amp; Item</th>
                      <th className="pb-2.5 pr-3">Qty</th>
                      <th className="pb-2.5 pr-3">Unit Price</th>
                      <th className="pb-2.5 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {detail.budget_items.map((item) => (
                      <tr key={item.id}>
                        <td className="py-2.5 pr-3">
                          <span className="block font-semibold text-[#0F172A]">
                            {item.description || "Unnamed item"}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            {item.category}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 text-slate-600">
                          {item.quantity} {item.unit}
                        </td>
                        <td className="py-2.5 pr-3 font-mono text-slate-600">
                          {formatIdr(item.unit_price)}
                        </td>
                        <td className="py-2.5 text-right font-mono font-bold text-[#0F172A]">
                          {formatIdr(item.subtotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Supporting Attachments */}
          <section className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-2xs">
            <h2 className="text-base font-bold text-[#0F172A]">
              Supporting Attachments ({detail.attachments.length})
            </h2>
            {detail.attachments.length === 0 ? (
              <p className="mt-3 text-xs text-slate-500">
                No supporting documents attached.
              </p>
            ) : (
              <div className="mt-4 space-y-2.5">
                {detail.attachments.map((att) => (
                  <div
                    key={att.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-[#0F172A]">
                        {att.file_name}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {formatBytes(att.file_size)} • v{att.version_number}.0
                      </p>
                    </div>
                    {att.signed_url && (
                      <a
                        href={att.signed_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 rounded-full border border-[#E2E8F0] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#1E3A8A] hover:bg-slate-50"
                      >
                        Download / View
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right Column: Sequential Signers, CC & Revision Audit Log */}
        <div className="lg:col-span-5 space-y-6">
          <section className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-2xs">
            <h2 className="text-base font-bold text-[#0F172A]">
              Sequential TTD Chain
            </h2>
            <div className="mt-4 space-y-2.5">
              {detail.signers.length === 0 ? (
                <p className="text-xs text-slate-500">
                  No TTD signers assigned yet.
                </p>
              ) : (
                detail.signers.map((signer) => (
                  <div
                    key={signer.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                          signer.status === "signed"
                            ? "bg-emerald-600 text-white"
                            : "bg-[#0F172A] text-white"
                        }`}
                      >
                        {signer.status === "signed" ? "✓" : signer.step_order}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-[#0F172A]">
                          {signer.approver?.full_name ?? "Campus Approver"}
                        </p>
                        <p className="truncate text-[11px] text-[#1E3A8A]">
                          {signer.role_title} • {signer.approver?.email ?? ""}
                        </p>
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full bg-white px-2.5 py-0.5 text-[10px] font-bold uppercase text-slate-700 border border-[#E2E8F0]">
                      {signer.status}
                    </span>
                  </div>
                ))
              )}
            </div>

            {detail.cc_users.length > 0 && (
              <div className="mt-4 border-t border-[#E2E8F0] pt-4">
                <p className="text-xs font-bold text-[#0F172A]">
                  CC Stakeholders (Read-Only)
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {detail.cc_users.map((cc) => (
                    <span
                      key={cc.id}
                      className="rounded-full bg-slate-100 px-2.5 py-0.5 font-mono text-[11px] text-slate-700"
                    >
                      {cc.stakeholder?.email ?? cc.stakeholder_id}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-2xs">
            <h2 className="text-base font-bold text-[#0F172A]">
              Audit &amp; Revision Log
            </h2>
            {detail.revision_logs.length === 0 ? (
              <p className="mt-3 text-xs text-slate-500">
                Audit log entries appear once the proposal is formally
                submitted.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {detail.revision_logs.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3.5 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-[#0F172A]">
                        {entry.actor?.full_name ?? "Campus Actor"} • v
                        {entry.to_version}.0
                      </span>
                      <span className="rounded bg-white px-2 py-0.5 font-mono text-[10px] font-semibold uppercase text-[#1E3A8A] border border-[#E2E8F0]">
                        {entry.action_type}
                      </span>
                    </div>
                    {entry.note && (
                      <p className="mt-1.5 text-slate-600">{entry.note}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

export default function ProposalDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ submitted?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-xs font-medium text-slate-500">
          Loading proposal details...
        </div>
      }
    >
      <ProposalDetailSection
        paramsPromise={params}
        searchParamsPromise={searchParams}
      />
    </Suspense>
  );
}
