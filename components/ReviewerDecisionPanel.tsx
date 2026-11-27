"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MIN_DECISION_NOTE_LENGTH } from "@/src/lib/validations/approval";

interface ReviewerDecisionPanelProps {
  proposalId: string;
  proposalCode: string;
  proposalTitle: string;
  currentVersion: number;
  stepOrder: number;
  totalSteps: number;
  roleTitle: string;
  approverName: string;
  approverEmail: string;
  hasSavedSignature: boolean;
  savedSignaturePreviewUrl: string | null;
}

type DecisionMode = "approve" | "request_revision" | "reject";

export default function ReviewerDecisionPanel({
  proposalId,
  proposalCode,
  proposalTitle,
  currentVersion,
  stepOrder,
  totalSteps,
  roleTitle,
  approverName,
  approverEmail,
  hasSavedSignature,
  savedSignaturePreviewUrl,
}: ReviewerDecisionPanelProps) {
  const router = useRouter();

  const [mode, setMode] = useState<DecisionMode>("approve");
  const [signatureType, setSignatureType] = useState<"drawn" | "stamp">(
    "drawn"
  );
  const [notes, setNotes] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [successMessage, setSuccessMessage] = useState<string>("");

  const handleSubmitDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    const trimmedNotes = notes.trim();
    if (
      (mode === "request_revision" || mode === "reject") &&
      trimmedNotes.length < MIN_DECISION_NOTE_LENGTH
    ) {
      setErrorMessage(
        mode === "request_revision"
          ? `Please enter clear revision instructions (at least ${MIN_DECISION_NOTE_LENGTH} characters).`
          : `Please enter a rejection reason (at least ${MIN_DECISION_NOTE_LENGTH} characters).`
      );
      return;
    }

    if (mode === "approve" && !hasSavedSignature) {
      setErrorMessage(
        "Please configure your active Digital Signature (TTD) on your Profile page before approving."
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/proposals/${proposalId}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: mode,
          notes: trimmedNotes || undefined,
          signature_type: signatureType,
        }),
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        proposalStatus?: string;
        verificationCode?: string;
        nextStepOrder?: number | null;
        error?: { message?: string };
      };

      if (!response.ok || !payload.ok) {
        setErrorMessage(
          payload.error?.message ?? "Unable to record your approval decision."
        );
        return;
      }

      if (mode === "approve") {
        setSuccessMessage(
          payload.nextStepOrder
            ? `Step ${stepOrder} approved & stamped (${payload.verificationCode}). Routed to Step ${payload.nextStepOrder}.`
            : `Final Step ${stepOrder} approved & stamped (${payload.verificationCode}). Proposal is now Approved!`
        );
      } else if (mode === "request_revision") {
        setSuccessMessage(
          "Revision requested. Proposal has been returned to the submitter with your instructions."
        );
      } else {
        setSuccessMessage("Proposal has been formally rejected and locked.");
      }

      router.refresh();
    } catch {
      setErrorMessage("Network error while submitting approval decision.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (successMessage) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-xs font-semibold text-emerald-900 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span>✓ {successMessage}</span>
          <Link
            href="/approvals"
            className="rounded-full bg-[#0F172A] px-4 py-1.5 text-white hover:bg-[#1E3A8A]"
          >
            Back to Approval Queue →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <section
      aria-label="Reviewer Decision Panel"
      className="rounded-2xl border-2 border-[#1E3A8A]/35 bg-white p-6 shadow-md shadow-slate-900/5"
    >
      {/* Panel Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#E2E8F0] pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#0F172A] px-3 py-0.5 text-[11px] font-bold text-white">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              Active Turn • Step {stepOrder} of {totalSteps}
            </span>
            <span className="rounded-full bg-[#1E3A8A]/10 px-2.5 py-0.5 text-xs font-bold text-[#1E3A8A]">
              {roleTitle}
            </span>
          </div>
          <h2 className="mt-2 text-lg font-bold text-[#0F172A]">
            Official TTD Review &amp; Decision Console
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Reviewing <span className="font-mono">{proposalCode}</span> (v
            {currentVersion}.0 — {proposalTitle}) as{" "}
            <strong className="text-[#0F172A]">{approverName}</strong> (
            <span className="font-mono">{approverEmail}</span>).
          </p>
        </div>

        {/* Decision Mode Tabs */}
        <div
          role="tablist"
          aria-label="Choose decision action"
          className="flex flex-wrap gap-1.5 rounded-full border border-[#E2E8F0] bg-[#F8FAFC] p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "approve"}
            onClick={() => {
              setMode("approve");
              setErrorMessage("");
            }}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition cursor-pointer ${
              mode === "approve"
                ? "bg-[#0F172A] text-white shadow-2xs"
                : "text-slate-600 hover:text-[#0F172A]"
            }`}
          >
            Approve &amp; Sign
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "request_revision"}
            onClick={() => {
              setMode("request_revision");
              setErrorMessage("");
            }}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition cursor-pointer ${
              mode === "request_revision"
                ? "bg-rose-600 text-white shadow-2xs"
                : "text-slate-600 hover:text-rose-800"
            }`}
          >
            Request Revision
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "reject"}
            onClick={() => {
              setMode("reject");
              setErrorMessage("");
            }}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition cursor-pointer ${
              mode === "reject"
                ? "bg-rose-700 text-white shadow-2xs"
                : "text-slate-600 hover:text-rose-800"
            }`}
          >
            Reject
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmitDecision} className="mt-5 space-y-5">
        {/* APPROVE MODE: Saved Signature Preview & Stamp Option */}
        {mode === "approve" && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            <div className="lg:col-span-6">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[#0F172A]">
                  Your Saved Digital Signature (from /profile)
                </span>
                <Link
                  href="/profile"
                  className="text-xs font-semibold text-[#1E3A8A] hover:underline"
                >
                  {hasSavedSignature ? "Update TTD" : "Configure TTD →"}
                </Link>
              </div>

              {hasSavedSignature ? (
                <div
                  style={{
                    backgroundImage:
                      "linear-gradient(45deg, #f1f5f9 25%, transparent 25%), linear-gradient(-45deg, #f1f5f9 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #f1f5f9 75%), linear-gradient(-45deg, transparent 75%, #f1f5f9 75%)",
                    backgroundSize: "14px 14px",
                    backgroundPosition: "0 0, 0 7px, 7px -7px, -7px 0px",
                  }}
                  className="mt-2 flex h-28 items-center justify-center rounded-2xl border border-[#E2E8F0] bg-white p-3"
                >
                  {savedSignaturePreviewUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={savedSignaturePreviewUrl}
                      alt={`Saved signature of ${approverName}`}
                      className="max-h-22 max-w-full object-contain"
                    />
                  ) : (
                    <span className="text-xs font-semibold text-emerald-700">
                      ✓ Active PNG Signature Ready in Private Storage
                    </span>
                  )}
                </div>
              ) : (
                <div className="mt-2 rounded-2xl border border-amber-300 bg-amber-50 p-4">
                  <p className="text-xs font-bold text-amber-900">
                    Digital Signature Not Configured Yet
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-amber-800">
                    You must save a transparent PNG signature on your Profile
                    page before stamping an approval.
                  </p>
                  <Link
                    href="/profile"
                    className="mt-3 inline-flex rounded-full bg-[#0F172A] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#1E3A8A]"
                  >
                    Configure Digital Signature Now →
                  </Link>
                </div>
              )}

              {/* Stamp Format Toggle (Prototype Card Selection) */}
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label
                  className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-xs font-semibold transition cursor-pointer ${
                    signatureType === "drawn"
                      ? "border-[#1E3A8A] bg-[#1E3A8A]/[0.04] text-[#0F172A]"
                      : "border-[#E2E8F0] bg-[#F8FAFC] text-slate-600 hover:bg-white"
                  }`}
                >
                  <input
                    type="radio"
                    name="sig-type"
                    checked={signatureType === "drawn"}
                    onChange={() => setSignatureType("drawn")}
                    className="text-[#0F172A]"
                  />
                  <span>Hand-Drawn Signature</span>
                </label>
                <label
                  className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-xs font-semibold transition cursor-pointer ${
                    signatureType === "stamp"
                      ? "border-[#1E3A8A] bg-[#1E3A8A]/[0.04] text-[#0F172A]"
                      : "border-[#E2E8F0] bg-[#F8FAFC] text-slate-600 hover:bg-white"
                  }`}
                >
                  <input
                    type="radio"
                    name="sig-type"
                    checked={signatureType === "stamp"}
                    onChange={() => setSignatureType("stamp")}
                    className="text-[#0F172A]"
                  />
                  <span>Official Digital Stamp</span>
                </label>
              </div>
            </div>

            <div className="lg:col-span-6">
              <label
                htmlFor="decision-notes-approve"
                className="block text-xs font-bold uppercase tracking-wider text-[#0F172A]"
              >
                Approval Endorsement Note (Optional)
              </label>
              <textarea
                id="decision-notes-approve"
                rows={4}
                maxLength={2000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional note recorded in the permanent audit trail (e.g., 'Budget verified against Q4 Student Activity allocation')..."
                className="mt-2 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2.5 text-xs leading-relaxed text-[#0F172A] focus:border-[#1E3A8A] focus:bg-white focus:outline-none"
              />
            </div>
          </div>
        )}

        {/* REQUEST REVISION MODE */}
        {mode === "request_revision" && (
          <div className="rounded-2xl border border-rose-200 bg-gradient-to-r from-rose-50/70 via-amber-50/40 to-rose-50/70 p-4">
            <div className="flex items-center justify-between">
              <label
                htmlFor="decision-notes-revision"
                className="block text-xs font-bold uppercase tracking-wider text-rose-900"
              >
                Mandatory Revision Instructions *
              </label>
              <span className="text-[11px] font-medium text-rose-700">
                {notes.trim().length} chars (min {MIN_DECISION_NOTE_LENGTH})
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-600">
              Unlocks the proposal so the submitter can revise and resubmit as v
              {currentVersion + 1}.0. All earlier approved TTD signatures remain
              preserved.
            </p>
            <textarea
              id="decision-notes-revision"
              rows={3}
              required
              minLength={MIN_DECISION_NOTE_LENGTH}
              maxLength={2000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Clearly specify what budget lines, schedule items, or attachments must be updated..."
              className="mt-2.5 w-full rounded-xl border border-rose-300 bg-white px-3.5 py-2.5 text-xs leading-relaxed text-[#0F172A] focus:border-rose-600 focus:outline-none"
            />
          </div>
        )}

        {/* REJECT MODE */}
        {mode === "reject" && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-4">
            <div className="flex items-center justify-between">
              <label
                htmlFor="decision-notes-reject"
                className="block text-xs font-bold uppercase tracking-wider text-rose-950"
              >
                Mandatory Rejection Reason *
              </label>
              <span className="text-[11px] text-rose-800">
                {notes.trim().length} chars (min {MIN_DECISION_NOTE_LENGTH})
              </span>
            </div>
            <p className="mt-1 text-xs text-rose-900/80">
              Warning: Rejecting a proposal is a final terminal action and locks
              all further approval progression.
            </p>
            <textarea
              id="decision-notes-reject"
              rows={3}
              required
              minLength={MIN_DECISION_NOTE_LENGTH}
              maxLength={2000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="State the institutional policy, compliance, or budgetary reason for rejecting this proposal..."
              className="mt-2.5 w-full rounded-xl border border-rose-300 bg-white px-3.5 py-2.5 text-xs leading-relaxed text-[#0F172A] focus:border-rose-600 focus:outline-none"
            />
          </div>
        )}

        {errorMessage && (
          <div
            role="alert"
            className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700"
          >
            {errorMessage}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E2E8F0] pt-4">
          <span className="text-[11px] text-slate-500">
            Every decision is permanently recorded in the immutable{" "}
            <span className="font-mono">revision_logs</span> audit trail.
          </span>

          <button
            type="submit"
            disabled={
              isSubmitting || (mode === "approve" && !hasSavedSignature)
            }
            className={`inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-xs font-semibold text-white shadow-xs transition disabled:opacity-50 cursor-pointer ${
              mode === "approve"
                ? "bg-[#0F172A] hover:bg-[#1E3A8A]"
                : mode === "request_revision"
                ? "bg-rose-600 hover:bg-rose-700"
                : "bg-rose-800 hover:bg-rose-900"
            }`}
          >
            <span>
              {isSubmitting
                ? "Recording Official Decision..."
                : mode === "approve"
                ? `Stamp Digital TTD & Approve Step ${stepOrder}`
                : mode === "request_revision"
                ? "Return Proposal for Revision"
                : "Confirm Proposal Rejection"}
            </span>
          </button>
        </div>
      </form>
    </section>
  );
}
