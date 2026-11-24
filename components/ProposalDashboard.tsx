"use client";

import React, { useState } from "react";
import {
  CampusAccount,
  Proposal,
  ProposalStatus,
  SignaturePayload,
} from "./types";
import SignatureModal from "./SignatureModal";

interface ProposalDashboardProps {
  currentAccount: CampusAccount;
  proposals: Proposal[];
  selectedProposalId: string;
  onSelectProposal: (id: string) => void;
  onEditProposal: (proposal: Proposal) => void;
  onApproveAndSign: (proposalId: string, payload: SignaturePayload) => void;
  onRequestRevision: (proposalId: string, revisionNote: string) => void;
}

export default function ProposalDashboard({
  currentAccount,
  proposals,
  selectedProposalId,
  onSelectProposal,
  onEditProposal,
  onApproveAndSign,
  onRequestRevision,
}: ProposalDashboardProps) {
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [showRevisionForm, setShowRevisionForm] = useState<boolean>(false);
  const [showSignatureModal, setShowSignatureModal] = useState<boolean>(false);
  const [revisionNoteInput, setRevisionNoteInput] = useState<string>("");
  const [revisionError, setRevisionError] = useState<string>("");
  const [actionToast, setActionToast] = useState<string>("");

  const filteredProposals = proposals.filter((p) => {
    if (statusFilter === "ALL") return true;
    return p.status === statusFilter;
  });

  const activeProposal =
    proposals.find((p) => p.id === selectedProposalId) ?? proposals[0];

  const getStatusBadgeClasses = (status: ProposalStatus) => {
    switch (status) {
      case "Approved":
        return "bg-emerald-50 text-emerald-800 border-emerald-200";
      case "Needs Revision":
        return "bg-rose-50 text-rose-800 border-rose-200";
      case "Draft":
        return "bg-slate-100 text-slate-700 border-slate-300";
      case "Pending TTD":
      default:
        return "bg-[#1E3A8A]/10 text-[#1E3A8A] border-[#1E3A8A]/25";
    }
  };

  const currentApproverEntry = activeProposal?.approvers.find(
    (a) => a.email.toLowerCase() === currentAccount.email.toLowerCase()
  );

  const handleOpenSignatureModal = () => {
    if (!activeProposal) return;
    setShowRevisionForm(false);
    setShowSignatureModal(true);
  };

  const handleConfirmSignature = (payload: SignaturePayload) => {
    if (!activeProposal) return;
    onApproveAndSign(activeProposal.id, payload);
    setShowSignatureModal(false);
    setRevisionNoteInput("");
    setActionToast(
      payload.signatureType === "drawn"
        ? `Applied hand-drawn TTD signature & approved "${activeProposal.title}".`
        : `Applied Official Digital Stamp & approved "${activeProposal.title}".`
    );
  };

  const handleConfirmRevisionRequest = () => {
    if (!activeProposal) return;
    const trimmed = revisionNoteInput.trim();
    if (!trimmed) {
      setRevisionError(
        "A mandatory Revision Note is required so the Student Organization knows what to revise."
      );
      return;
    }
    setRevisionError("");
    onRequestRevision(activeProposal.id, trimmed);
    setShowRevisionForm(false);
    setRevisionNoteInput("");
    setActionToast(
      `Revision requested on "${activeProposal.title}". Returned to Submitter (${activeProposal.submitterEmail}).`
    );
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Page Heading */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0F172A]">
            Proposals Workspace
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Track submitted student organization proposals, digital signatures
            (TTD), and versioned revision logs.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
          <span className="rounded-full border border-[#E2E8F0] bg-white px-3 py-1 font-semibold text-[#0F172A]">
            {currentAccount.badgeText}
          </span>
        </div>
      </div>

      {/* Live Action Notification Toast */}
      {actionToast && (
        <div className="mb-6 flex items-center justify-between rounded-2xl border border-[#1E3A8A]/30 bg-[#1E3A8A]/5 px-5 py-3.5 text-xs font-semibold text-[#0F172A]">
          <div className="flex items-center gap-2.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#0F172A] text-white">
              ✓
            </span>
            <span>{actionToast}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionToast("")}
            className="text-xs font-bold text-[#1E3A8A] hover:underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Two-Column Dashboard Layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* LEFT COLUMN (5 cols): Proposal List & Status Filter */}
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-2xl border border-[#E2E8F0] bg-white p-4 shadow-2xs">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <h2 className="text-sm font-bold text-[#0F172A]">
                All Submissions ({filteredProposals.length})
              </h2>
              <span className="text-xs text-slate-500">AY 2026</span>
            </div>

            {/* Status Filter Pills */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {["ALL", "Pending TTD", "Needs Revision", "Approved", "Draft"].map(
                (st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition cursor-pointer ${
                      statusFilter === st
                        ? "bg-[#0F172A] text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {st === "ALL" ? "All" : st}
                  </button>
                )
              )}
            </div>

            {/* Proposal Cards List */}
            <div className="mt-4 space-y-3">
              {filteredProposals.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#E2E8F0] bg-[#F8FAFC] p-6 text-center text-xs text-slate-500">
                  No proposals match this status filter.
                </div>
              ) : (
                filteredProposals.map((item) => {
                  const isSelected = item.id === activeProposal?.id;
                  const signedCount = item.approvers.filter(
                    (a) => a.status === "Approved"
                  ).length;

                  return (
                    <div
                      key={item.id}
                      onClick={() => {
                        onSelectProposal(item.id);
                        setShowRevisionForm(false);
                        setRevisionError("");
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onSelectProposal(item.id);
                        }
                      }}
                      className={`rounded-2xl border p-4 transition cursor-pointer ${
                        isSelected
                          ? "border-[#1E3A8A] bg-[#0F172A]/[0.02] ring-2 ring-[#1E3A8A]/15"
                          : "border-[#E2E8F0] bg-white hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-slate-500">
                            {item.code}
                          </span>
                          <span className="rounded-full bg-[#0F172A] px-2 py-0.5 text-[10px] font-bold text-white">
                            v{item.version}.0
                          </span>
                        </div>

                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${getStatusBadgeClasses(
                            item.status
                          )}`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              item.status === "Approved"
                                ? "bg-emerald-600"
                                : item.status === "Needs Revision"
                                ? "bg-rose-600"
                                : item.status === "Draft"
                                ? "bg-slate-400"
                                : "bg-[#1E3A8A]"
                            }`}
                          />
                          {item.status}
                        </span>
                      </div>

                      <p className="mt-2 text-xs font-semibold text-[#1E3A8A]">
                        {item.organization}
                      </p>
                      <h3 className="mt-0.5 text-sm font-bold text-[#0F172A]">
                        {item.title}
                      </h3>

                      {item.status === "Needs Revision" &&
                        item.activeRevisionNote && (
                          <div className="mt-2.5 rounded-xl border border-rose-200 bg-rose-50/80 px-3 py-2 text-xs text-rose-900">
                            <span className="font-bold">Revision Note: </span>
                            <span className="line-clamp-2">
                              {item.activeRevisionNote.note}
                            </span>
                          </div>
                        )}

                      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs text-slate-500">
                        <span>{item.budgetSummary}</span>
                        <span className="font-semibold text-[#0F172A]">
                          TTD: {signedCount}/{item.approvers.length} Signed
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN (7 cols): Active Proposal Inspection, Role Actions & Read-Only Revision Log */}
        {activeProposal && (
          <div className="lg:col-span-7 space-y-6">
            {/* Primary Proposal Detail Card */}
            <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-2xs">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#E2E8F0] pb-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-slate-500">
                      {activeProposal.code}
                    </span>
                    <span className="rounded-full bg-[#0F172A] px-2.5 py-0.5 text-xs font-bold text-white">
                      v{activeProposal.version}.0
                    </span>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-0.5 text-xs font-semibold ${getStatusBadgeClasses(
                        activeProposal.status
                      )}`}
                    >
                      {activeProposal.status}
                    </span>
                  </div>
                  <p className="mt-2 text-xs font-bold uppercase tracking-wider text-[#1E3A8A]">
                    {activeProposal.organization}
                  </p>
                  <h2 className="mt-1 text-xl font-bold text-[#0F172A]">
                    {activeProposal.title}
                  </h2>
                </div>

                <div className="text-right text-xs text-slate-500">
                  <p>Last Updated</p>
                  <p className="font-mono font-semibold text-[#0F172A]">
                    {activeProposal.updatedAt}
                  </p>
                </div>
              </div>

              {/* Highlighted Revision Alert Block */}
              {activeProposal.status === "Needs Revision" &&
                activeProposal.activeRevisionNote && (
                  <div className="mt-5 rounded-2xl border border-rose-300 bg-gradient-to-r from-rose-50 via-amber-50/60 to-rose-50 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-rose-600 text-xs font-bold text-white">
                          !
                        </span>
                        <span className="text-xs font-bold uppercase tracking-wider text-rose-800">
                          Revision Requested by{" "}
                          {activeProposal.activeRevisionNote.requestedBy}
                        </span>
                      </div>
                      <span className="font-mono text-xs text-rose-700">
                        {activeProposal.activeRevisionNote.requestedAt}
                      </span>
                    </div>

                    <blockquote className="mt-2.5 rounded-xl border border-rose-200/80 bg-white/90 p-3.5 text-sm font-semibold text-slate-900">
                      &ldquo;{activeProposal.activeRevisionNote.note}&rdquo;
                    </blockquote>

                    <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs text-slate-600">
                        {currentAccount.id === "submitter"
                          ? `Edit this proposal and resubmit as v${
                              activeProposal.version + 1
                            }.0. Previously approved TTD steps remain valid.`
                          : `Awaiting revised v${
                              activeProposal.version + 1
                            }.0 submission from ${activeProposal.submitterEmail}.`}
                      </p>

                      {currentAccount.id === "submitter" && (
                        <button
                          type="button"
                          onClick={() => onEditProposal(activeProposal)}
                          className="inline-flex items-center gap-2 rounded-full bg-[#0F172A] px-5 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-[#1E3A8A] cursor-pointer"
                        >
                          Edit &amp; Resubmit (v{activeProposal.version} → v
                          {activeProposal.version + 1}) →
                        </button>
                      )}
                    </div>
                  </div>
                )}

              {/* Approver / TTD Action Console */}
              {currentAccount.id === "approver" &&
                activeProposal.status !== "Draft" && (
                  <div className="mt-5 rounded-2xl border border-[#1E3A8A]/25 bg-[#F8FAFC] p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <span className="text-xs font-bold uppercase tracking-wider text-[#1E3A8A]">
                          Approver / TTD Decision
                        </span>
                        <p className="mt-0.5 text-xs text-slate-600">
                          {currentApproverEntry?.status === "Approved"
                            ? `You have digitally signed this proposal (${currentApproverEntry.signatureHash}).`
                            : "Review the attached proposal and either Approve & Sign or Request Revision."}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2.5">
                        <button
                          type="button"
                          disabled={currentApproverEntry?.status === "Approved"}
                          onClick={handleOpenSignatureModal}
                          className="inline-flex items-center gap-1.5 rounded-full bg-[#0F172A] px-5 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-[#1E3A8A] disabled:opacity-40 cursor-pointer"
                        >
                          <svg
                            className="h-3.5 w-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2.5}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                          {currentApproverEntry?.status === "Approved"
                            ? "TTD Signed"
                            : "Approve & Sign"}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setShowRevisionForm(!showRevisionForm);
                            setRevisionError("");
                          }}
                          className="inline-flex items-center gap-1.5 rounded-full border border-rose-300 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-800 transition hover:bg-rose-100 cursor-pointer"
                        >
                          Request Revision
                        </button>
                      </div>
                    </div>

                    {showRevisionForm && (
                      <div className="mt-4 border-t border-[#E2E8F0] pt-4">
                        <label className="block text-xs font-bold uppercase tracking-wider text-rose-800">
                          Mandatory Revision Note *
                        </label>
                        <textarea
                          rows={3}
                          value={revisionNoteInput}
                          onChange={(e) => setRevisionNoteInput(e.target.value)}
                          placeholder="Specify exact budget adjustments, venue clearances, or document corrections required..."
                          className="mt-1.5 w-full rounded-xl border border-rose-300 bg-white px-3.5 py-2.5 text-sm text-[#0F172A] focus:border-rose-600 focus:outline-none"
                        />
                        {revisionError && (
                          <p className="mt-1.5 text-xs font-semibold text-rose-600">
                            {revisionError}
                          </p>
                        )}
                        <div className="mt-3 flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setShowRevisionForm(false);
                              setRevisionError("");
                            }}
                            className="rounded-full border border-[#E2E8F0] bg-white px-4 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleConfirmRevisionRequest}
                            className="rounded-full bg-rose-700 px-5 py-1.5 text-xs font-semibold text-white hover:bg-rose-800 transition cursor-pointer"
                          >
                            Send Revision Request
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

              {/* CC Stakeholder Read-Only Banner */}
              {currentAccount.id === "cc" && (
                <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-indigo-200 bg-indigo-50/60 px-4 py-3 text-xs text-indigo-950">
                  <div>
                    <span className="font-bold">CC Observer Access:</span> You
                    have read-only visibility into signature progress and
                    version change logs.
                  </div>
                  <span className="shrink-0 rounded-full border border-indigo-200 bg-white px-2.5 py-0.5 font-semibold text-indigo-800">
                    Read-Only
                  </span>
                </div>
              )}

              {/* Proposal Details Metadata Grid */}
              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3.5">
                  <span className="text-[11px] font-semibold uppercase text-slate-400">
                    Event Date
                  </span>
                  <p className="mt-1 text-sm font-bold text-[#0F172A]">
                    {activeProposal.eventDate}
                  </p>
                </div>
                <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3.5">
                  <span className="text-[11px] font-semibold uppercase text-slate-400">
                    Proposed Venue
                  </span>
                  <p className="mt-1 text-sm font-bold text-[#0F172A]">
                    {activeProposal.venue}
                  </p>
                </div>
                <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3.5">
                  <span className="text-[11px] font-semibold uppercase text-slate-400">
                    Total Budget
                  </span>
                  <p className="mt-1 text-sm font-bold text-[#1E3A8A]">
                    {activeProposal.budgetSummary}
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-3 text-sm">
                <div className="rounded-xl border border-[#E2E8F0] bg-white p-4">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Budget Breakdown
                  </span>
                  <p className="mt-1 text-xs leading-relaxed text-slate-700">
                    {activeProposal.budgetBreakdown}
                  </p>
                </div>

                <div className="rounded-xl border border-[#E2E8F0] bg-white p-4">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Executive Summary &amp; Reviewer Notes
                  </span>
                  <p className="mt-1 text-xs leading-relaxed text-slate-700">
                    {activeProposal.executiveSummary}
                  </p>
                  <p className="mt-2 border-t border-slate-100 pt-2 text-xs text-slate-500">
                    <strong className="text-slate-700">Notes:</strong>{" "}
                    {activeProposal.reviewerNotes}
                  </p>
                </div>

                {/* PDF Attachment Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0F172A] text-xs font-bold text-white">
                      PDF
                    </span>
                    <div>
                      <p className="text-xs font-bold text-[#0F172A]">
                        {activeProposal.attachmentName}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {activeProposal.attachmentSize} • Submitter:{" "}
                        {activeProposal.submitterEmail}
                      </p>
                    </div>
                  </div>

                  {currentAccount.id === "submitter" &&
                    (activeProposal.status === "Draft" ||
                      activeProposal.status === "Needs Revision") && (
                      <button
                        type="button"
                        onClick={() => onEditProposal(activeProposal)}
                        className="rounded-full border border-[#E2E8F0] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#0F172A] hover:bg-slate-100 transition cursor-pointer"
                      >
                        {activeProposal.status === "Draft"
                          ? "Continue Draft"
                          : "Edit & Resubmit"}
                      </button>
                    )}
                </div>
              </div>

              {/* Official Approval & Signature Sheet Grid */}
              <div className="mt-6 border-t border-[#E2E8F0] pt-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F172A]">
                      Official Approval &amp; Signature Sheet
                    </h3>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Signed TTD records (drawn signatures &amp; digital stamps)
                      remain preserved across v1 → v2 revisions.
                    </p>
                  </div>
                  <span className="rounded-full bg-[#0F172A]/5 px-2.5 py-1 text-[11px] font-semibold text-[#0F172A]">
                    {
                      activeProposal.approvers.filter(
                        (a) => a.status === "Approved"
                      ).length
                    }{" "}
                    / {activeProposal.approvers.length} Signed
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {activeProposal.approvers.map((signer, index) => (
                    <div
                      key={signer.id}
                      className={`flex flex-col justify-between rounded-2xl border p-4 ${
                        signer.status === "Approved"
                          ? "border-emerald-200/80 bg-white shadow-2xs"
                          : signer.status === "Needs Revision"
                          ? "border-rose-200 bg-rose-50/30"
                          : "border-[#E2E8F0] bg-[#F8FAFC]"
                      }`}
                    >
                      {/* Signer Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                              signer.status === "Approved"
                                ? "bg-[#0F172A] text-white"
                                : signer.status === "Needs Revision"
                                ? "bg-rose-600 text-white"
                                : "border border-slate-300 bg-white text-slate-700"
                            }`}
                          >
                            {signer.status === "Approved" ? "✓" : index + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-xs font-bold text-[#0F172A]">
                              {signer.role}
                            </p>
                            <p className="truncate text-[11px] text-slate-600">
                              {signer.name}
                            </p>
                          </div>
                        </div>

                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            signer.status === "Approved"
                              ? "bg-emerald-100 text-emerald-800"
                              : signer.status === "Needs Revision"
                              ? "bg-rose-100 text-rose-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {signer.status}
                        </span>
                      </div>

                      {/* Visual Signature / Stamp Area */}
                      <div className="mt-3">
                        {signer.status === "Approved" &&
                        signer.signatureType === "drawn" &&
                        signer.signatureImageUrl ? (
                          <div className="flex h-28 flex-col items-center justify-center rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-2">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={signer.signatureImageUrl}
                              alt={`Digital signature of ${signer.name}`}
                              className="max-h-20 max-w-full object-contain"
                            />
                            <span className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                              Hand-Drawn Digital TTD
                            </span>
                          </div>
                        ) : signer.status === "Approved" ? (
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
                                {signer.name}
                              </p>
                              <p className="truncate font-mono text-[10px] text-[#1E3A8A]">
                                {signer.email}
                              </p>
                            </div>
                          </div>
                        ) : signer.status === "Needs Revision" ? (
                          <div className="flex h-28 flex-col items-center justify-center rounded-xl border border-dashed border-rose-300 bg-white/70 p-3 text-center">
                            <span className="text-xs font-bold text-rose-700">
                              Revision Requested
                            </span>
                            <span className="mt-0.5 text-[11px] text-slate-500">
                              Awaiting resubmission before TTD sign-off
                            </span>
                          </div>
                        ) : (
                          <div className="flex h-28 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-3 text-center">
                            <span className="text-xs font-semibold text-slate-400">
                              Awaiting Digital TTD
                            </span>
                            <span className="mt-0.5 font-mono text-[10px] text-slate-400">
                              {signer.email}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Verification Metadata Footer */}
                      <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-2 text-[10px] text-slate-500">
                        <span className="truncate font-mono">
                          {signer.signatureHash ?? "Pending Verification"}
                        </span>
                        <span className="shrink-0 font-mono">
                          {signer.signedAt ?? "—"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* CC Stakeholders Row */}
                <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5">
                  <span className="text-xs font-bold text-[#0F172A]">
                    CC Stakeholders (Read-Only):
                  </span>
                  {activeProposal.ccList.map((cc) => (
                    <span
                      key={cc.id}
                      className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 font-mono text-[11px] text-slate-700"
                    >
                      {cc.email}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Read-Only Revision & Change Log Timeline Card */}
            <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-2xs">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] pb-4">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-[#1E3A8A]">
                    Audit Trail &amp; Version History
                  </span>
                  <h3 className="text-base font-bold text-[#0F172A]">
                    Revision &amp; Change Log Timeline
                  </h3>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  {activeProposal.history.length} Logged Events
                </span>
              </div>

              <div className="mt-5 space-y-4">
                {activeProposal.history.map((entry, idx) => {
                  const isRevisionReq =
                    entry.actionType === "revision_requested";
                  const isResubmit = entry.actionType === "resubmitted";
                  const isApproved = entry.actionType === "approved";

                  return (
                    <div
                      key={entry.id}
                      className="relative flex items-start gap-3.5"
                    >
                      {idx < activeProposal.history.length - 1 && (
                        <div className="absolute top-7 left-3.5 -bottom-4 w-px bg-[#E2E8F0]" />
                      )}

                      <span
                        className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                          isRevisionReq
                            ? "bg-rose-600 text-white"
                            : isResubmit
                            ? "bg-[#1E3A8A] text-white"
                            : isApproved
                            ? "bg-emerald-600 text-white"
                            : "bg-[#0F172A] text-white"
                        }`}
                      >
                        {isRevisionReq
                          ? "!"
                          : isResubmit
                          ? "↑"
                          : isApproved
                          ? "✓"
                          : "•"}
                      </span>

                      <div className="flex-1 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-[#0F172A] px-2 py-0.5 text-[10px] font-bold text-white">
                              v{entry.version}.0
                            </span>
                            <span className="text-xs font-bold text-[#0F172A]">
                              {entry.actorName}
                            </span>
                            <span className="font-mono text-[11px] text-slate-500">
                              ({entry.actorEmail})
                            </span>
                          </div>
                          <span className="font-mono text-[11px] text-slate-500">
                            {entry.timestamp}
                          </span>
                        </div>

                        <p className="mt-1.5 text-xs font-medium text-slate-700">
                          {entry.summary}
                        </p>

                        {entry.revisionNote && (
                          <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-900">
                            Revision Note: &ldquo;{entry.revisionNote}&rdquo;
                          </div>
                        )}

                        {entry.changesDiff && entry.changesDiff.length > 0 && (
                          <div className="mt-2.5 rounded-xl border border-[#1E3A8A]/20 bg-white p-3">
                            <p className="text-[11px] font-bold uppercase tracking-wider text-[#1E3A8A]">
                              Changes in v{entry.version}.0 (Prior TTD
                              Signatures Preserved):
                            </p>
                            <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs text-slate-700">
                              {entry.changesDiff.map((diffItem, dIdx) => (
                                <li key={dIdx}>{diffItem}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Interactive Digital Signature (TTD) Modal */}
      {activeProposal && (
        <SignatureModal
          key={`${activeProposal.id}-${showSignatureModal ? "open" : "closed"}`}
          isOpen={showSignatureModal}
          proposal={activeProposal}
          approver={currentAccount}
          onClose={() => setShowSignatureModal(false)}
          onConfirm={handleConfirmSignature}
        />
      )}
    </div>
  );
}
