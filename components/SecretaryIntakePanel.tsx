"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

interface SecretaryIntakePanelProps {
  proposalId: string;
  proposalCode: string;
  proposalTitle: string;
  organizationName: string;
  submittedAtFormatted: string;
  eventDateLabel: string;
  currentVersion: number;
  completeness: {
    has_primary_pdf: boolean;
    attachments_count: number;
    rab_items_count: number;
    signers_count: number;
    is_complete: boolean;
  };
  firstPendingSigner: {
    step_order: number;
    role_title: string;
    full_name: string;
    email: string;
  } | null;
}

export default function SecretaryIntakePanel({
  proposalId,
  proposalCode,
  proposalTitle,
  organizationName,
  submittedAtFormatted,
  eventDateLabel,
  currentVersion,
  completeness,
  firstPendingSigner,
}: SecretaryIntakePanelProps) {
  const router = useRouter();
  const [selectedAction, setSelectedAction] = useState<
    "forward" | "request_clarification"
  >(completeness.is_complete ? "forward" : "request_clarification");
  const [notes, setNotes] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [successMessage, setSuccessMessage] = useState<string>("");

  const canForward =
    completeness.attachments_count > 0 && Boolean(firstPendingSigner);

  const handleSubmitIntake = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    if (
      selectedAction === "request_clarification" &&
      notes.trim().length < 10
    ) {
      setErrorMessage(
        "Please provide clear follow-up / clarification instructions (minimum 10 characters)."
      );
      return;
    }

    if (selectedAction === "forward" && !canForward) {
      setErrorMessage(
        "Proposal cannot be forwarded without uploaded supporting documents and an assigned approver."
      );
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(
        `/api/proposals/${proposalId}/secretary-review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: selectedAction,
            notes: notes.trim() || undefined,
          }),
        }
      );

      const json = (await response.json()) as {
        ok?: boolean;
        error?: { message?: string };
      };

      if (!response.ok || !json.ok) {
        setErrorMessage(
          json.error?.message ??
            "Failed to record Faculty Secretary intake action."
        );
        return;
      }

      setSuccessMessage(
        selectedAction === "forward"
          ? `Proposal ${proposalCode} verified and forwarded to Step ${
              firstPendingSigner?.step_order ?? 1
            } (${firstPendingSigner?.role_title ?? "Approver"}).`
          : `Clarification / follow-up request sent to ${organizationName}.`
      );
      router.refresh();
    } catch {
      setErrorMessage(
        "Network error while submitting intake decision. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="rounded-2xl border-2 border-[#1E3A8A] bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#E2E8F0] pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#0F172A] px-3 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white">
              Faculty Secretary Intake
            </span>
            <span className="font-mono text-xs font-semibold text-slate-500">
              {proposalCode} • v{currentVersion}.0
            </span>
          </div>
          <h2 className="mt-2 text-lg font-bold text-[#0F172A]">
            Administrative &amp; Document Completeness Verification
          </h2>
          <p className="mt-0.5 text-xs text-slate-600">
            Inspect supporting documents below, then either{" "}
            <strong>Forward to Step 1 Approver (Kaprodi)</strong> or{" "}
            <strong>Request Clarification / Follow-Up</strong>.
          </p>
        </div>

        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${
            completeness.is_complete
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-amber-300 bg-amber-50 text-amber-900"
          }`}
        >
          <span>
            {completeness.is_complete
              ? "✓ Documents Complete"
              : "! Check Completeness"}
          </span>
        </span>
      </div>

      {/* Intake Summary Metadata & Document Completeness Checklist */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Event &amp; Organization
          </span>
          <p className="mt-0.5 truncate text-xs font-bold text-[#0F172A]">
            {proposalTitle || "Untitled Event"}
          </p>
          <p className="truncate text-[11px] font-medium text-[#1E3A8A]">
            {organizationName || "—"}
          </p>
        </div>

        <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Submitted &amp; Event Date
          </span>
          <p className="mt-0.5 text-xs font-bold text-[#0F172A]">
            Submitted: {submittedAtFormatted}
          </p>
          <p className="text-[11px] text-slate-600">Event: {eventDateLabel}</p>
        </div>

        <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Document Completeness
          </span>
          <p className="mt-0.5 text-xs font-bold text-[#0F172A]">
            {completeness.has_primary_pdf
              ? "✓ Primary PDF Attached"
              : "✕ Missing Primary PDF"}
          </p>
          <p className="text-[11px] text-slate-600">
            {completeness.attachments_count} File(s) •{" "}
            {completeness.rab_items_count} RAB Item(s)
          </p>
        </div>

        <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Forwarding Target (Step 1)
          </span>
          {firstPendingSigner ? (
            <>
              <p className="mt-0.5 truncate text-xs font-bold text-[#0F172A]">
                {firstPendingSigner.full_name}
              </p>
              <p className="truncate text-[11px] text-[#1E3A8A]">
                {firstPendingSigner.role_title}
              </p>
            </>
          ) : (
            <p className="mt-0.5 text-xs font-semibold text-rose-700">
              No pending approver
            </p>
          )}
        </div>
      </div>

      {/* Explicit Role Boundary Notice (No Approve/Reject) */}
      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-600">
        <strong className="text-[#0F172A]">Governance Separation:</strong>{" "}
        Faculty Secretary cannot directly Approve or Reject proposals. Formal
        approval/rejection authority belongs strictly to assigned institutional
        approvers (e.g., Head of Study Program).
      </div>

      <form onSubmit={handleSubmitIntake} className="mt-4 space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            disabled={!canForward}
            onClick={() => {
              setSelectedAction("forward");
              setErrorMessage("");
            }}
            className={`rounded-xl border p-3.5 text-left transition cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
              selectedAction === "forward"
                ? "border-[#1E3A8A] bg-[#1E3A8A]/[0.05] ring-2 ring-[#1E3A8A]/15"
                : "border-[#E2E8F0] bg-white hover:bg-slate-50"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#0F172A]">
                Forward to Step {firstPendingSigner?.step_order ?? 1} Approver
              </span>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                Verify &amp; Route
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-600">
              Confirm documents are complete and activate{" "}
              {firstPendingSigner
                ? `${firstPendingSigner.full_name} (${firstPendingSigner.role_title})`
                : "the Step 1 approver"}{" "}
              for sequential TTD review.
            </p>
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectedAction("request_clarification");
              setErrorMessage("");
            }}
            className={`rounded-xl border p-3.5 text-left transition cursor-pointer ${
              selectedAction === "request_clarification"
                ? "border-amber-500 bg-amber-50/50 ring-2 ring-amber-500/20"
                : "border-[#E2E8F0] bg-white hover:bg-slate-50"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#0F172A]">
                Request Clarification / Follow-Up
              </span>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                Needs Follow-Up
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-600">
              Return proposal to the student organization with notes to complete
              or clarify supporting documents before forwarding.
            </p>
          </button>
        </div>

        <div>
          <label
            htmlFor="secretary-intake-notes"
            className="block text-xs font-bold uppercase tracking-wider text-[#0F172A]"
          >
            {selectedAction === "request_clarification"
              ? "Clarification / Follow-Up Instructions (Required) *"
              : "Intake Verification Note (Optional)"}
          </label>
          <textarea
            id="secretary-intake-notes"
            rows={3}
            maxLength={2000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={
              selectedAction === "request_clarification"
                ? "Specify missing supporting documents, schedule details, or clarifications needed from the student organization..."
                : "Optional administrative note for the Step 1 approver (e.g., Proposal PDF, RAB, and rundown verified complete)..."
            }
            className="mt-1.5 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2.5 text-xs text-[#0F172A] focus:border-[#1E3A8A] focus:bg-white focus:outline-none"
          />
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-800"
          >
            {errorMessage}
          </div>
        )}

        {successMessage && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-800">
            {successMessage}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting}
            className={`inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-xs font-semibold text-white shadow-xs transition disabled:opacity-50 cursor-pointer ${
              selectedAction === "forward"
                ? "bg-[#0F172A] hover:bg-[#1E3A8A]"
                : "bg-amber-600 hover:bg-amber-700"
            }`}
          >
            <span>
              {submitting
                ? "Processing Intake..."
                : selectedAction === "forward"
                ? `Forward to ${
                    firstPendingSigner?.role_title ?? "Step 1 Approver"
                  } →`
                : "Send Clarification Request →"}
            </span>
          </button>
        </div>
      </form>
    </section>
  );
}
