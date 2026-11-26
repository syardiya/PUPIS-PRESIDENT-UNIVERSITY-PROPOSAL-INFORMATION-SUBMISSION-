"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ACTIVITY_CATEGORIES,
  computeBudgetItemsGrandTotal,
} from "@/src/lib/validations/proposal";
import type {
  AttachmentKindDb,
  BudgetLineItemDb,
  ProposalStatusDb,
  SignerStatusDb,
  UserRole,
} from "@/src/lib/supabase/database.types";

export interface DirectoryCampusUser {
  id: string;
  email: string;
  full_name: string;
  organization_unit: string | null;
  role: UserRole;
}

export interface WizardSignerRow {
  approver_id: string;
  email: string;
  full_name: string;
  role_title: string;
  step_order: number;
  status: SignerStatusDb;
}

export interface WizardCcRow {
  stakeholder_id: string;
  email: string;
  full_name: string;
  organization_unit: string | null;
}

export interface WizardAttachmentRow {
  id: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  storage_path: string;
  attachment_kind: AttachmentKindDb;
  version_number: number;
  created_at: string;
  signed_url: string | null;
}

export interface InitialWizardProposalData {
  id: string;
  proposal_code: string;
  title: string;
  activity_type: string | null;
  organization_name: string;
  person_in_charge: string;
  event_date: string;
  event_end_date: string | null;
  venue: string;
  background: string | null;
  objectives: string | null;
  target_audience: string | null;
  budget_items: BudgetLineItemDb[];
  total_budget: number;
  status: ProposalStatusDb;
  current_version: number;
  updated_at: string;
  signers: WizardSignerRow[];
  cc_users: WizardCcRow[];
  attachments: WizardAttachmentRow[];
  latest_revision_note?: {
    note: string;
    actor_name: string;
    created_at: string;
  } | null;
}

interface ProposalCreationWizardProps {
  currentUser: {
    id: string;
    email: string;
    full_name: string;
    organization_unit: string | null;
    role: UserRole;
    has_signature: boolean;
  };
  initialProposal: InitialWizardProposalData | null;
  initialDirectoryUsers: DirectoryCampusUser[];
}

const WIZARD_STEPS = [
  { step: 1, title: "General & Schedule", short: "Event & Venue" },
  { step: 2, title: "Narrative & Objectives", short: "Scope & Audience" },
  { step: 3, title: "Budget / RAB", short: "Line Items" },
  { step: 4, title: "Approval Routing", short: "Signers & CC" },
  { step: 5, title: "Attachments & Submit", short: "Files & Review" },
] as const;

const RAB_CATEGORIES = [
  "Venue & Facilities",
  "Equipment & Multimedia",
  "Speaker / Judge Honorarium",
  "Prizes & Certificates",
  "Consumption & Catering",
  "Publication & Documentation",
  "Medical, Security & Permits",
  "Miscellaneous",
] as const;

const ROLE_TITLE_PRESETS = [
  "PUMA / PUFA Chairperson",
  "BEM Executive Reviewer",
  "Faculty Advisor",
  "Head of Study Program",
  "Directorate of Student Affairs",
  "Vice Rector III — Student & Alumni",
] as const;

type AutoSaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

function formatIdr(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function createEmptyBudgetItem(): BudgetLineItemDb {
  return {
    id: `rab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    category: RAB_CATEGORIES[0],
    description: "",
    quantity: 1,
    unit: "pcs",
    unit_price: 0,
    subtotal: 0,
  };
}

export default function ProposalCreationWizard({
  currentUser,
  initialProposal,
  initialDirectoryUsers,
}: ProposalCreationWizardProps) {
  const router = useRouter();

  const [activeStep, setActiveStep] = useState<number>(1);
  const [proposalId, setProposalId] = useState<string | null>(
    initialProposal?.id ?? null
  );
  const [proposalCode, setProposalCode] = useState<string>(
    initialProposal?.proposal_code ?? "DRAFT — Unsaved"
  );
  const [proposalStatus] = useState<ProposalStatusDb>(
    initialProposal?.status ?? "draft"
  );
  const [currentVersion] = useState<number>(
    initialProposal?.current_version ?? 1
  );

  const isResubmission = proposalStatus === "needs_revision";

  // Step 1: General Info & Schedule
  const [title, setTitle] = useState<string>(initialProposal?.title ?? "");
  const [activityType, setActivityType] = useState<string>(
    initialProposal?.activity_type ?? ACTIVITY_CATEGORIES[0]
  );
  const [organizationName, setOrganizationName] = useState<string>(
    initialProposal?.organization_name ||
      currentUser.organization_unit ||
      ""
  );
  const [personInCharge, setPersonInCharge] = useState<string>(
    initialProposal?.person_in_charge || currentUser.full_name
  );
  const [eventDate, setEventDate] = useState<string>(
    initialProposal?.event_date ?? ""
  );
  const [eventEndDate, setEventEndDate] = useState<string>(
    initialProposal?.event_end_date ?? ""
  );
  const [venue, setVenue] = useState<string>(initialProposal?.venue ?? "");

  // Step 2: Narrative & Objectives
  const [background, setBackground] = useState<string>(
    initialProposal?.background ?? ""
  );
  const [objectives, setObjectives] = useState<string>(
    initialProposal?.objectives ?? ""
  );
  const [targetAudience, setTargetAudience] = useState<string>(
    initialProposal?.target_audience ?? ""
  );

  // Step 3: Budget / RAB Line Items
  const [budgetItems, setBudgetItems] = useState<BudgetLineItemDb[]>(
    initialProposal && initialProposal.budget_items.length > 0
      ? initialProposal.budget_items
      : [createEmptyBudgetItem()]
  );

  // Step 4: Approval Routing & CC
  const [signers, setSigners] = useState<WizardSignerRow[]>(
    initialProposal?.signers ?? []
  );
  const [ccUsers, setCcUsers] = useState<WizardCcRow[]>(
    initialProposal?.cc_users ?? []
  );
  const [directoryUsers, setDirectoryUsers] = useState<DirectoryCampusUser[]>(
    initialDirectoryUsers
  );
  const [directorySearch, setDirectorySearch] = useState<string>("");
  const [selectedApproverId, setSelectedApproverId] = useState<string>("");
  const [selectedRoleTitle, setSelectedRoleTitle] = useState<string>(
    ROLE_TITLE_PRESETS[2]
  );
  const [selectedCcId, setSelectedCcId] = useState<string>("");
  const [routingError, setRoutingError] = useState<string>("");

  // Step 5: Supporting Attachments & Final Submit
  const [attachments, setAttachments] = useState<WizardAttachmentRow[]>(
    initialProposal?.attachments ?? []
  );
  const [isUploadingFile, setIsUploadingFile] = useState<boolean>(false);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<
    string | null
  >(null);
  const [attachmentError, setAttachmentError] = useState<string>("");
  const [submissionNote, setSubmissionNote] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitErrors, setSubmitErrors] = useState<string[]>([]);

  // Auto-save tracking
  const [autoSaveStatus, setAutoSaveStatus] = useState<AutoSaveStatus>(
    initialProposal ? "saved" : "idle"
  );
  const [autoSaveError, setAutoSaveError] = useState<string>("");
  const [lastSavedTimeLabel, setLastSavedTimeLabel] = useState<string>("");

  const grandTotal = useMemo(
    () => computeBudgetItemsGrandTotal(budgetItems),
    [budgetItems]
  );

  const buildDraftPayload = useCallback(() => {
    return {
      title,
      activity_type: activityType || null,
      organization_name: organizationName,
      person_in_charge: personInCharge,
      event_date: eventDate || null,
      event_end_date: eventEndDate || null,
      venue,
      background: background || null,
      objectives: objectives || null,
      target_audience: targetAudience || null,
      budget_items: budgetItems.map((item) => ({
        id: item.id,
        category: item.category,
        description: item.description,
        quantity: Number.isFinite(item.quantity) ? Math.max(0, item.quantity) : 0,
        unit: item.unit || "pcs",
        unit_price: Number.isFinite(item.unit_price)
          ? Math.max(0, item.unit_price)
          : 0,
        subtotal:
          Math.round(
            Math.max(0, item.quantity || 0) *
              Math.max(0, item.unit_price || 0) *
              100
          ) / 100,
      })),
      total_budget: grandTotal,
      signers: signers.map((s, idx) => ({
        approver_id: s.approver_id,
        role_title: s.role_title,
        step_order: idx + 1,
      })),
      cc_users: ccUsers.map((c) => c.stakeholder_id),
    };
  }, [
    title,
    activityType,
    organizationName,
    personInCharge,
    eventDate,
    eventEndDate,
    venue,
    background,
    objectives,
    targetAudience,
    budgetItems,
    grandTotal,
    signers,
    ccUsers,
  ]);

  const serializedDraft = useMemo(
    () => JSON.stringify(buildDraftPayload()),
    [buildDraftPayload]
  );

  const lastSavedSnapshotRef = useRef<string>(serializedDraft);
  const inFlightCreatePromiseRef = useRef<Promise<string | null> | null>(null);
  const proposalIdRef = useRef<string | null>(proposalId);

  useEffect(() => {
    proposalIdRef.current = proposalId;
  }, [proposalId]);

  const hasMeaningfulInput = useMemo(() => {
    return (
      Boolean(proposalId) ||
      title.trim().length > 0 ||
      venue.trim().length > 0 ||
      eventDate.trim().length > 0 ||
      background.trim().length > 0 ||
      objectives.trim().length > 0 ||
      budgetItems.some((b) => b.description.trim().length > 0 || b.unit_price > 0) ||
      signers.length > 0 ||
      ccUsers.length > 0
    );
  }, [
    proposalId,
    title,
    venue,
    eventDate,
    background,
    objectives,
    budgetItems,
    signers,
    ccUsers,
  ]);

  /**
   * Ensures a persisted proposal `draft` ID exists in PostgreSQL, creating one if
   * on `/proposals/new`, or PATCHing the existing draft.
   */
  const persistDraftNow = useCallback(async (): Promise<string | null> => {
    setAutoSaveStatus("saving");
    setAutoSaveError("");

    const payload = buildDraftPayload();
    const snapshotBeingSaved = JSON.stringify(payload);
    const existingId = proposalIdRef.current;

    try {
      if (!existingId) {
        if (inFlightCreatePromiseRef.current) {
          return inFlightCreatePromiseRef.current;
        }

        const createTask = (async () => {
          const response = await fetch("/api/proposals", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

          const json = (await response.json()) as {
            ok?: boolean;
            id?: string;
            proposal?: { id: string; proposal_code: string };
            error?: { message?: string };
          };

          if (!response.ok || !json.ok || !json.id) {
            setAutoSaveStatus("error");
            setAutoSaveError(
              json.error?.message ?? "Unable to initialize draft."
            );
            return null;
          }

          setProposalId(json.id);
          proposalIdRef.current = json.id;
          if (json.proposal?.proposal_code) {
            setProposalCode(json.proposal.proposal_code);
          }

          lastSavedSnapshotRef.current = snapshotBeingSaved;
          setAutoSaveStatus("saved");
          setLastSavedTimeLabel(
            new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })
          );

          // Update browser URL cleanly for seamless F5 reload recovery without losing input focus
          if (
            typeof window !== "undefined" &&
            window.location.pathname === "/proposals/new"
          ) {
            window.history.replaceState(
              null,
              "",
              `/proposals/${json.id}/edit`
            );
          }

          return json.id;
        })();

        inFlightCreatePromiseRef.current = createTask;
        const createdId = await createTask;
        inFlightCreatePromiseRef.current = null;
        return createdId;
      }

      const response = await fetch(`/api/proposals/${existingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = (await response.json()) as {
        ok?: boolean;
        error?: { message?: string };
      };

      if (!response.ok || !json.ok) {
        setAutoSaveStatus("error");
        setAutoSaveError(json.error?.message ?? "Auto-save failed.");
        return null;
      }

      lastSavedSnapshotRef.current = snapshotBeingSaved;
      setAutoSaveStatus("saved");
      setLastSavedTimeLabel(
        new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
      );
      return existingId;
    } catch {
      setAutoSaveStatus("error");
      setAutoSaveError("Network connection interrupted. Click Retry to save.");
      return null;
    }
  }, [buildDraftPayload]);

  // Debounced auto-save whenever serialized draft changes
  useEffect(() => {
    if (serializedDraft === lastSavedSnapshotRef.current) {
      return;
    }
    if (!hasMeaningfulInput) {
      return;
    }

    const dirtyTimer = window.setTimeout(() => {
      setAutoSaveStatus((prev) => (prev === "saving" ? prev : "dirty"));
    }, 0);

    const saveTimer = window.setTimeout(() => {
      void persistDraftNow();
    }, 1200);

    return () => {
      window.clearTimeout(dirtyTimer);
      window.clearTimeout(saveTimer);
    };
  }, [serializedDraft, hasMeaningfulInput, persistDraftNow]);

  // Live directory search when user types in Step 4 filter
  useEffect(() => {
    const trimmed = directorySearch.trim();
    if (trimmed === "") {
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/users/directory?q=${encodeURIComponent(trimmed)}`
        );
        const json = (await res.json()) as {
          ok?: boolean;
          users?: DirectoryCampusUser[];
        };
        if (res.ok && json.ok && json.users) {
          setDirectoryUsers(json.users);
        }
      } catch {
        // Keep current directory list on transient error
      }
    }, 300);

    return () => window.clearTimeout(timer);
  }, [directorySearch]);

  // Step 3 RAB Handlers
  const updateBudgetRow = (
    id: string,
    patch: Partial<Omit<BudgetLineItemDb, "id" | "subtotal">>
  ) => {
    setBudgetItems((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        const nextQty =
          patch.quantity !== undefined ? Math.max(0, patch.quantity) : row.quantity;
        const nextPrice =
          patch.unit_price !== undefined
            ? Math.max(0, patch.unit_price)
            : row.unit_price;
        return {
          ...row,
          ...patch,
          quantity: nextQty,
          unit_price: nextPrice,
          subtotal: Math.round(nextQty * nextPrice * 100) / 100,
        };
      })
    );
  };

  const handleAddBudgetRow = () => {
    setBudgetItems((prev) => [...prev, createEmptyBudgetItem()]);
  };

  const handleRemoveBudgetRow = (id: string) => {
    setBudgetItems((prev) =>
      prev.length <= 1 ? prev : prev.filter((item) => item.id !== id)
    );
  };

  // Step 4 Signer & CC Handlers
  const handleAddSigner = () => {
    setRoutingError("");
    if (!selectedApproverId) {
      setRoutingError("Please select an institutional approver from the directory.");
      return;
    }
    if (!selectedRoleTitle.trim() || selectedRoleTitle.trim().length < 2) {
      setRoutingError("Please specify the signer's approval role title.");
      return;
    }
    if (signers.some((s) => s.approver_id === selectedApproverId)) {
      setRoutingError("This campus user is already assigned in the TTD chain.");
      return;
    }

    const foundUser = directoryUsers.find((u) => u.id === selectedApproverId);
    if (!foundUser) return;

    const nextStep = signers.length + 1;
    setSigners([
      ...signers,
      {
        approver_id: foundUser.id,
        email: foundUser.email,
        full_name: foundUser.full_name,
        role_title: selectedRoleTitle.trim(),
        step_order: nextStep,
        status: "pending",
      },
    ]);
    setSelectedApproverId("");
  };

  const handleMoveSigner = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= signers.length) return;
    if (
      signers[index]?.status === "signed" ||
      signers[targetIndex]?.status === "signed"
    ) {
      setRoutingError(
        "Already-signed TTD steps are locked and cannot be reordered."
      );
      return;
    }

    const cloned = [...signers];
    const temp = cloned[index];
    cloned[index] = cloned[targetIndex];
    cloned[targetIndex] = temp;

    setSigners(
      cloned.map((s, idx) => ({
        ...s,
        step_order: idx + 1,
      }))
    );
  };

  const handleRemoveSigner = (approverId: string) => {
    const target = signers.find((s) => s.approver_id === approverId);
    if (target?.status === "signed") {
      setRoutingError("Cannot remove an approver who has already signed.");
      return;
    }
    setSigners(
      signers
        .filter((s) => s.approver_id !== approverId)
        .map((s, idx) => ({ ...s, step_order: idx + 1 }))
    );
  };

  const handleAddCc = () => {
    setRoutingError("");
    if (!selectedCcId) return;
    if (ccUsers.some((c) => c.stakeholder_id === selectedCcId)) {
      setRoutingError("This stakeholder is already in the CC observer list.");
      return;
    }

    const found = directoryUsers.find((u) => u.id === selectedCcId);
    if (!found) return;

    setCcUsers([
      ...ccUsers,
      {
        stakeholder_id: found.id,
        email: found.email,
        full_name: found.full_name,
        organization_unit: found.organization_unit,
      },
    ]);
    setSelectedCcId("");
  };

  const handleRemoveCc = (stakeholderId: string) => {
    setCcUsers(ccUsers.filter((c) => c.stakeholder_id !== stakeholderId));
  };

  // Step 5 Attachment Upload & Delete
  const handleAttachmentFileSelect = async (
    e: React.ChangeEvent<HTMLInputElement>,
    kind: AttachmentKindDb
  ) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setAttachmentError("");
    setIsUploadingFile(true);

    try {
      let activeId = proposalIdRef.current;
      if (!activeId) {
        activeId = await persistDraftNow();
      }
      if (!activeId) {
        setAttachmentError(
          "Please resolve draft save issues before uploading files."
        );
        return;
      }

      const formData = new FormData();
      formData.append("file", file);
      formData.append("attachment_kind", kind);

      const response = await fetch(`/api/proposals/${activeId}/attachments`, {
        method: "POST",
        body: formData,
      });

      const json = (await response.json()) as {
        ok?: boolean;
        attachment?: WizardAttachmentRow;
        error?: { message?: string };
      };

      if (!response.ok || !json.ok || !json.attachment) {
        setAttachmentError(
          json.error?.message ?? "Failed to upload supporting file."
        );
        return;
      }

      setAttachments((prev) => [...prev, json.attachment!]);
    } catch {
      setAttachmentError("Network error while uploading supporting attachment.");
    } finally {
      setIsUploadingFile(false);
    }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!proposalIdRef.current) return;
    setAttachmentError("");
    setDeletingAttachmentId(attachmentId);

    try {
      const response = await fetch(
        `/api/proposals/${proposalIdRef.current}/attachments/${attachmentId}`,
        { method: "DELETE" }
      );
      const json = (await response.json()) as {
        ok?: boolean;
        error?: { message?: string };
      };

      if (!response.ok || !json.ok) {
        setAttachmentError(
          json.error?.message ?? "Unable to delete attachment."
        );
        return;
      }

      setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
    } catch {
      setAttachmentError("Network error while deleting attachment.");
    } finally {
      setDeletingAttachmentId(null);
    }
  };

  // Final Submit Handler
  const handleFinalSubmit = async () => {
    setSubmitErrors([]);
    setIsSubmitting(true);

    try {
      const savedId = await persistDraftNow();
      if (!savedId) {
        setSubmitErrors([
          "Could not save your latest changes before submitting. Please check highlighted errors.",
        ]);
        return;
      }

      const response = await fetch(`/api/proposals/${savedId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submission_note: submissionNote.trim() || undefined,
        }),
      });

      const json = (await response.json()) as {
        ok?: boolean;
        proposal?: { id: string };
        error?: {
          code?: string;
          message?: string;
          issues?: Array<{ path: string; message: string }>;
        };
      };

      if (!response.ok || !json.ok) {
        if (json.error?.issues && json.error.issues.length > 0) {
          setSubmitErrors(json.error.issues.map((i) => i.message));
        } else {
          setSubmitErrors([
            json.error?.message ??
              "Proposal validation failed. Please review all required fields.",
          ]);
        }
        return;
      }

      router.push(`/proposals/${savedId}?submitted=1`);
      router.refresh();
    } catch {
      setSubmitErrors([
        "Network error while submitting proposal. Your draft remains safely saved.",
      ]);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Sticky Top Control & Auto-Save Bar */}
      <div className="sticky top-16 z-20 mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#E2E8F0] bg-white/95 px-5 py-4 shadow-xs backdrop-blur-md">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="rounded-full bg-[#0F172A] px-3 py-0.5 text-[11px] font-bold text-white">
              {isResubmission
                ? `Revision v${currentVersion} → v${currentVersion + 1}`
                : "Draft Proposal"}
            </span>
            <span className="font-mono text-xs font-semibold text-slate-500">
              {proposalCode}
            </span>

            {/* Auto-Save Visual Status Pill */}
            {autoSaveStatus === "saving" && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-semibold text-[#1E3A8A]">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#1E3A8A]" />
                Saving draft...
              </span>
            )}
            {autoSaveStatus === "dirty" && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                Unsaved changes...
              </span>
            )}
            {autoSaveStatus === "saved" && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                All changes saved
                {lastSavedTimeLabel ? ` (${lastSavedTimeLabel})` : ""}
              </span>
            )}
            {autoSaveStatus === "error" && (
              <span className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-[11px] font-semibold text-rose-800">
                <span>Save error: {autoSaveError || "Failed"}</span>
                <button
                  type="button"
                  onClick={() => void persistDraftNow()}
                  className="underline hover:text-rose-950 cursor-pointer"
                >
                  Retry
                </button>
              </span>
            )}
          </div>

          <h1 className="mt-1 truncate text-base font-bold text-[#0F172A] sm:text-lg">
            {title.trim() || "Untitled Student Organization Proposal"}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/proposals"
            className="rounded-full border border-[#E2E8F0] bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Back to Proposals
          </Link>
          <button
            type="button"
            disabled={autoSaveStatus === "saving"}
            onClick={() => void persistDraftNow()}
            className="rounded-full border border-[#1E3A8A]/30 bg-[#1E3A8A]/5 px-4 py-2 text-xs font-semibold text-[#1E3A8A] transition hover:bg-[#1E3A8A]/10 disabled:opacity-50 cursor-pointer"
          >
            Save Draft Now
          </button>
          <button
            type="button"
            onClick={() => setActiveStep(5)}
            className="rounded-full bg-[#0F172A] px-5 py-2 text-xs font-semibold text-white shadow-2xs transition hover:bg-[#1E3A8A] cursor-pointer"
          >
            Review &amp; Submit →
          </button>
        </div>
      </div>

      {/* Revision Requested Banner */}
      {isResubmission && initialProposal?.latest_revision_note && (
        <div className="mb-6 rounded-2xl border border-rose-300 bg-gradient-to-r from-rose-50 via-amber-50/60 to-rose-50 p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-rose-800">
            Revision Requested by {initialProposal.latest_revision_note.actor_name}
          </p>
          <p className="mt-1.5 text-sm font-semibold text-slate-900">
            &ldquo;{initialProposal.latest_revision_note.note}&rdquo;
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Update the necessary sections below and submit as v
            {currentVersion + 1}.0. Previously signed TTD approvals remain
            intact.
          </p>
        </div>
      )}

      {/* Horizontal 5-Step Progress Stepper */}
      <nav
        aria-label="Proposal Creation Steps"
        className="mb-6 rounded-2xl border border-[#E2E8F0] bg-white p-4 shadow-2xs"
      >
        <ol className="grid grid-cols-1 gap-2 sm:grid-cols-5">
          {WIZARD_STEPS.map((node) => {
            const isCurrent = activeStep === node.step;
            const isPassed = activeStep > node.step;

            return (
              <li key={node.step}>
                <button
                  type="button"
                  onClick={() => setActiveStep(node.step)}
                  className={`flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition cursor-pointer ${
                    isCurrent
                      ? "bg-[#0F172A]/[0.04] ring-1 ring-[#1E3A8A]/30"
                      : "hover:bg-slate-50"
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      isCurrent
                        ? "bg-[#0F172A] text-white ring-4 ring-[#1E3A8A]/15"
                        : isPassed
                        ? "bg-[#1E3A8A] text-white"
                        : "border border-slate-300 bg-white text-slate-600"
                    }`}
                  >
                    {isPassed ? "✓" : node.step}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-[#0F172A]">
                      {node.title}
                    </p>
                    <p className="truncate text-[11px] text-slate-500">
                      {node.short}
                    </p>
                  </div>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {/* STEP 1: GENERAL INFO & SCHEDULE */}
      {activeStep === 1 && (
        <section className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-2xs sm:p-8">
          <div className="border-b border-[#E2E8F0] pb-4">
            <span className="text-xs font-bold uppercase tracking-wider text-[#1E3A8A]">
              Step 1 of 5
            </span>
            <h2 className="mt-1 text-lg font-bold text-[#0F172A]">
              General Information &amp; Event Schedule
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Provide core institutional details, activity classification,
              dates, and campus venue.
            </p>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label
                htmlFor="prop-title"
                className="block text-xs font-bold uppercase tracking-wider text-[#0F172A]"
              >
                Proposal / Event Title *
              </label>
              <input
                id="prop-title"
                type="text"
                maxLength={200}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Compsphere 2026: National AI & Cybersecurity Symposium"
                className="mt-1.5 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2.5 text-sm font-medium text-[#0F172A] focus:border-[#1E3A8A] focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="prop-category"
                className="block text-xs font-bold uppercase tracking-wider text-[#0F172A]"
              >
                Activity Category *
              </label>
              <select
                id="prop-category"
                value={activityType}
                onChange={(e) => setActivityType(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2.5 text-sm font-medium text-[#0F172A] focus:border-[#1E3A8A] focus:bg-white focus:outline-none"
              >
                {ACTIVITY_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="prop-org"
                className="block text-xs font-bold uppercase tracking-wider text-[#0F172A]"
              >
                Student Organization / Unit *
              </label>
              <input
                id="prop-org"
                type="text"
                maxLength={150}
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                placeholder="e.g., BEM President University / PUMA Computing"
                className="mt-1.5 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2.5 text-sm font-medium text-[#0F172A] focus:border-[#1E3A8A] focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="prop-pic"
                className="block text-xs font-bold uppercase tracking-wider text-[#0F172A]"
              >
                Person in Charge (PIC) *
              </label>
              <input
                id="prop-pic"
                type="text"
                maxLength={150}
                value={personInCharge}
                onChange={(e) => setPersonInCharge(e.target.value)}
                placeholder="Project Chairperson full name"
                className="mt-1.5 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2.5 text-sm font-medium text-[#0F172A] focus:border-[#1E3A8A] focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="prop-venue"
                className="block text-xs font-bold uppercase tracking-wider text-[#0F172A]"
              >
                Proposed Venue / Location *
              </label>
              <input
                id="prop-venue"
                type="text"
                maxLength={200}
                value={venue}
                onChange={(e) => setVenue(e.target.value)}
                placeholder="e.g., Charles Himawan Auditorium, Building A"
                className="mt-1.5 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2.5 text-sm font-medium text-[#0F172A] focus:border-[#1E3A8A] focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="prop-start-date"
                className="block text-xs font-bold uppercase tracking-wider text-[#0F172A]"
              >
                Event Start Date *
              </label>
              <input
                id="prop-start-date"
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2.5 text-sm font-medium text-[#0F172A] focus:border-[#1E3A8A] focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="prop-end-date"
                className="block text-xs font-bold uppercase tracking-wider text-[#0F172A]"
              >
                Event End Date (Optional for multi-day)
              </label>
              <input
                id="prop-end-date"
                type="date"
                min={eventDate || undefined}
                value={eventEndDate}
                onChange={(e) => setEventEndDate(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2.5 text-sm font-medium text-[#0F172A] focus:border-[#1E3A8A] focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          <div className="mt-8 flex justify-end border-t border-[#E2E8F0] pt-5">
            <button
              type="button"
              onClick={() => setActiveStep(2)}
              className="inline-flex items-center gap-2 rounded-full bg-[#0F172A] px-6 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-[#1E3A8A] cursor-pointer"
            >
              <span>Next: Narrative &amp; Objectives →</span>
            </button>
          </div>
        </section>
      )}

      {/* STEP 2: NARRATIVE & OBJECTIVES */}
      {activeStep === 2 && (
        <section className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-2xs sm:p-8">
          <div className="border-b border-[#E2E8F0] pb-4">
            <span className="text-xs font-bold uppercase tracking-wider text-[#1E3A8A]">
              Step 2 of 5
            </span>
            <h2 className="mt-1 text-lg font-bold text-[#0F172A]">
              Program Narrative, Objectives &amp; Target Audience
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Explain the rationale, academic or organizational goals, and
              expected participants.
            </p>
          </div>

          <div className="mt-6 space-y-5">
            <div>
              <div className="flex items-center justify-between">
                <label
                  htmlFor="prop-background"
                  className="block text-xs font-bold uppercase tracking-wider text-[#0F172A]"
                >
                  Background &amp; Activity Description *
                </label>
                <span className="text-[11px] text-slate-400">
                  {background.length} / 10,000
                </span>
              </div>
              <textarea
                id="prop-background"
                rows={5}
                maxLength={10000}
                value={background}
                onChange={(e) => setBackground(e.target.value)}
                placeholder="Describe the context, theme, rundown highlights, and institutional relevance of this program..."
                className="mt-1.5 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2.5 text-sm leading-relaxed text-[#0F172A] focus:border-[#1E3A8A] focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label
                  htmlFor="prop-objectives"
                  className="block text-xs font-bold uppercase tracking-wider text-[#0F172A]"
                >
                  Key Objectives &amp; Measurable Outcomes *
                </label>
                <span className="text-[11px] text-slate-400">
                  {objectives.length} / 10,000
                </span>
              </div>
              <textarea
                id="prop-objectives"
                rows={4}
                maxLength={10000}
                value={objectives}
                onChange={(e) => setObjectives(e.target.value)}
                placeholder="List concrete learning outcomes, KPIs, or student development goals..."
                className="mt-1.5 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2.5 text-sm leading-relaxed text-[#0F172A] focus:border-[#1E3A8A] focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="prop-audience"
                className="block text-xs font-bold uppercase tracking-wider text-[#0F172A]"
              >
                Target Audience &amp; Estimated Attendance *
              </label>
              <textarea
                id="prop-audience"
                rows={3}
                maxLength={4000}
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                placeholder="e.g., 250 undergraduate students across Faculty of Computing and external university delegates..."
                className="mt-1.5 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2.5 text-sm leading-relaxed text-[#0F172A] focus:border-[#1E3A8A] focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          <div className="mt-8 flex items-center justify-between border-t border-[#E2E8F0] pt-5">
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
              <span>Next: Budget / RAB →</span>
            </button>
          </div>
        </section>
      )}

      {/* STEP 3: BUDGET / RAB LINE ITEMS */}
      {activeStep === 3 && (
        <section className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-2xs sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#E2E8F0] pb-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-[#1E3A8A]">
                Step 3 of 5
              </span>
              <h2 className="mt-1 text-lg font-bold text-[#0F172A]">
                Detailed Budget Plan (RAB Line Items)
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Itemize projected expenditures. Subtotals and the grand total
                recalculate automatically.
              </p>
            </div>

            <div className="rounded-2xl border border-[#1E3A8A]/20 bg-[#1E3A8A]/[0.04] px-4 py-2.5 text-right">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Grand Total RAB
              </span>
              <span className="text-lg font-bold text-[#0F172A]">
                {formatIdr(grandTotal)}
              </span>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            {budgetItems.map((item, index) => (
              <div
                key={item.id}
                className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-4"
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-bold text-[#0F172A]">
                    Line Item #{index + 1}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-bold text-[#1E3A8A]">
                      Subtotal: {formatIdr(item.subtotal)}
                    </span>
                    {budgetItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveBudgetRow(item.id)}
                        className="text-xs font-semibold text-rose-600 hover:underline cursor-pointer"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                  <div className="sm:col-span-3">
                    <label className="block text-[11px] font-semibold text-slate-500">
                      Category
                    </label>
                    <select
                      value={item.category}
                      onChange={(e) =>
                        updateBudgetRow(item.id, { category: e.target.value })
                      }
                      className="mt-1 w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-xs font-medium text-[#0F172A] focus:border-[#1E3A8A] focus:outline-none"
                    >
                      {RAB_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-4">
                    <label className="block text-[11px] font-semibold text-slate-500">
                      Item Description *
                    </label>
                    <input
                      type="text"
                      maxLength={240}
                      value={item.description}
                      onChange={(e) =>
                        updateBudgetRow(item.id, {
                          description: e.target.value,
                        })
                      }
                      placeholder="e.g., Auditorium Sound & LED Package"
                      className="mt-1 w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-xs text-[#0F172A] focus:border-[#1E3A8A] focus:outline-none"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-500">
                      Quantity
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={item.quantity}
                      onChange={(e) =>
                        updateBudgetRow(item.id, {
                          quantity: Number.parseFloat(e.target.value) || 0,
                        })
                      }
                      className="mt-1 w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-xs font-semibold text-[#0F172A] focus:border-[#1E3A8A] focus:outline-none"
                    />
                  </div>

                  <div className="sm:col-span-1">
                    <label className="block text-[11px] font-semibold text-slate-500">
                      Unit
                    </label>
                    <input
                      type="text"
                      maxLength={40}
                      value={item.unit}
                      onChange={(e) =>
                        updateBudgetRow(item.id, { unit: e.target.value })
                      }
                      placeholder="pcs"
                      className="mt-1 w-full rounded-xl border border-[#E2E8F0] bg-white px-2.5 py-2 text-xs text-[#0F172A] focus:border-[#1E3A8A] focus:outline-none"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-500">
                      Unit Price (IDR)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="1000"
                      value={item.unit_price}
                      onChange={(e) =>
                        updateBudgetRow(item.id, {
                          unit_price: Number.parseFloat(e.target.value) || 0,
                        })
                      }
                      className="mt-1 w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-xs font-semibold text-[#0F172A] focus:border-[#1E3A8A] focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
            <button
              type="button"
              onClick={handleAddBudgetRow}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#1E3A8A]/30 bg-[#1E3A8A]/5 px-4 py-2 text-xs font-semibold text-[#1E3A8A] transition hover:bg-[#1E3A8A]/10 cursor-pointer"
            >
              <span>+ Add RAB Line Item</span>
            </button>

            <div className="text-right">
              <span className="text-xs text-slate-500">
                {budgetItems.length} item(s) • Total Requested:{" "}
              </span>
              <strong className="text-sm font-bold text-[#0F172A]">
                {formatIdr(grandTotal)}
              </strong>
            </div>
          </div>

          <div className="mt-8 flex items-center justify-between border-t border-[#E2E8F0] pt-5">
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
              <span>Next: Approval Routing →</span>
            </button>
          </div>
        </section>
      )}

      {/* STEP 4: APPROVAL ROUTING & CC STAKEHOLDERS */}
      {activeStep === 4 && (
        <section className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-2xs sm:p-8">
          <div className="border-b border-[#E2E8F0] pb-4">
            <span className="text-xs font-bold uppercase tracking-wider text-[#1E3A8A]">
              Step 4 of 5
            </span>
            <h2 className="mt-1 text-lg font-bold text-[#0F172A]">
              Sequential Digital TTD Chain &amp; CC Stakeholders
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Select registered President University accounts (
              <span className="font-mono">@president.ac.id</span> or{" "}
              <span className="font-mono">@student.president.ac.id</span>) in
              the exact signing sequence.
            </p>
          </div>

          {/* Campus Directory Filter */}
          <div className="mt-5">
            <label
              htmlFor="directory-search"
              className="block text-xs font-bold uppercase tracking-wider text-slate-500"
            >
              Search Campus User Directory
            </label>
            <input
              id="directory-search"
              type="search"
              value={directorySearch}
              onChange={(e) => setDirectorySearch(e.target.value)}
              placeholder="Filter registered users by name, @president.ac.id email, or unit..."
              className="mt-1.5 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2 text-xs text-[#0F172A] focus:border-[#1E3A8A] focus:bg-white focus:outline-none"
            />
          </div>

          {routingError && (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700">
              {routingError}
            </div>
          )}

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* LEFT: Ordered Signers (TTD) */}
            <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-5">
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-[#0F172A] px-3 py-1 text-xs font-bold text-white">
                  Sequential TTD Approvers ({signers.length})
                </span>
                <span className="text-[11px] font-medium text-slate-500">
                  Step 1 → Step N
                </span>
              </div>

              <div className="mt-4 space-y-2.5">
                {signers.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-center text-xs text-slate-500">
                    No TTD approvers assigned yet. Add at least one campus
                    approver below.
                  </div>
                ) : (
                  signers.map((signer, idx) => (
                    <div
                      key={signer.approver_id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-2.5"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0F172A] text-[11px] font-bold text-white">
                          {idx + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="truncate text-xs font-bold text-[#0F172A]">
                              {signer.full_name}
                            </p>
                            <span className="rounded bg-[#1E3A8A]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#1E3A8A]">
                              {signer.role_title}
                            </span>
                          </div>
                          <p className="truncate font-mono text-[11px] text-slate-500">
                            {signer.email}
                          </p>
                        </div>
                      </div>

                      {signer.status === "signed" ? (
                        <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">
                          Signed (Locked)
                        </span>
                      ) : (
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => handleMoveSigner(idx, -1)}
                            aria-label="Move step up"
                            className="rounded p-1 text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            disabled={idx === signers.length - 1}
                            onClick={() => handleMoveSigner(idx, 1)}
                            aria-label="Move step down"
                            className="rounded p-1 text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleRemoveSigner(signer.approver_id)
                            }
                            className="ml-1 text-xs font-semibold text-rose-600 hover:underline cursor-pointer"
                          >
                            Remove
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              <div className="mt-4 space-y-2.5 border-t border-[#E2E8F0] pt-4">
                <p className="text-xs font-bold text-[#0F172A]">
                  Add Sequential Approver
                </p>
                <select
                  aria-label="Select campus approver"
                  value={selectedApproverId}
                  onChange={(e) => setSelectedApproverId(e.target.value)}
                  className="w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-xs text-[#0F172A] focus:border-[#1E3A8A] focus:outline-none"
                >
                  <option value="">
                    — Choose registered campus user ({directoryUsers.length}) —
                  </option>
                  {directoryUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name} ({u.email}) • {u.role}
                    </option>
                  ))}
                </select>

                <div className="flex gap-2">
                  <input
                    type="text"
                    list="role-title-presets"
                    value={selectedRoleTitle}
                    onChange={(e) => setSelectedRoleTitle(e.target.value)}
                    placeholder="Approval Role Title (e.g., Faculty Advisor)"
                    className="flex-1 rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-xs text-[#0F172A] focus:border-[#1E3A8A] focus:outline-none"
                  />
                  <datalist id="role-title-presets">
                    {ROLE_TITLE_PRESETS.map((preset) => (
                      <option key={preset} value={preset} />
                    ))}
                  </datalist>
                  <button
                    type="button"
                    onClick={handleAddSigner}
                    className="rounded-full bg-[#0F172A] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#1E3A8A] cursor-pointer"
                  >
                    + Add Step
                  </button>
                </div>
              </div>
            </div>

            {/* RIGHT: Read-Only CC Stakeholders */}
            <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-5">
              <div className="flex items-center justify-between">
                <span className="rounded-full border border-[#1E3A8A]/30 bg-[#1E3A8A]/10 px-3 py-1 text-xs font-bold text-[#1E3A8A]">
                  CC Stakeholders ({ccUsers.length})
                </span>
                <span className="text-[11px] font-medium text-slate-500">
                  Read-Only Audit Copy
                </span>
              </div>

              <div className="mt-4 space-y-2.5">
                {ccUsers.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-center text-xs text-slate-500">
                    Optional: add advisors, finance, or venue coordinators as
                    read-only CC observers.
                  </div>
                ) : (
                  ccUsers.map((cc) => (
                    <div
                      key={cc.stakeholder_id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-[#0F172A]">
                          {cc.full_name}
                        </p>
                        <p className="truncate font-mono text-[11px] text-slate-500">
                          {cc.email}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveCc(cc.stakeholder_id)}
                        className="text-xs font-semibold text-slate-400 hover:text-rose-600 cursor-pointer"
                      >
                        Remove
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-4 space-y-2 border-t border-[#E2E8F0] pt-4">
                <p className="text-xs font-bold text-[#0F172A]">
                  Add Read-Only CC Observer
                </p>
                <div className="flex gap-2">
                  <select
                    aria-label="Select CC stakeholder"
                    value={selectedCcId}
                    onChange={(e) => setSelectedCcId(e.target.value)}
                    className="flex-1 rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-xs text-[#0F172A] focus:border-[#1E3A8A] focus:outline-none"
                  >
                    <option value="">
                      — Choose registered campus observer —
                    </option>
                    {directoryUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name} ({u.email})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleAddCc}
                    className="rounded-full bg-[#0F172A] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#1E3A8A] cursor-pointer"
                  >
                    + Add CC
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 flex items-center justify-between border-t border-[#E2E8F0] pt-5">
            <button
              type="button"
              onClick={() => setActiveStep(3)}
              className="rounded-full border border-[#E2E8F0] bg-white px-5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              ← Previous
            </button>
            <button
              type="button"
              onClick={() => setActiveStep(5)}
              className="inline-flex items-center gap-2 rounded-full bg-[#0F172A] px-6 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-[#1E3A8A] cursor-pointer"
            >
              <span>Next: Attachments &amp; Final Review →</span>
            </button>
          </div>
        </section>
      )}

      {/* STEP 5: SUPPORTING ATTACHMENTS & FINAL REVIEW */}
      {activeStep === 5 && (
        <section className="space-y-6">
          {/* Submitter Signature Readiness Check */}
          {!currentUser.has_signature && (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-amber-900">
                    Digital Signature (TTD) Required Before Final Submission
                  </p>
                  <p className="mt-1 text-xs text-amber-800">
                    Your draft is automatically saved, but you must configure an
                    active PNG Digital Signature on your Profile page before
                    submitting for institutional approval.
                  </p>
                </div>
                <Link
                  href="/profile"
                  className="rounded-full bg-[#0F172A] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#1E3A8A]"
                >
                  Open Profile &amp; Configure TTD →
                </Link>
              </div>
            </div>
          )}

          {/* Attachments Upload & List Card */}
          <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-2xs sm:p-8">
            <div className="border-b border-[#E2E8F0] pb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-[#1E3A8A]">
                Step 5 of 5 • Supporting Documents
              </span>
              <h2 className="mt-1 text-lg font-bold text-[#0F172A]">
                Proposal PDF &amp; Supporting Attachments
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Upload your formal Proposal PDF along with rundowns, vendor
                quotations, or RAB spreadsheets (PDF, PNG, JPG, DOCX, XLSX • max
                10 MB per file).
              </p>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#1E3A8A]/40 bg-[#F8FAFC] p-5 text-center transition hover:border-[#1E3A8A] hover:bg-white">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0F172A] text-xs font-bold text-white">
                  PDF
                </span>
                <span className="mt-2 text-xs font-bold text-[#0F172A]">
                  {isUploadingFile
                    ? "Uploading & Verifying..."
                    : "Upload Primary Proposal PDF"}
                </span>
                <span className="mt-0.5 text-[11px] text-slate-500">
                  application/pdf • Max 10 MB
                </span>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  disabled={isUploadingFile}
                  onChange={(e) =>
                    void handleAttachmentFileSelect(e, "primary_proposal_pdf")
                  }
                  className="sr-only"
                />
              </label>

              <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-[#F8FAFC] p-5 text-center transition hover:border-[#1E3A8A] hover:bg-white">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800 text-xs font-bold text-white">
                  +
                </span>
                <span className="mt-2 text-xs font-bold text-[#0F172A]">
                  {isUploadingFile
                    ? "Uploading & Verifying..."
                    : "Upload Supporting Attachment"}
                </span>
                <span className="mt-0.5 text-[11px] text-slate-500">
                  PDF, PNG, JPG, DOCX, XLSX • Max 10 MB
                </span>
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx"
                  disabled={isUploadingFile}
                  onChange={(e) =>
                    void handleAttachmentFileSelect(e, "supporting")
                  }
                  className="sr-only"
                />
              </label>
            </div>

            {attachmentError && (
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700">
                {attachmentError}
              </div>
            )}

            <div className="mt-5 space-y-2.5">
              {attachments.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#E2E8F0] bg-[#F8FAFC] p-6 text-center text-xs text-slate-500">
                  No files uploaded yet. At least one document is required
                  before final submission.
                </div>
              ) : (
                attachments.map((att) => (
                  <div
                    key={att.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#0F172A] text-[10px] font-bold text-white">
                        {att.file_name.split(".").pop()?.toUpperCase() || "DOC"}
                      </span>
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
                    </div>

                    <div className="flex items-center gap-3">
                      {att.signed_url && (
                        <a
                          href={att.signed_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-semibold text-[#1E3A8A] hover:underline"
                        >
                          Preview / Download
                        </a>
                      )}
                      <button
                        type="button"
                        disabled={deletingAttachmentId === att.id}
                        onClick={() => void handleDeleteAttachment(att.id)}
                        className="text-xs font-semibold text-rose-600 hover:underline disabled:opacity-50 cursor-pointer"
                      >
                        {deletingAttachmentId === att.id
                          ? "Removing..."
                          : "Remove"}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Final Summary & Submit Card */}
          <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-2xs sm:p-8">
            <h3 className="text-base font-bold text-[#0F172A]">
              Final Submission Summary
            </h3>
            <div className="mt-4 grid grid-cols-1 gap-4 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-5 sm:grid-cols-3">
              <div>
                <span className="text-[11px] font-semibold uppercase text-slate-400">
                  Program &amp; Unit
                </span>
                <p className="mt-0.5 text-xs font-bold text-[#0F172A]">
                  {title || "—"}
                </p>
                <p className="text-xs text-slate-500">
                  {organizationName || "—"} • PIC: {personInCharge || "—"}
                </p>
              </div>
              <div>
                <span className="text-[11px] font-semibold uppercase text-slate-400">
                  Schedule &amp; RAB Total
                </span>
                <p className="mt-0.5 text-xs font-bold text-[#0F172A]">
                  {eventDate || "Date unset"}
                  {eventEndDate ? ` → ${eventEndDate}` : ""}
                </p>
                <p className="text-xs font-semibold text-[#1E3A8A]">
                  {formatIdr(grandTotal)} ({budgetItems.length} line items)
                </p>
              </div>
              <div>
                <span className="text-[11px] font-semibold uppercase text-slate-400">
                  Routing &amp; Files
                </span>
                <p className="mt-0.5 text-xs font-bold text-[#0F172A]">
                  {signers.length} Sequential Signer(s) • {ccUsers.length} CC
                </p>
                <p className="text-xs text-slate-500">
                  {attachments.length} Attached Document(s)
                </p>
              </div>
            </div>

            <div className="mt-5">
              <label
                htmlFor="submission-note"
                className="block text-xs font-bold uppercase tracking-wider text-[#0F172A]"
              >
                Submission / Revision Cover Note (Optional)
              </label>
              <textarea
                id="submission-note"
                rows={2}
                maxLength={2000}
                value={submissionNote}
                onChange={(e) => setSubmissionNote(e.target.value)}
                placeholder="Add any context or summary of changes for the Step 1 approver..."
                className="mt-1.5 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2.5 text-xs text-[#0F172A] focus:border-[#1E3A8A] focus:bg-white focus:outline-none"
              />
            </div>

            {submitErrors.length > 0 && (
              <div
                role="alert"
                className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4"
              >
                <p className="text-xs font-bold text-rose-900">
                  Please resolve the following before submitting:
                </p>
                <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs text-rose-800">
                  {submitErrors.map((errMsg, idx) => (
                    <li key={idx}>{errMsg}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[#E2E8F0] pt-5">
              <button
                type="button"
                onClick={() => setActiveStep(4)}
                className="rounded-full border border-[#E2E8F0] bg-white px-5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                ← Previous
              </button>

              <button
                type="button"
                disabled={isSubmitting || !currentUser.has_signature}
                onClick={() => void handleFinalSubmit()}
                className="inline-flex items-center gap-2 rounded-full bg-[#0F172A] px-7 py-3 text-xs font-semibold text-white shadow-sm transition hover:bg-[#1E3A8A] disabled:opacity-50 cursor-pointer"
              >
                <span>
                  {isSubmitting
                    ? "Locking & Submitting Proposal..."
                    : isResubmission
                    ? `Submit Revised Proposal (v${currentVersion + 1}.0)`
                    : "Submit Proposal for Sequential TTD"}
                </span>
                <span>→</span>
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
