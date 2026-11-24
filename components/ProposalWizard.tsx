"use client";

import React, { useState } from "react";
import {
  ApproverSigner,
  CampusAccount,
  CCStakeholder,
  PRESET_APPROVER_DIRECTORY,
  PRESET_CC_DIRECTORY,
  Proposal,
} from "./types";

interface ProposalWizardProps {
  currentAccount: CampusAccount;
  editingProposal?: Proposal | null;
  onCancel: () => void;
  onSaveDraft: (proposal: Proposal) => void;
  onSubmitProposal: (proposal: Proposal, changesDiff: string[]) => void;
}

const STEPPER_NODES = [
  { step: 1, label: "Proposal Details" },
  { step: 2, label: "Approvers (TTD) & CC" },
  { step: 3, label: "Review" },
  { step: 4, label: "Sign & Status" },
];

export default function ProposalWizard({
  currentAccount,
  editingProposal,
  onCancel,
  onSaveDraft,
  onSubmitProposal,
}: ProposalWizardProps) {
  const isResubmission = Boolean(
    editingProposal && editingProposal.status === "Needs Revision"
  );

  // Active top stepper node (1..4) and active collapsible accordion card (1..3, or 4 for final sign & status)
  const [activeStep, setActiveStep] = useState<number>(1);

  // Form states pre-populated either with editingProposal or Compsphere 2026 default mock data
  const [organization, setOrganization] = useState<string>(
    editingProposal?.organization ??
      "BEM President University & PUMA Computing"
  );
  const [title, setTitle] = useState<string>(
    editingProposal?.title ??
      "Compsphere 2026: National AI & Cybersecurity Symposium"
  );
  const [eventDate, setEventDate] = useState<string>(
    editingProposal?.eventDate ?? "2026-12-14"
  );
  const [venue, setVenue] = useState<string>(
    editingProposal?.venue ??
      "Charles Himawan Auditorium, President University"
  );
  const [budgetSummary, setBudgetSummary] = useState<string>(
    editingProposal?.budgetSummary ?? "IDR 24,500,000"
  );
  const [budgetBreakdown, setBudgetBreakdown] = useState<string>(
    editingProposal?.budgetBreakdown ??
      "Keynote Honorarium & Travel (IDR 9,000,000), Hackathon Prize Pool (IDR 10,000,000), Auditorium Multimedia (IDR 3,500,000), Delegate Kits (IDR 2,000,000)"
  );
  const [attachmentName, setAttachmentName] = useState<string>(
    editingProposal
      ? editingProposal.attachmentName.replace("_v1.pdf", "_v2.pdf")
      : "Proposal_Compsphere_2026.pdf"
  );
  const [attachmentSize, setAttachmentSize] = useState<string>(
    editingProposal?.attachmentSize ?? "2.4 MB"
  );

  // Step 2: Mandatory Approvers (TTD) and Read-Only CC Stakeholders
  const [approvers, setApprovers] = useState<ApproverSigner[]>(
    editingProposal?.approvers ?? [
      {
        id: "app-puma",
        name: "PUMA Computing Chairperson",
        role: "PUMA / PUFA Chair",
        email: "puma.computing@student.president.ac.id",
        status: "Pending TTD",
      },
      {
        id: "app-advisor",
        name: "Dr. Rila Mandala, M.Eng.",
        role: "Faculty Advisor",
        email: "dean.computing@president.ac.id",
        status: "Pending TTD",
      },
      {
        id: "app-sa",
        name: "Directorate of Student Affairs",
        role: "Student Affairs (TTD)",
        email: "student.affairs@president.ac.id",
        status: "Pending TTD",
      },
    ]
  );

  const [ccList, setCcList] = useState<CCStakeholder[]>(
    editingProposal?.ccList ?? [
      {
        id: "cc-1",
        name: "Faculty Advisor — IT",
        role: "CC Stakeholder (Read-Only)",
        email: "advisor.it@president.ac.id",
      },
      {
        id: "cc-2",
        name: "Campus Finance & Treasury",
        role: "Budget CC",
        email: "finance.bureau@president.ac.id",
      },
    ]
  );

  // Custom email input states for Step 2
  const [newApproverName, setNewApproverName] = useState("");
  const [newApproverRole, setNewApproverRole] = useState("Faculty Advisor");
  const [newApproverEmail, setNewApproverEmail] = useState("");
  const [approverInputError, setApproverInputError] = useState("");

  const [newCcName, setNewCcName] = useState("");
  const [newCcEmail, setNewCcEmail] = useState("");
  const [ccInputError, setCcInputError] = useState("");

  // Step 3: Submission Notes & Scope
  const [executiveSummary, setExecutiveSummary] = useState<string>(
    editingProposal?.executiveSummary ??
      "Annual flagship technology symposium and 24-hour national hackathon hosting 250+ student delegates across Indonesia, featuring industry keynotes and AI workshops."
  );
  const [reviewerNotes, setReviewerNotes] = useState<string>(
    editingProposal?.reviewerNotes ??
      "Endorsed by PUMA Computing and BEM Executive Board. Sponsorship covers 40% of total expenditure; requesting university institutional allocation for the remainder."
  );

  // Submitter digital endorsement checkbox in Step 4
  const [submitterSigned, setSubmitterSigned] = useState<boolean>(true);
  const [feedbackBanner, setFeedbackBanner] = useState<string>("");

  const isValidCampusEmail = (email: string) => {
    const trimmed = email.trim().toLowerCase();
    return (
      trimmed.endsWith("@president.ac.id") ||
      trimmed.endsWith("@student.president.ac.id")
    );
  };

  const handleAddApprover = () => {
    setApproverInputError("");
    const trimmedEmail = newApproverEmail.trim().toLowerCase();
    if (!trimmedEmail) {
      setApproverInputError("Please enter a campus email address.");
      return;
    }
    if (!isValidCampusEmail(trimmedEmail)) {
      setApproverInputError(
        "Email must use @president.ac.id or @student.president.ac.id domain."
      );
      return;
    }
    if (approvers.some((a) => a.email.toLowerCase() === trimmedEmail)) {
      setApproverInputError("This signer is already in the TTD approval chain.");
      return;
    }

    const added: ApproverSigner = {
      id: `sig-custom-${Date.now()}`,
      name:
        newApproverName.trim() ||
        trimmedEmail.split("@")[0].replace(".", " ").toUpperCase(),
      role: newApproverRole,
      email: trimmedEmail,
      status: "Pending TTD",
    };

    setApprovers([...approvers, added]);
    setNewApproverName("");
    setNewApproverEmail("");
  };

  const handleTogglePresetApprover = (
    preset: Omit<ApproverSigner, "status">
  ) => {
    const exists = approvers.find(
      (a) => a.email.toLowerCase() === preset.email.toLowerCase()
    );
    if (exists) {
      // Do not remove already approved signers during a revision loop
      if (isResubmission && exists.status === "Approved") return;
      if (approvers.length <= 1) return;
      setApprovers(approvers.filter((a) => a.email !== preset.email));
    } else {
      setApprovers([
        ...approvers,
        {
          ...preset,
          status: "Pending TTD",
        },
      ]);
    }
  };

  const handleAddCc = () => {
    setCcInputError("");
    const trimmedEmail = newCcEmail.trim().toLowerCase();
    if (!trimmedEmail) {
      setCcInputError("Please enter a CC stakeholder email.");
      return;
    }
    if (!isValidCampusEmail(trimmedEmail)) {
      setCcInputError(
        "CC email must use @president.ac.id or @student.president.ac.id."
      );
      return;
    }
    if (ccList.some((c) => c.email.toLowerCase() === trimmedEmail)) {
      setCcInputError("This recipient is already in the CC list.");
      return;
    }

    const added: CCStakeholder = {
      id: `cc-custom-${Date.now()}`,
      name:
        newCcName.trim() ||
        trimmedEmail.split("@")[0].replace(".", " ").toUpperCase(),
      role: "CC Stakeholder (Read-Only)",
      email: trimmedEmail,
    };
    setCcList([...ccList, added]);
    setNewCcName("");
    setNewCcEmail("");
  };

  const handleTogglePresetCc = (preset: CCStakeholder) => {
    const exists = ccList.some(
      (c) => c.email.toLowerCase() === preset.email.toLowerCase()
    );
    if (exists) {
      setCcList(ccList.filter((c) => c.email !== preset.email));
    } else {
      setCcList([...ccList, preset]);
    }
  };

  const buildProposalPayload = (targetStatus: "Draft" | "Pending TTD"): {
    proposal: Proposal;
    diffs: string[];
  } => {
    const nextVersion = isResubmission
      ? (editingProposal?.version ?? 1) + 1
      : editingProposal?.version ?? 1;

    const diffs: string[] = [];
    if (editingProposal) {
      if (editingProposal.budgetSummary !== budgetSummary) {
        diffs.push(
          `Budget Summary updated: ${editingProposal.budgetSummary} → ${budgetSummary}`
        );
      }
      if (editingProposal.budgetBreakdown !== budgetBreakdown) {
        diffs.push("Budget Breakdown modified to comply with revision notes");
      }
      if (editingProposal.attachmentName !== attachmentName) {
        diffs.push(
          `Proposal PDF updated: ${editingProposal.attachmentName} → ${attachmentName}`
        );
      }
      if (editingProposal.executiveSummary !== executiveSummary) {
        diffs.push("Executive Summary updated with compliance details");
      }
      if (editingProposal.reviewerNotes !== reviewerNotes) {
        diffs.push("Reviewer Notes updated");
      }
      if (diffs.length === 0) {
        diffs.push(
          `Clarified proposal terms and resubmitted as v${nextVersion}.0`
        );
      }
    }

    // Preserve already-Approved TTD steps on resubmission so previous signers don't need to re-sign
    const updatedApprovers: ApproverSigner[] = approvers.map((a) => {
      if (a.status === "Approved") {
        return a;
      }
      return {
        ...a,
        status: "Pending TTD",
      };
    });

    const nowFormatted = "2026-11-24 16:10 WIB";

    const newHistoryEntry = isResubmission
      ? {
          id: `hist-${Date.now()}`,
          timestamp: nowFormatted,
          actorName: currentAccount.name,
          actorEmail: currentAccount.email,
          actorRole: "Submitter",
          actionType: "resubmitted" as const,
          version: nextVersion,
          summary: `Resubmitted Proposal (v${editingProposal?.version} → v${nextVersion}) addressing revision notes. Previously approved TTD steps remain valid.`,
          changesDiff: diffs,
        }
      : {
          id: `hist-${Date.now()}`,
          timestamp: nowFormatted,
          actorName: currentAccount.name,
          actorEmail: currentAccount.email,
          actorRole: "Submitter",
          actionType: "submitted" as const,
          version: nextVersion,
          summary:
            targetStatus === "Draft"
              ? `Saved draft v${nextVersion} (${attachmentName}).`
              : `Submitted proposal v${nextVersion} with ${attachmentName} to ${updatedApprovers.length} TTD signers.`,
        };

    const proposal: Proposal = {
      id: editingProposal?.id ?? `prop-${Date.now()}`,
      code:
        editingProposal?.code ??
        `PU-PROP-2026-0${Math.floor(20 + Math.random() * 70)}`,
      organization,
      submitterEmail: currentAccount.email,
      title,
      eventDate,
      venue,
      budgetSummary,
      budgetBreakdown,
      attachmentName,
      attachmentSize,
      executiveSummary,
      reviewerNotes,
      status: targetStatus,
      version: nextVersion,
      updatedAt: nowFormatted,
      activeRevisionNote:
        targetStatus === "Pending TTD"
          ? undefined
          : editingProposal?.activeRevisionNote,
      approvers: updatedApprovers,
      ccList,
      history: editingProposal
        ? [...editingProposal.history, newHistoryEntry]
        : [newHistoryEntry],
    };

    return { proposal, diffs };
  };

  const handleSaveAsDraftClick = () => {
    const { proposal } = buildProposalPayload("Draft");
    setFeedbackBanner("Draft saved to your Student Organization workspace.");
    onSaveDraft(proposal);
  };

  const handleFinalSubmitClick = () => {
    const { proposal, diffs } = buildProposalPayload("Pending TTD");
    onSubmitProposal(proposal, diffs);
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Top Bar with "Cancel", "Save as draft", and primary deep navy pill button "Submit Proposal" */}
      <div className="sticky top-4 z-20 mb-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#E2E8F0] bg-white/95 px-5 py-4 shadow-sm backdrop-blur-md">
        <div className="flex items-center gap-3.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#0F172A] text-xs font-bold tracking-wider text-white">
            PU
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <span className="rounded-full bg-[#0F172A] px-3 py-0.5 text-xs font-bold text-white">
                {isResubmission
                  ? `Resubmitting v${editingProposal?.version} → v${
                      (editingProposal?.version ?? 1) + 1
                    }`
                  : "New Proposal"}
              </span>
              <span className="font-mono text-xs text-slate-500">
                {editingProposal?.code ?? "PU-PROP-2026-NEW"}
              </span>
            </div>
            <h1 className="mt-1 text-base font-bold text-[#0F172A] sm:text-lg">
              {title || "Untitled Student Organization Proposal"}
            </h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-[#E2E8F0] bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSaveAsDraftClick}
            className="rounded-full border border-[#1E3A8A]/30 bg-[#1E3A8A]/5 px-4 py-2 text-xs font-semibold text-[#1E3A8A] transition hover:bg-[#1E3A8A]/10 cursor-pointer"
          >
            Save as draft
          </button>
          <button
            type="button"
            onClick={handleFinalSubmitClick}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#0F172A] px-5 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-[#1E3A8A] cursor-pointer"
          >
            <span>
              {isResubmission
                ? `Submit Revised Proposal (v${
                    (editingProposal?.version ?? 1) + 1
                  })`
                : "Submit Proposal"}
            </span>
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
          </button>
        </div>
      </div>

      {/* Highlighted Revision Alert Banner if Submitter is editing a "Needs Revision" proposal */}
      {isResubmission && editingProposal?.activeRevisionNote && (
        <div className="mb-8 rounded-2xl border border-rose-300 bg-gradient-to-r from-rose-50 via-amber-50/70 to-rose-50 p-5 shadow-xs">
          <div className="flex items-start gap-3.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-600 text-white font-bold text-sm">
              !
            </span>
            <div className="flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-rose-800">
                  Action Required • Revision Requested by{" "}
                  {editingProposal.activeRevisionNote.requestedBy}
                </span>
                <span className="font-mono text-xs text-rose-700">
                  {editingProposal.activeRevisionNote.requestedAt}
                </span>
              </div>
              <p className="mt-1.5 text-sm font-semibold text-slate-900">
                &ldquo;{editingProposal.activeRevisionNote.note}&rdquo;
              </p>
              <p className="mt-2 text-xs text-slate-600">
                Edit the relevant fields below and click{" "}
                <strong>
                  Submit Revised Proposal (v
                  {(editingProposal.version ?? 1) + 1})
                </strong>
                . Signers who already approved Step 1 TTD are preserved and do
                not need to re-sign.
              </p>
            </div>
          </div>
        </div>
      )}

      {feedbackBanner && (
        <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800">
          {feedbackBanner}
        </div>
      )}

      {/* Horizontal 4-node progress stepper: 1. Proposal Details -> 2. Approvers (TTD) & CC -> 3. Review -> 4. Sign & Status */}
      <div className="mb-8 rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-2xs">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          {STEPPER_NODES.map((node, index) => {
            const isCurrent = activeStep === node.step;
            const isCompleted = activeStep > node.step;

            return (
              <button
                key={node.step}
                type="button"
                onClick={() => setActiveStep(node.step)}
                className={`group flex items-center gap-3 rounded-xl p-2.5 text-left transition cursor-pointer ${
                  isCurrent
                    ? "bg-[#0F172A]/[0.04] ring-1 ring-[#1E3A8A]/30"
                    : "hover:bg-slate-50"
                }`}
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition ${
                    isCurrent
                      ? "bg-[#0F172A] text-white ring-4 ring-[#1E3A8A]/15"
                      : isCompleted
                      ? "bg-[#1E3A8A] text-white"
                      : "border border-slate-300 bg-white text-slate-600"
                  }`}
                >
                  {isCompleted ? "✓" : node.step}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Step {node.step} of 4
                  </p>
                  <p
                    className={`truncate text-xs font-bold ${
                      isCurrent || isCompleted
                        ? "text-[#0F172A]"
                        : "text-slate-500"
                    }`}
                  >
                    {node.label}
                  </p>
                </div>
                {index < STEPPER_NODES.length - 1 && (
                  <span className="hidden text-slate-300 sm:inline">→</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Numbered Collapsible White Accordion Cards */}
      <div className="space-y-4">
        {/* ACCORDION CARD 1: Event & Basic Information */}
        <div
          className={`rounded-2xl border bg-white transition-all duration-200 ${
            activeStep === 1
              ? "border-[#1E3A8A] shadow-md shadow-slate-900/5"
              : "border-[#E2E8F0]"
          }`}
        >
          <button
            type="button"
            onClick={() => setActiveStep(1)}
            className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left cursor-pointer"
          >
            <div className="flex items-center gap-3.5">
              {/* Active navy radio-dot indicator */}
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                  activeStep === 1
                    ? "border-[#1E3A8A] bg-[#1E3A8A]/10"
                    : "border-slate-300 bg-white"
                }`}
              >
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    activeStep === 1 ? "bg-[#0F172A]" : "bg-transparent"
                  }`}
                />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#1E3A8A]">
                    1. Event &amp; Basic Information
                  </span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-700">
                    {attachmentName}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  Organization name, Event title, Event date, Budget summary,
                  and official PDF proposal attachment.
                </p>
              </div>
            </div>
            <span className="text-xs font-semibold text-[#1E3A8A]">
              {activeStep === 1 ? "Expanded" : "Edit Step 1"}
            </span>
          </button>

          {activeStep === 1 && (
            <div className="border-t border-[#E2E8F0] px-6 pt-5 pb-6">
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-[#0F172A] uppercase tracking-wider">
                    Student Organization Name
                  </label>
                  <input
                    type="text"
                    value={organization}
                    onChange={(e) => setOrganization(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2.5 text-sm font-medium text-[#0F172A] focus:border-[#1E3A8A] focus:bg-white focus:outline-none"
                    placeholder="e.g., BEM President University"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#0F172A] uppercase tracking-wider">
                    Event Title
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2.5 text-sm font-medium text-[#0F172A] focus:border-[#1E3A8A] focus:bg-white focus:outline-none"
                    placeholder="e.g., Compsphere 2026"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#0F172A] uppercase tracking-wider">
                    Event Date
                  </label>
                  <input
                    type="date"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2.5 text-sm font-medium text-[#0F172A] focus:border-[#1E3A8A] focus:bg-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#0F172A] uppercase tracking-wider">
                    Proposed Venue
                  </label>
                  <input
                    type="text"
                    value={venue}
                    onChange={(e) => setVenue(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2.5 text-sm font-medium text-[#0F172A] focus:border-[#1E3A8A] focus:bg-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#0F172A] uppercase tracking-wider">
                    Total Budget Summary
                  </label>
                  <input
                    type="text"
                    value={budgetSummary}
                    onChange={(e) => setBudgetSummary(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2.5 text-sm font-bold text-[#0F172A] focus:border-[#1E3A8A] focus:bg-white focus:outline-none"
                    placeholder="IDR 24,500,000"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#0F172A] uppercase tracking-wider">
                    Submitter Account
                  </label>
                  <input
                    type="text"
                    disabled
                    value={`${currentAccount.name} (${currentAccount.email})`}
                    className="mt-1.5 w-full rounded-xl border border-[#E2E8F0] bg-slate-100 px-3.5 py-2.5 text-sm font-mono text-slate-600"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-[#0F172A] uppercase tracking-wider">
                    Key Budget Allocation Breakdown
                  </label>
                  <textarea
                    rows={2}
                    value={budgetBreakdown}
                    onChange={(e) => setBudgetBreakdown(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2.5 text-sm text-[#0F172A] focus:border-[#1E3A8A] focus:bg-white focus:outline-none"
                  />
                </div>

                {/* Mock PDF Proposal Attachment */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-[#0F172A] uppercase tracking-wider">
                    Proposal Document Attachment (PDF)
                  </label>
                  <div className="mt-1.5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-dashed border-[#1E3A8A]/40 bg-[#F8FAFC] p-4">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0F172A] text-xs font-bold text-white">
                        PDF
                      </span>
                      <div>
                        <p className="text-sm font-bold text-[#0F172A]">
                          {attachmentName}
                        </p>
                        <p className="text-xs text-slate-500">
                          {attachmentSize} • Complete RKA &amp; Event Rundown
                          Bundle
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const nextName =
                            attachmentName === "Proposal_Compsphere_2026.pdf"
                              ? "Proposal_Compsphere_2026_Revised_v2.pdf"
                              : "Proposal_Compsphere_2026.pdf";
                          setAttachmentName(nextName);
                          setAttachmentSize("2.6 MB");
                        }}
                        className="rounded-full border border-[#E2E8F0] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#0F172A] hover:bg-slate-100 transition cursor-pointer"
                      >
                        Switch Mock PDF Version
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  onClick={() => setActiveStep(2)}
                  className="inline-flex items-center gap-2 rounded-full bg-[#0F172A] px-6 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-[#1E3A8A] cursor-pointer"
                >
                  Next
                  <span>→</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ACCORDION CARD 2: Approvers (TTD) & CC Recipients */}
        <div
          className={`rounded-2xl border bg-white transition-all duration-200 ${
            activeStep === 2
              ? "border-[#1E3A8A] shadow-md shadow-slate-900/5"
              : "border-[#E2E8F0]"
          }`}
        >
          <button
            type="button"
            onClick={() => setActiveStep(2)}
            className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left cursor-pointer"
          >
            <div className="flex items-center gap-3.5">
              {/* Active navy radio-dot indicator */}
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                  activeStep === 2
                    ? "border-[#1E3A8A] bg-[#1E3A8A]/10"
                    : "border-slate-300 bg-white"
                }`}
              >
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    activeStep === 2 ? "bg-[#0F172A]" : "bg-transparent"
                  }`}
                />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#1E3A8A]">
                    2. Approvers (TTD) &amp; CC Recipients
                  </span>
                  <span className="rounded-full bg-[#1E3A8A]/10 px-2.5 py-0.5 text-[11px] font-semibold text-[#1E3A8A]">
                    {approvers.length} Signers • {ccList.length} CC
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  Separate mandatory Signers / Approvers (TTD) from read-only CC
                  Stakeholders (@president.ac.id / @student.president.ac.id).
                </p>
              </div>
            </div>
            <span className="text-xs font-semibold text-[#1E3A8A]">
              {activeStep === 2 ? "Expanded" : "Edit Step 2"}
            </span>
          </button>

          {activeStep === 2 && (
            <div className="border-t border-[#E2E8F0] px-6 pt-5 pb-6">
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* LEFT PANEL: Mandatory Signers / Approvers (TTD) */}
                <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-5">
                  <div className="flex items-center justify-between">
                    <span className="rounded-full bg-[#0F172A] px-3 py-1 text-xs font-bold text-white">
                      Mandatory Signers / Approvers (TTD)
                    </span>
                    <span className="text-xs font-medium text-slate-500">
                      Sequential Digital Signature
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-600">
                    Each selected officer must digitally sign (TTD) or request
                    revisions before final clearance.
                  </p>

                  {/* Quick-select campus directory presets */}
                  <div className="mt-3.5">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Quick-Select Campus Signers
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {PRESET_APPROVER_DIRECTORY.map((preset) => {
                        const isSelected = approvers.some(
                          (a) =>
                            a.email.toLowerCase() === preset.email.toLowerCase()
                        );
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => handleTogglePresetApprover(preset)}
                            className={`rounded-full px-3 py-1 text-xs font-semibold transition cursor-pointer ${
                              isSelected
                                ? "bg-[#1E3A8A] text-white"
                                : "border border-[#E2E8F0] bg-white text-slate-700 hover:bg-slate-100"
                            }`}
                          >
                            {isSelected ? "✓ " : "+ "}
                            {preset.role}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Active Approver Chain List */}
                  <div className="mt-4 space-y-2">
                    {approvers.map((signer, index) => (
                      <div
                        key={signer.id}
                        className="flex items-center justify-between gap-2 rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-2.5"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0F172A] text-[11px] font-bold text-white">
                            {index + 1}
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-xs font-bold text-[#0F172A]">
                                {signer.name}
                              </p>
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                                {signer.role}
                              </span>
                            </div>
                            <p className="truncate font-mono text-[11px] text-[#1E3A8A]">
                              {signer.email}
                            </p>
                          </div>
                        </div>

                        {signer.status === "Approved" ? (
                          <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                            Signed (Preserved)
                          </span>
                        ) : (
                          approvers.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                setApprovers(
                                  approvers.filter((a) => a.id !== signer.id)
                                )
                              }
                              className="text-xs font-semibold text-rose-600 hover:underline cursor-pointer"
                            >
                              Remove
                            </button>
                          )
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Add Custom Campus Signer Email Input */}
                  <div className="mt-4 border-t border-[#E2E8F0] pt-3.5">
                    <p className="text-xs font-bold text-[#0F172A]">
                      Add Signer by Campus Email
                    </p>
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <input
                        type="text"
                        value={newApproverName}
                        onChange={(e) => setNewApproverName(e.target.value)}
                        placeholder="Officer / Title Name"
                        className="rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-xs text-[#0F172A] focus:border-[#1E3A8A] focus:outline-none"
                      />
                      <select
                        value={newApproverRole}
                        onChange={(e) => setNewApproverRole(e.target.value)}
                        className="rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-xs font-medium text-[#0F172A] focus:border-[#1E3A8A] focus:outline-none"
                      >
                        <option value="PUMA / PUFA Chair">
                          PUMA / PUFA Chair
                        </option>
                        <option value="Faculty Advisor">Faculty Advisor</option>
                        <option value="Student Affairs (TTD)">
                          Student Affairs (TTD)
                        </option>
                        <option value="Vice Rector III">Vice Rector III</option>
                      </select>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <input
                        type="email"
                        value={newApproverEmail}
                        onChange={(e) => setNewApproverEmail(e.target.value)}
                        placeholder="officer@president.ac.id"
                        className="flex-1 rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 font-mono text-xs text-[#0F172A] focus:border-[#1E3A8A] focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleAddApprover}
                        className="rounded-full bg-[#0F172A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E3A8A] transition cursor-pointer"
                      >
                        Add TTD
                      </button>
                    </div>
                    {approverInputError && (
                      <p className="mt-1.5 text-xs font-medium text-rose-600">
                        {approverInputError}
                      </p>
                    )}
                  </div>
                </div>

                {/* RIGHT PANEL: CC Stakeholders (Read-Only Observers) */}
                <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-5">
                  <div className="flex items-center justify-between">
                    <span className="rounded-full border border-[#1E3A8A]/30 bg-[#1E3A8A]/10 px-3 py-1 text-xs font-bold text-[#1E3A8A]">
                      CC Stakeholders (Read-Only Observers)
                    </span>
                    <span className="text-xs font-medium text-slate-500">
                      Non-Blocking Copy
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-600">
                    CC recipients receive live status updates and full revision
                    changelogs without blocking or signing the proposal.
                  </p>

                  {/* Quick-select CC directory presets */}
                  <div className="mt-3.5">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Quick-Select Campus CC Observers
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {PRESET_CC_DIRECTORY.map((preset) => {
                        const isSelected = ccList.some(
                          (c) =>
                            c.email.toLowerCase() === preset.email.toLowerCase()
                        );
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => handleTogglePresetCc(preset)}
                            className={`rounded-full px-3 py-1 text-xs font-semibold transition cursor-pointer ${
                              isSelected
                                ? "bg-[#0F172A] text-white"
                                : "border border-[#E2E8F0] bg-white text-slate-700 hover:bg-slate-100"
                            }`}
                          >
                            {isSelected ? "✓ " : "+ "}
                            {preset.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Active CC List */}
                  <div className="mt-4 space-y-2">
                    {ccList.map((cc) => (
                      <div
                        key={cc.id}
                        className="flex items-center justify-between gap-2 rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-2.5"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-xs font-bold text-[#0F172A]">
                              {cc.name}
                            </p>
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                              Read-Only CC
                            </span>
                          </div>
                          <p className="truncate font-mono text-[11px] text-slate-500">
                            {cc.email}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            setCcList(ccList.filter((item) => item.id !== cc.id))
                          }
                          className="text-xs font-semibold text-slate-400 hover:text-rose-600 cursor-pointer"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Add Custom CC Email Input */}
                  <div className="mt-4 border-t border-[#E2E8F0] pt-3.5">
                    <p className="text-xs font-bold text-[#0F172A]">
                      Add CC Stakeholder by Campus Email
                    </p>
                    <div className="mt-2">
                      <input
                        type="text"
                        value={newCcName}
                        onChange={(e) => setNewCcName(e.target.value)}
                        placeholder="Department / Observer Name (optional)"
                        className="w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-xs text-[#0F172A] focus:border-[#1E3A8A] focus:outline-none"
                      />
                    </div>
                    <div className="mt-2 flex gap-2">
                      <input
                        type="email"
                        value={newCcEmail}
                        onChange={(e) => setNewCcEmail(e.target.value)}
                        placeholder="advisor.it@president.ac.id"
                        className="flex-1 rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 font-mono text-xs text-[#0F172A] focus:border-[#1E3A8A] focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleAddCc}
                        className="rounded-full bg-[#0F172A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E3A8A] transition cursor-pointer"
                      >
                        Add CC
                      </button>
                    </div>
                    {ccInputError && (
                      <p className="mt-1.5 text-xs font-medium text-rose-600">
                        {ccInputError}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-between">
                <button
                  type="button"
                  onClick={() => setActiveStep(1)}
                  className="rounded-full border border-[#E2E8F0] bg-white px-5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  ← Previous
                </button>
                <button
                  type="button"
                  onClick={() => setActiveStep(3)}
                  className="inline-flex items-center gap-2 rounded-full bg-[#0F172A] px-6 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-[#1E3A8A] cursor-pointer"
                >
                  Next
                  <span>→</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ACCORDION CARD 3: Submission Notes & Scope */}
        <div
          className={`rounded-2xl border bg-white transition-all duration-200 ${
            activeStep === 3
              ? "border-[#1E3A8A] shadow-md shadow-slate-900/5"
              : "border-[#E2E8F0]"
          }`}
        >
          <button
            type="button"
            onClick={() => setActiveStep(3)}
            className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left cursor-pointer"
          >
            <div className="flex items-center gap-3.5">
              {/* Active navy radio-dot indicator */}
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                  activeStep === 3
                    ? "border-[#1E3A8A] bg-[#1E3A8A]/10"
                    : "border-slate-300 bg-white"
                }`}
              >
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    activeStep === 3 ? "bg-[#0F172A]" : "bg-transparent"
                  }`}
                />
              </span>
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-[#1E3A8A]">
                  3. Submission Notes &amp; Scope
                </span>
                <p className="mt-0.5 text-xs text-slate-500">
                  Executive summary, program objectives, and notes for TTD
                  reviewers.
                </p>
              </div>
            </div>
            <span className="text-xs font-semibold text-[#1E3A8A]">
              {activeStep === 3 ? "Expanded" : "Edit Step 3"}
            </span>
          </button>

          {activeStep === 3 && (
            <div className="border-t border-[#E2E8F0] px-6 pt-5 pb-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-[#0F172A] uppercase tracking-wider">
                    Executive Summary &amp; Event Scope
                  </label>
                  <textarea
                    rows={3}
                    value={executiveSummary}
                    onChange={(e) => setExecutiveSummary(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2.5 text-sm text-[#0F172A] focus:border-[#1E3A8A] focus:bg-white focus:outline-none"
                    placeholder="Summarize event goals, target participants, and expected outcomes..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#0F172A] uppercase tracking-wider">
                    Notes for Reviewers &amp; Revision Response
                  </label>
                  <textarea
                    rows={3}
                    value={reviewerNotes}
                    onChange={(e) => setReviewerNotes(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2.5 text-sm text-[#0F172A] focus:border-[#1E3A8A] focus:bg-white focus:outline-none"
                    placeholder="Add context for Faculty Advisor and Directorate of Student Affairs..."
                  />
                </div>
              </div>

              <div className="mt-6 flex justify-between">
                <button
                  type="button"
                  onClick={() => setActiveStep(2)}
                  className="rounded-full border border-[#E2E8F0] bg-white px-5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  ← Previous
                </button>
                <button
                  type="button"
                  onClick={() => setActiveStep(4)}
                  className="inline-flex items-center gap-2 rounded-full bg-[#0F172A] px-6 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-[#1E3A8A] cursor-pointer"
                >
                  Next
                  <span>→</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ACCORDION CARD 4: Sign & Status Confirmation (Node 4 of Stepper) */}
        <div
          className={`rounded-2xl border bg-white transition-all duration-200 ${
            activeStep === 4
              ? "border-[#1E3A8A] shadow-md shadow-slate-900/5"
              : "border-[#E2E8F0]"
          }`}
        >
          <button
            type="button"
            onClick={() => setActiveStep(4)}
            className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left cursor-pointer"
          >
            <div className="flex items-center gap-3.5">
              {/* Active navy radio-dot indicator */}
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                  activeStep === 4
                    ? "border-[#1E3A8A] bg-[#1E3A8A]/10"
                    : "border-slate-300 bg-white"
                }`}
              >
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    activeStep === 4 ? "bg-[#0F172A]" : "bg-transparent"
                  }`}
                />
              </span>
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-[#1E3A8A]">
                  4. Sign &amp; Status Dispatch
                </span>
                <p className="mt-0.5 text-xs text-slate-500">
                  Verify complete proposal package, attach Submitter signature,
                  and dispatch to TTD Signers &amp; CC Stakeholders.
                </p>
              </div>
            </div>
            <span className="text-xs font-semibold text-[#1E3A8A]">
              {activeStep === 4 ? "Ready to Submit" : "Preview Step 4"}
            </span>
          </button>

          {activeStep === 4 && (
            <div className="border-t border-[#E2E8F0] px-6 pt-5 pb-6">
              <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <span className="text-[11px] font-semibold uppercase text-slate-400">
                      Organization &amp; Title
                    </span>
                    <p className="mt-0.5 text-xs font-bold text-[#0F172A]">
                      {title}
                    </p>
                    <p className="text-xs text-slate-500">{organization}</p>
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold uppercase text-slate-400">
                      Schedule &amp; Budget
                    </span>
                    <p className="mt-0.5 text-xs font-bold text-[#0F172A]">
                      {eventDate} • {budgetSummary}
                    </p>
                    <p className="text-xs text-slate-500">{venue}</p>
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold uppercase text-slate-400">
                      Attached Proposal File
                    </span>
                    <p className="mt-0.5 text-xs font-bold text-[#1E3A8A]">
                      {attachmentName} ({attachmentSize})
                    </p>
                    <p className="text-xs text-slate-500">
                      Target Version: v
                      {isResubmission
                        ? (editingProposal?.version ?? 1) + 1
                        : editingProposal?.version ?? 1}
                      .0
                    </p>
                  </div>
                </div>

                <div className="mt-4 border-t border-[#E2E8F0] pt-4">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={submitterSigned}
                      onChange={(e) => setSubmitterSigned(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#0F172A] focus:ring-[#1E3A8A]"
                    />
                    <span className="text-xs text-slate-700">
                      I digitally endorse this submission on behalf of{" "}
                      <strong className="text-[#0F172A]">{organization}</strong>{" "}
                      ({currentAccount.email}) and authorize routing to{" "}
                      <strong>{approvers.length} Approvers (TTD)</strong> and{" "}
                      <strong>{ccList.length} CC Stakeholders</strong>.
                    </span>
                  </label>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setActiveStep(3)}
                  className="rounded-full border border-[#E2E8F0] bg-white px-5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  ← Previous
                </button>

                <button
                  type="button"
                  disabled={!submitterSigned}
                  onClick={handleFinalSubmitClick}
                  className="inline-flex items-center gap-2 rounded-full bg-[#0F172A] px-7 py-3 text-xs font-semibold text-white shadow-sm transition hover:bg-[#1E3A8A] disabled:opacity-50 cursor-pointer"
                >
                  <span>
                    {isResubmission
                      ? `Submit Revised Proposal (v${
                          (editingProposal?.version ?? 1) + 1
                        })`
                      : "Submit Proposal for TTD"}
                  </span>
                  <span>→</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
