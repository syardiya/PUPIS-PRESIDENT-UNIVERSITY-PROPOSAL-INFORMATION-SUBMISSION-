import React, { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { requireAuth } from "@/src/lib/auth/guard";
import { createClient } from "@/src/lib/supabase/server";
import type {
  ProposalStatusDb,
  RevisionActionTypeDb,
} from "@/src/lib/supabase/database.types";
import { uuidSchema } from "@/src/lib/validations/proposal";
import { fetchHydratedProposalDetail } from "@/src/lib/proposals/server-helpers";
import ReviewerDecisionPanel from "@/components/ReviewerDecisionPanel";
import PrintProposalButton from "@/components/PrintProposalButton";

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

function getAuditActionMeta(action: RevisionActionTypeDb) {
  switch (action) {
    case "signed":
      return {
        label: "Approved & Signed",
        dotClasses: "bg-emerald-600 text-white",
        badgeClasses: "border-emerald-200 bg-emerald-50 text-emerald-800",
        symbol: "✓",
      };
    case "revision_requested":
      return {
        label: "Revision Requested",
        dotClasses: "bg-amber-600 text-white",
        badgeClasses: "border-amber-200 bg-amber-50 text-amber-800",
        symbol: "!",
      };
    case "rejected":
      return {
        label: "Rejected",
        dotClasses: "bg-rose-600 text-white",
        badgeClasses: "border-rose-200 bg-rose-50 text-rose-800",
        symbol: "✕",
      };
    case "resubmitted":
      return {
        label: "Resubmitted",
        dotClasses: "bg-[#1E3A8A] text-white",
        badgeClasses: "border-[#1E3A8A]/25 bg-[#1E3A8A]/10 text-[#1E3A8A]",
        symbol: "↑",
      };
    case "submitted":
    default:
      return {
        label: "Submitted",
        dotClasses: "bg-[#0F172A] text-white",
        badgeClasses: "border-slate-200 bg-slate-100 text-slate-800",
        symbol: "•",
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

function formatDateTime(iso: string | null | undefined): string {
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

async function ProposalDetailSection({
  paramsPromise,
  searchParamsPromise,
}: {
  paramsPromise: Promise<{ id: string }>;
  searchParamsPromise: Promise<{ submitted?: string }>;
}) {
  await connection();
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

  const activeTurnSigner = detail.signers.find((s) => s.is_active_turn) ?? null;
  const isCurrentUserActiveSigner = Boolean(
    detail.status === "pending_ttd" &&
      activeTurnSigner &&
      activeTurnSigner.approver_id === profile.id
  );

  const upcomingUserSigner =
    !isCurrentUserActiveSigner && detail.status === "pending_ttd"
      ? detail.signers.find(
          (s) => s.approver_id === profile.id && s.status === "pending"
        ) ?? null
      : null;

  const latestRevisionRequest =
    detail.status === "needs_revision"
      ? [...detail.revision_logs]
          .reverse()
          .find((l) => l.action_type === "revision_requested" && l.note)
      : null;

  const latestRejectionEntry =
    detail.status === "rejected"
      ? [...detail.revision_logs]
          .reverse()
          .find((l) => l.action_type === "rejected" && l.note)
      : null;

  const isCcOnlyObserver =
    detail.cc_users.some((c) => c.stakeholder_id === profile.id) &&
    detail.submitter_id !== profile.id &&
    !detail.signers.some((s) => s.approver_id === profile.id);

  return (
    <div className="print-sheet-container mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      {/* Official Print-Only Institutional Letterhead */}
      <div className="print-only rounded-2xl border-2 border-[#0F172A] bg-white p-5">
        <div className="flex items-start justify-between gap-4 border-b border-slate-300 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#0F172A] text-sm font-bold tracking-wider text-white">
              PU
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-[#1E3A8A]">
                President University • Student Affairs &amp; Governance
              </p>
              <h2 className="text-base font-bold text-[#0F172A]">
                Official Proposal Summary &amp; Digital TTD Approval Sheet
              </h2>
            </div>
          </div>

          <div className="text-right font-mono text-[11px] text-slate-700">
            <p className="font-bold text-[#0F172A]">{detail.proposal_code}</p>
            <p>
              Version v{detail.current_version}.0 • {badge.label}
            </p>
            <p>Updated: {formatDateTime(detail.updated_at)}</p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-700">
          <p>
            <strong className="text-[#0F172A]">Organization:</strong>{" "}
            {detail.organization_name || "—"}
          </p>
          <p>
            <strong className="text-[#0F172A]">Person in Charge (PIC):</strong>{" "}
            {detail.person_in_charge || "—"}
          </p>
          <p>
            <strong className="text-[#0F172A]">Submitter:</strong>{" "}
            {detail.submitter
              ? `${detail.submitter.full_name} (${detail.submitter.email})`
              : "—"}
          </p>
          <p>
            <strong className="text-[#0F172A]">Category:</strong>{" "}
            {detail.activity_type || "General Campus Activity"}
          </p>
        </div>
      </div>

      {query.submitted === "1" && (
        <div className="no-print rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-xs font-semibold text-emerald-900">
          Proposal <span className="font-mono">{detail.proposal_code}</span> (v
          {detail.current_version}.0) has been locked and routed to Step{" "}
          {detail.active_step_order ?? 1} for sequential TTD approval.
        </div>
      )}

      {/* Highlighted Revision Requested Banner (Prototype Style) */}
      {detail.status === "needs_revision" && latestRevisionRequest && (
        <div className="print-avoid-break rounded-2xl border border-rose-300 bg-gradient-to-r from-rose-50 via-amber-50/60 to-rose-50 p-5 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-rose-600 text-xs font-bold text-white">
                !
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-rose-800">
                Revision Requested by{" "}
                {latestRevisionRequest.actor?.full_name ?? "Approver"}
                {latestRevisionRequest.step_order
                  ? ` (Step ${latestRevisionRequest.step_order} • ${
                      latestRevisionRequest.role_title ?? "Approver"
                    })`
                  : ""}
              </span>
            </div>
            <span className="font-mono text-xs text-rose-700">
              {formatDateTime(latestRevisionRequest.created_at)}
            </span>
          </div>
          <blockquote className="mt-2.5 rounded-xl border border-rose-200/80 bg-white/90 p-3.5 text-sm font-semibold text-slate-900">
            &ldquo;{latestRevisionRequest.note}&rdquo;
          </blockquote>
          <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-600">
              {canEdit
                ? `Edit this proposal and resubmit as v${
                    detail.current_version + 1
                  }.0. Previously approved TTD steps remain valid.`
                : `Awaiting revised v${
                    detail.current_version + 1
                  }.0 submission from ${
                    detail.submitter?.email ?? "submitter"
                  }.`}
            </p>
            {canEdit && (
              <Link
                href={`/proposals/${detail.id}/edit`}
                className="no-print inline-flex items-center gap-2 rounded-full bg-[#0F172A] px-5 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-[#1E3A8A]"
              >
                Edit &amp; Resubmit (v{detail.current_version} → v
                {detail.current_version + 1}) →
              </Link>
            )}
          </div>
        </div>
      )}

      {/* CC Stakeholder Read-Only Banner (Prototype Style) */}
      {isCcOnlyObserver && (
        <div className="no-print flex items-center justify-between gap-3 rounded-2xl border border-indigo-200 bg-indigo-50/60 px-4 py-3 text-xs text-indigo-950">
          <div>
            <span className="font-bold">CC Observer Access:</span> You have
            read-only visibility into signature progress and version change
            logs.
          </div>
          <span className="shrink-0 rounded-full border border-indigo-200 bg-white px-2.5 py-0.5 font-semibold text-indigo-800">
            Read-Only
          </span>
        </div>
      )}

      {/* Highlighted Rejected Banner */}
      {detail.status === "rejected" && latestRejectionEntry && (
        <div className="print-avoid-break rounded-2xl border border-rose-300 bg-rose-50 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-900">
              Proposal Rejected by{" "}
              {latestRejectionEntry.actor?.full_name ?? "Approver"}
            </span>
            <span className="font-mono text-xs text-rose-700">
              {formatDateTime(latestRejectionEntry.created_at)}
            </span>
          </div>
          <p className="mt-2 text-sm font-semibold text-rose-950">
            &ldquo;{latestRejectionEntry.note}&rdquo;
          </p>
        </div>
      )}

      {/* Active Turn Reviewer Decision Panel */}
      {isCurrentUserActiveSigner && activeTurnSigner && (
        <div className="no-print">
          <ReviewerDecisionPanel
            proposalId={detail.id}
            proposalCode={detail.proposal_code}
            proposalTitle={detail.title}
            currentVersion={detail.current_version}
            stepOrder={activeTurnSigner.step_order}
            totalSteps={detail.signers.length}
            roleTitle={activeTurnSigner.role_title}
            approverName={profile.full_name}
            approverEmail={profile.email}
            hasSavedSignature={Boolean(profile.signature_storage_path)}
            savedSignaturePreviewUrl={profile.signature_url}
          />
        </div>
      )}

      {/* Upcoming Signer Informational Banner */}
      {upcomingUserSigner && activeTurnSigner && (
        <div className="no-print rounded-2xl border border-[#E2E8F0] bg-white px-5 py-4 text-xs text-slate-700 shadow-2xs">
          <strong className="text-[#0F172A]">
            Sequential Queue Notice (Step {upcomingUserSigner.step_order} —{" "}
            {upcomingUserSigner.role_title}):
          </strong>{" "}
          This proposal is currently awaiting{" "}
          <strong>
            Step {activeTurnSigner.step_order} ({activeTurnSigner.role_title})
          </strong>{" "}
          sign-off before your turn becomes active.
        </div>
      )}

      {/* Top Proposal Metadata Header Card */}
      <div className="print-avoid-break rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-2xs">
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
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-0.5 text-xs font-semibold ${badge.classes}`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${badge.dotClasses}`}
                />
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
              {detail.submitter
                ? ` • Submitter: ${detail.submitter.full_name} (${detail.submitter.email})`
                : ""}
            </p>
          </div>

          <div className="no-print flex flex-wrap items-center gap-2.5">
            <PrintProposalButton />
            <Link
              href="/proposals"
              className="rounded-full border border-[#E2E8F0] bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              ← Proposals
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

      {/* Main Content Grid */}
      <div className="print-stack-grid grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* LEFT (7 cols): Narrative, RAB Table & Supporting Attachments */}
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
                      <div className="flex items-center gap-2">
                        <p className="truncate text-xs font-bold text-[#0F172A]">
                          {att.file_name}
                        </p>
                        {att.attachment_kind === "primary_proposal_pdf" && (
                          <span className="rounded-full bg-[#1E3A8A]/10 px-2 py-0.5 text-[10px] font-bold text-[#1E3A8A]">
                            Primary PDF
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500">
                        {formatBytes(att.file_size)} • v{att.version_number}.0
                      </p>
                    </div>
                    {att.signed_url && (
                      <a
                        href={att.signed_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="no-print shrink-0 rounded-full border border-[#E2E8F0] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#1E3A8A] hover:bg-slate-50"
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

        {/* RIGHT (5 cols): Sequential Approval Chain + Stamped Signatures & Chronological Audit Trail */}
        <div className="lg:col-span-5 space-y-6">
          {/* Official Sequential Approval & Signature Sheet */}
          <section className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-2xs">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3.5">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#1E3A8A]">
                  Digital Sign-Off Sheet
                </span>
                <h2 className="text-base font-bold text-[#0F172A]">
                  Sequential Approval Chain
                </h2>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-700">
                {detail.signers.filter((s) => s.status === "signed").length}/
                {detail.signers.length} Signed
              </span>
            </div>

            <div className="mt-4 space-y-3.5">
              {detail.signers.length === 0 ? (
                <p className="text-xs text-slate-500">
                  No TTD signers assigned yet.
                </p>
              ) : (
                detail.signers.map((signer) => {
                  const isSigned = signer.status === "signed";
                  const isActive = signer.is_active_turn;
                  const isRevReq = signer.status === "revision_requested";
                  const isRejected = signer.status === "rejected";

                  return (
                    <div
                      key={signer.id}
                      className={`rounded-2xl border p-4 transition ${
                        isSigned
                          ? "border-emerald-200 bg-emerald-50/20"
                          : isActive
                          ? "border-[#1E3A8A] bg-[#1E3A8A]/[0.03] ring-2 ring-[#1E3A8A]/15"
                          : isRevReq
                          ? "border-amber-200 bg-amber-50/30"
                          : isRejected
                          ? "border-rose-200 bg-rose-50/30"
                          : "border-[#E2E8F0] bg-[#F8FAFC]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                              isSigned
                                ? "bg-emerald-600 text-white"
                                : isActive
                                ? "bg-[#0F172A] text-white"
                                : isRevReq
                                ? "bg-amber-600 text-white"
                                : isRejected
                                ? "bg-rose-600 text-white"
                                : "border border-slate-300 bg-white text-slate-600"
                            }`}
                          >
                            {isSigned ? "✓" : signer.step_order}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-xs font-bold text-[#0F172A]">
                              Step {signer.step_order}: {signer.role_title}
                            </p>
                            <p className="truncate text-[11px] text-slate-600">
                              {signer.approver?.full_name ?? "Campus Approver"}{" "}
                              ({signer.approver?.email ?? ""})
                            </p>
                          </div>
                        </div>

                        <span
                          className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                            isSigned
                              ? "bg-emerald-100 text-emerald-800"
                              : isActive
                              ? "bg-[#0F172A] text-white"
                              : isRevReq
                              ? "bg-amber-100 text-amber-800"
                              : isRejected
                              ? "bg-rose-100 text-rose-800"
                              : "bg-slate-200/70 text-slate-600"
                          }`}
                        >
                          {isSigned
                            ? "Signed"
                            : isActive
                            ? "Active Turn"
                            : isRevReq
                            ? "Needs Revision"
                            : isRejected
                            ? "Rejected"
                            : "Waiting"}
                        </span>
                      </div>

                      {/* Stamped Signature / Official Stamp Box */}
                      {isSigned && (
                        <div className="mt-3 rounded-xl border border-[#E2E8F0] bg-white p-3">
                          {signer.signature_type !== "stamp" &&
                          signer.signature_signed_url ? (
                            <div className="flex flex-col items-center">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={signer.signature_signed_url}
                                alt={`Stamped digital signature of ${
                                  signer.approver?.full_name ?? "Approver"
                                }`}
                                className="max-h-16 max-w-full object-contain"
                              />
                            </div>
                          ) : (
                            <div className="flex items-center justify-between">
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                                ✓ Verified Institutional Digital Stamp
                              </span>
                              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#0F172A] text-[9px] font-bold text-white">
                                PU
                              </span>
                            </div>
                          )}

                          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 font-mono text-[10px] text-slate-500">
                            <span>
                              {signer.verification_code ?? "Verified TTD"}
                              {signer.signed_on_version
                                ? ` • v${signer.signed_on_version}.0`
                                : ""}
                            </span>
                            <span>{formatDateTime(signer.signed_at)}</span>
                          </div>
                        </div>
                      )}

                      {signer.decision_note && (
                        <p className="mt-2.5 rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-xs text-slate-700">
                          <strong className="text-[#0F172A]">Note:</strong>{" "}
                          {signer.decision_note}
                        </p>
                      )}
                    </div>
                  );
                })
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

          {/* Chronological Immutable Audit & Revision Trail */}
          <section className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-2xs">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3.5">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#1E3A8A]">
                  Immutable History
                </span>
                <h2 className="text-base font-bold text-[#0F172A]">
                  Chronological Audit Trail
                </h2>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700">
                {detail.revision_logs.length} Event(s)
              </span>
            </div>

            {detail.revision_logs.length === 0 ? (
              <p className="mt-4 text-xs text-slate-500">
                Audit log entries appear once the proposal is formally
                submitted.
              </p>
            ) : (
              <div className="mt-5 space-y-4">
                {detail.revision_logs.map((entry, idx) => {
                  const meta = getAuditActionMeta(entry.action_type);
                  return (
                    <div
                      key={entry.id}
                      className="relative flex items-start gap-3"
                    >
                      {idx < detail.revision_logs.length - 1 && (
                        <div className="absolute top-6 left-3 -bottom-4 w-px bg-[#E2E8F0]" />
                      )}

                      <span
                        className={`relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${meta.dotClasses}`}
                      >
                        {meta.symbol}
                      </span>

                      <div className="min-w-0 flex-1 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3.5 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-1.5">
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${meta.badgeClasses}`}
                          >
                            {meta.label}
                          </span>
                          <span className="font-mono text-[10px] text-slate-500">
                            {formatDateTime(entry.created_at)}
                          </span>
                        </div>

                        <p className="mt-1.5 font-bold text-[#0F172A]">
                          {entry.actor?.full_name ?? "Campus Actor"}{" "}
                          <span className="font-normal text-slate-500">
                            (
                            {entry.role_title
                              ? `Step ${entry.step_order ?? "•"} • ${entry.role_title}`
                              : entry.actor?.role ?? "member"}
                            )
                          </span>
                        </p>

                        <p className="mt-0.5 font-mono text-[10px] text-slate-400">
                          {entry.from_version &&
                          entry.from_version !== entry.to_version
                            ? `v${entry.from_version}.0 → v${entry.to_version}.0`
                            : `Version v${entry.to_version}.0`}
                        </p>

                        {entry.note && (
                          <p className="mt-2 leading-relaxed text-slate-700">
                            {entry.note}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Formal Printable Official Approval & Signature Verification Sheet */}
      {detail.signers.length > 0 && (
        <section className="print-avoid-break rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] pb-4">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#1E3A8A]">
                Official Digital Verification Sheet
              </span>
              <h2 className="text-base font-bold text-[#0F172A]">
                Sequential TTD Sign-Off &amp; Verification Record (
                {detail.proposal_code} • v{detail.current_version}.0)
              </h2>
            </div>
            <span className="font-mono text-xs font-semibold text-slate-600">
              {detail.signers.filter((s) => s.status === "signed").length} of{" "}
              {detail.signers.length} Signatures Verified
            </span>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {detail.signers.map((signer) => {
              const isSigned = signer.status === "signed";
              return (
                <div
                  key={`sheet-${signer.id}`}
                  className={`print-avoid-break flex flex-col justify-between rounded-2xl border p-4 ${
                    isSigned
                      ? "border-emerald-200 bg-emerald-50/15"
                      : "border-[#E2E8F0] bg-[#F8FAFC]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 border-b border-slate-200/80 pb-2.5">
                    <span className="text-xs font-bold text-[#0F172A]">
                      Step {signer.step_order} • {signer.role_title}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                        isSigned
                          ? "bg-emerald-100 text-emerald-800"
                          : signer.status === "rejected"
                          ? "bg-rose-100 text-rose-800"
                          : signer.status === "revision_requested"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {isSigned ? "Verified" : signer.status.replace("_", " ")}
                    </span>
                  </div>

                  {/* Signature Graphic Area (Prototype Style) */}
                  <div className="my-3">
                    {isSigned &&
                    signer.signature_type !== "stamp" &&
                    signer.signature_signed_url ? (
                      <div className="flex h-28 flex-col items-center justify-center rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={signer.signature_signed_url}
                          alt={`Digital signature of ${
                            signer.approver?.full_name ?? "Approver"
                          }`}
                          className="max-h-20 max-w-full object-contain"
                        />
                        <span className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                          Hand-Drawn Digital TTD
                        </span>
                      </div>
                    ) : isSigned ? (
                      <div className="flex h-28 flex-col justify-between rounded-xl border border-[#1E3A8A]/30 bg-gradient-to-br from-[#F8FAFC] via-white to-[#1E3A8A]/[0.05] p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                            ✓ Official Digital Stamp
                          </span>
                          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#0F172A] text-[9px] font-bold text-white">
                            PU
                          </span>
                        </div>
                        <div>
                          <p className="truncate text-xs font-bold text-[#0F172A]">
                            {signer.approver?.full_name ?? "Campus Approver"}
                          </p>
                          <p className="truncate font-mono text-[10px] text-[#1E3A8A]">
                            {signer.approver?.email ?? "—"}
                          </p>
                        </div>
                      </div>
                    ) : signer.status === "revision_requested" ? (
                      <div className="flex h-28 flex-col items-center justify-center rounded-xl border border-dashed border-rose-300 bg-white/70 p-3 text-center">
                        <span className="text-xs font-bold text-rose-700">
                          Revision Requested
                        </span>
                        <span className="mt-0.5 text-[11px] text-slate-500">
                          Awaiting resubmission before TTD sign-off
                        </span>
                      </div>
                    ) : signer.status === "rejected" ? (
                      <div className="flex h-28 flex-col items-center justify-center rounded-xl border border-dashed border-rose-300 bg-rose-50/40 p-3 text-center">
                        <span className="text-xs font-bold text-rose-800">
                          Proposal Rejected
                        </span>
                      </div>
                    ) : (
                      <div className="flex h-28 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-3 text-center">
                        <span className="text-xs font-semibold text-slate-400">
                          Awaiting Digital TTD
                        </span>
                        <span className="mt-0.5 font-mono text-[10px] text-slate-400">
                          {signer.approver?.email ?? "—"}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-slate-200/80 pt-2.5 text-xs">
                    <p className="truncate font-bold text-[#0F172A]">
                      {signer.approver?.full_name ?? "Assigned Approver"}
                    </p>
                    <p className="truncate font-mono text-[10px] text-slate-500">
                      {signer.approver?.email ?? "—"}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1 font-mono text-[10px] text-slate-600">
                      <span className="font-semibold text-[#1E3A8A]">
                        {signer.verification_code ?? "Pending Verification Code"}
                      </span>
                      <span>
                        {isSigned ? formatDateTime(signer.signed_at) : "—"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
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
          Loading proposal &amp; sequential approval chain...
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
