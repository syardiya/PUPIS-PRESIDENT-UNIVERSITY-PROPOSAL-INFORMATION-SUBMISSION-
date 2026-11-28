"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface StudentAffairsFinalSignaturePanelProps {
  proposalId: string;
  proposalCode: string;
  proposalTitle: string;
  organizationName: string;
  currentVersion: number;
  officerName: string;
  officerEmail: string;
  hasSavedSignature: boolean;
  savedSignaturePreviewUrl: string | null;
}

export default function StudentAffairsFinalSignaturePanel({
  proposalId,
  proposalCode,
  proposalTitle,
  organizationName,
  currentVersion,
  officerName,
  officerEmail,
  hasSavedSignature,
  savedSignaturePreviewUrl,
}: StudentAffairsFinalSignaturePanelProps) {
  const router = useRouter();
  const [notes, setNotes] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [successMessage, setSuccessMessage] = useState<string>("");

  const handleApplyFinalSignature = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    if (!hasSavedSignature) {
      setErrorMessage(
        "Please configure your active Digital Signature on the Profile page before applying the final signature."
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(
        `/api/proposals/${proposalId}/final-signature`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            notes: notes.trim() || undefined,
          }),
        }
      );

      const payload = (await response.json()) as {
        ok?: boolean;
        verificationCode?: string;
        error?: { message?: string };
      };

      if (!response.ok || !payload.ok) {
        setErrorMessage(
          payload.error?.message ??
            "Unable to record Student Affairs final signature."
        );
        return;
      }

      setSuccessMessage(
        `Final signature recorded for ${proposalCode} (${
          payload.verificationCode ?? "Verified"
        }). Proposal status is now Completed.`
      );
      router.refresh();
    } catch {
      setErrorMessage("Network error while recording final signature.");
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
            Back to Final Signature Queue →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <section
      aria-label="Student Affairs Final Signature Panel"
      className="rounded-2xl border-2 border-[#1E3A8A] bg-white p-6 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#E2E8F0] pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#0F172A] px-3 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white">
              Student Affairs Final Signature
            </span>
            <span className="font-mono text-xs font-semibold text-slate-500">
              {proposalCode} • v{currentVersion}.0
            </span>
          </div>
          <h2 className="mt-2 text-lg font-bold text-[#0F172A]">
            Final Verification &amp; Completion Sign-Off
          </h2>
          <p className="mt-0.5 text-xs text-slate-600">
            Reviewing <strong className="text-[#0F172A]">{proposalTitle}</strong>{" "}
            ({organizationName}) as{" "}
            <strong className="text-[#0F172A]">{officerName}</strong> (
            <span className="font-mono">{officerEmail}</span>). All required
            approvers have approved this proposal.
          </p>
        </div>
      </div>

      <form onSubmit={handleApplyFinalSignature} className="mt-5 space-y-5">
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
                {hasSavedSignature ? "Update Signature" : "Configure Signature →"}
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
                    alt={`Saved signature of ${officerName}`}
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
                  Please save your PNG signature on your Profile page before
                  applying the Student Affairs final signature.
                </p>
                <Link
                  href="/profile"
                  className="mt-3 inline-flex rounded-full bg-[#0F172A] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#1E3A8A]"
                >
                  Configure Digital Signature Now →
                </Link>
              </div>
            )}
          </div>

          <div className="lg:col-span-6">
            <label
              htmlFor="final-signature-notes"
              className="block text-xs font-bold uppercase tracking-wider text-[#0F172A]"
            >
              Final Completion Note (Optional)
            </label>
            <textarea
              id="final-signature-notes"
              rows={4}
              maxLength={2000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional note recorded in the approval history and sent to the student organization..."
              className="mt-2 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2.5 text-xs leading-relaxed text-[#0F172A] focus:border-[#1E3A8A] focus:bg-white focus:outline-none"
            />
          </div>
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-800"
          >
            {errorMessage}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E2E8F0] pt-4">
          <span className="text-[11px] text-slate-500">
            Records your signature, responsible staff identity, and timestamp,
            then updates proposal status to Completed.
          </span>

          <button
            type="submit"
            disabled={isSubmitting || !hasSavedSignature}
            className="inline-flex items-center gap-2 rounded-full bg-[#0F172A] px-6 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-[#1E3A8A] disabled:opacity-50 cursor-pointer"
          >
            <span>
              {isSubmitting
                ? "Recording Final Signature..."
                : "Apply Final Signature & Complete"}
            </span>
          </button>
        </div>
      </form>
    </section>
  );
}
