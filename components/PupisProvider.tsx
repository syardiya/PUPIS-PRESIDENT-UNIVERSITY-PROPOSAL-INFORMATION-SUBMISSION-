"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
} from "react";
import {
  CAMPUS_ACCOUNTS,
  CampusAccount,
  INITIAL_PROPOSALS,
  Proposal,
  SignaturePayload,
} from "./types";

const STORAGE_USER_KEY = "pupis_active_user_v1";
const STORAGE_PROPOSALS_KEY = "pupis_proposals_v1";

interface SignInResult {
  ok: boolean;
  error?: string;
}

interface PupisStoreState {
  currentUser: CampusAccount | null;
  proposals: Proposal[];
}

interface PupisContextValue {
  currentUser: CampusAccount | null;
  proposals: Proposal[];
  isHydrated: boolean;
  signInWithCredentials: (email: string, password: string) => SignInResult;
  signInWithAccount: (account: CampusAccount) => void;
  signOut: () => void;
  saveDraft: (proposal: Proposal) => void;
  submitProposal: (proposal: Proposal) => void;
  approveAndSign: (proposalId: string, payload: SignaturePayload) => void;
  requestRevision: (proposalId: string, revisionNote: string) => void;
}

const SERVER_SNAPSHOT: PupisStoreState = {
  currentUser: null,
  proposals: INITIAL_PROPOSALS,
};

let clientSnapshot: PupisStoreState | null = null;
const listeners = new Set<() => void>();

function readInitialClientSnapshot(): PupisStoreState {
  if (typeof window === "undefined") {
    return SERVER_SNAPSHOT;
  }

  let user: CampusAccount | null = null;
  let proposals: Proposal[] = INITIAL_PROPOSALS;

  try {
    const storedUser = window.localStorage.getItem(STORAGE_USER_KEY);
    if (storedUser) {
      const parsed = JSON.parse(storedUser) as CampusAccount;
      if (parsed && parsed.email) {
        user = parsed;
      }
    }

    const storedProposals = window.localStorage.getItem(STORAGE_PROPOSALS_KEY);
    if (storedProposals) {
      const parsed = JSON.parse(storedProposals) as Proposal[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        proposals = parsed;
      }
    }
  } catch {
    // Fall back to defaults if localStorage is unavailable or malformed
  }

  return { currentUser: user, proposals };
}

function getClientSnapshot(): PupisStoreState {
  if (!clientSnapshot) {
    clientSnapshot = readInitialClientSnapshot();
  }
  return clientSnapshot;
}

function getServerSnapshot(): PupisStoreState {
  return SERVER_SNAPSHOT;
}

function emitChange() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function updateStore(updater: (prev: PupisStoreState) => PupisStoreState) {
  const prev = getClientSnapshot();
  const next = updater(prev);
  clientSnapshot = next;

  try {
    if (next.currentUser) {
      window.localStorage.setItem(
        STORAGE_USER_KEY,
        JSON.stringify(next.currentUser)
      );
    } else {
      window.localStorage.removeItem(STORAGE_USER_KEY);
    }
    window.localStorage.setItem(
      STORAGE_PROPOSALS_KEY,
      JSON.stringify(next.proposals)
    );
  } catch {
    // Ignore storage quota errors
  }

  emitChange();
}

const emptySubscribe = () => () => {};

function formatWibTimestamp(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min} WIB`;
}

const PupisContext = createContext<PupisContextValue | undefined>(undefined);

export function PupisProvider({ children }: { children: React.ReactNode }) {
  const state = useSyncExternalStore(
    subscribe,
    getClientSnapshot,
    getServerSnapshot
  );
  const isHydrated = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  const signInWithAccount = useCallback((account: CampusAccount) => {
    updateStore((prev) => ({
      ...prev,
      currentUser: account,
    }));
  }, []);

  const signInWithCredentials = useCallback(
    (email: string, password: string): SignInResult => {
      const normalized = email.trim().toLowerCase();
      if (!normalized) {
        return {
          ok: false,
          error: "Please enter your President University email.",
        };
      }
      if (
        !normalized.endsWith("@student.president.ac.id") &&
        !normalized.endsWith("@president.ac.id")
      ) {
        return {
          ok: false,
          error:
            "Please use a valid campus email (@student.president.ac.id or @president.ac.id).",
        };
      }
      if (!password.trim()) {
        return { ok: false, error: "Please enter your campus password." };
      }

      const known = CAMPUS_ACCOUNTS.find(
        (acc) => acc.email.toLowerCase() === normalized
      );

      if (known) {
        signInWithAccount(known);
        return { ok: true };
      }

      const isStudent = normalized.endsWith("@student.president.ac.id");
      const rawName = normalized
        .split("@")[0]
        .split(/[._-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");

      const customAccount: CampusAccount = isStudent
        ? {
            id: "submitter",
            name: rawName || "Student Organization",
            roleTitle: "Submitter (Student Org)",
            email: normalized,
            badgeText: "Student Organization",
            description: "Draft, submit, and revise event & budget proposals.",
          }
        : {
            id: "approver",
            name: rawName || "Campus Approver",
            roleTitle: "Approver / TTD (Advisor & Student Affairs)",
            email: normalized,
            badgeText: "Official Signer (TTD)",
            description:
              "Review, sign (TTD), or request revisions with mandatory notes.",
          };

      signInWithAccount(customAccount);
      return { ok: true };
    },
    [signInWithAccount]
  );

  const signOut = useCallback(() => {
    updateStore((prev) => ({
      ...prev,
      currentUser: null,
    }));
  }, []);

  const saveDraft = useCallback((draftProposal: Proposal) => {
    updateStore((prev) => {
      const exists = prev.proposals.some((p) => p.id === draftProposal.id);
      return {
        ...prev,
        proposals: exists
          ? prev.proposals.map((p) =>
              p.id === draftProposal.id ? draftProposal : p
            )
          : [draftProposal, ...prev.proposals],
      };
    });
  }, []);

  const submitProposal = useCallback((submittedProposal: Proposal) => {
    updateStore((prev) => {
      const exists = prev.proposals.some((p) => p.id === submittedProposal.id);
      return {
        ...prev,
        proposals: exists
          ? prev.proposals.map((p) =>
              p.id === submittedProposal.id ? submittedProposal : p
            )
          : [submittedProposal, ...prev.proposals],
      };
    });
  }, []);

  const approveAndSign = useCallback(
    (proposalId: string, payload: SignaturePayload) => {
      const nowFormatted = formatWibTimestamp();
      const signatureHash = `TTD-PU-${Math.floor(1000 + Math.random() * 9000)}S`;

      updateStore((prev) => {
        if (!prev.currentUser) return prev;
        const actor = prev.currentUser;

        return {
          ...prev,
          proposals: prev.proposals.map((prop) => {
            if (prop.id !== proposalId) return prop;

            const hasMatchingApprover = prop.approvers.some(
              (a) => a.email.toLowerCase() === actor.email.toLowerCase()
            );

            const updatedApprovers = hasMatchingApprover
              ? prop.approvers.map((a) =>
                  a.email.toLowerCase() === actor.email.toLowerCase()
                    ? {
                        ...a,
                        status: "Approved" as const,
                        signedAt: nowFormatted,
                        signatureHash,
                        signatureType: payload.signatureType,
                        signatureImageUrl: payload.signatureImageUrl,
                      }
                    : a
                )
              : [
                  ...prop.approvers,
                  {
                    id: `sig-${Date.now()}`,
                    name: actor.name,
                    role: "Student Affairs (TTD)",
                    email: actor.email,
                    status: "Approved" as const,
                    signedAt: nowFormatted,
                    signatureHash,
                    signatureType: payload.signatureType,
                    signatureImageUrl: payload.signatureImageUrl,
                  },
                ];

            const allApproved = updatedApprovers.every(
              (a) => a.status === "Approved"
            );

            const methodLabel =
              payload.signatureType === "drawn"
                ? "hand-drawn digital signature"
                : "Official Digital Stamp";

            return {
              ...prop,
              status: allApproved ? "Approved" : "Pending TTD",
              updatedAt: nowFormatted,
              activeRevisionNote: undefined,
              approvers: updatedApprovers,
              history: [
                ...prop.history,
                {
                  id: `hist-${Date.now()}`,
                  timestamp: nowFormatted,
                  actorName: actor.name,
                  actorEmail: actor.email,
                  actorRole: actor.roleTitle,
                  actionType: "approved",
                  version: prop.version,
                  summary: allApproved
                    ? `Applied ${methodLabel} & approved final TTD (${signatureHash}). Proposal status is now Approved.`
                    : `Applied ${methodLabel} & approved TTD step (${signatureHash}).`,
                },
              ],
            };
          }),
        };
      });
    },
    []
  );

  const requestRevision = useCallback(
    (proposalId: string, revisionNote: string) => {
      const nowFormatted = formatWibTimestamp();

      updateStore((prev) => {
        if (!prev.currentUser) return prev;
        const actor = prev.currentUser;

        return {
          ...prev,
          proposals: prev.proposals.map((prop) => {
            if (prop.id !== proposalId) return prop;

            const updatedApprovers = prop.approvers.map((a) =>
              a.email.toLowerCase() === actor.email.toLowerCase()
                ? { ...a, status: "Needs Revision" as const }
                : a
            );

            return {
              ...prop,
              status: "Needs Revision",
              updatedAt: nowFormatted,
              activeRevisionNote: {
                note: revisionNote,
                requestedBy: actor.name,
                requestedByEmail: actor.email,
                requestedAt: nowFormatted,
              },
              approvers: updatedApprovers,
              history: [
                ...prop.history,
                {
                  id: `hist-${Date.now()}`,
                  timestamp: nowFormatted,
                  actorName: actor.name,
                  actorEmail: actor.email,
                  actorRole: actor.roleTitle,
                  actionType: "revision_requested",
                  version: prop.version,
                  summary: `Requested revision on v${prop.version}.0. Returned to Submitter (${prop.submitterEmail}).`,
                  revisionNote,
                },
              ],
            };
          }),
        };
      });
    },
    []
  );

  return (
    <PupisContext.Provider
      value={{
        currentUser: state.currentUser,
        proposals: state.proposals,
        isHydrated,
        signInWithCredentials,
        signInWithAccount,
        signOut,
        saveDraft,
        submitProposal,
        approveAndSign,
        requestRevision,
      }}
    >
      {children}
    </PupisContext.Provider>
  );
}

export function usePupis(): PupisContextValue {
  const ctx = useContext(PupisContext);
  if (!ctx) {
    throw new Error("usePupis must be used within a PupisProvider");
  }
  return ctx;
}
