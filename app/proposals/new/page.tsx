"use client";

import React, { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ProposalWizard from "../../../components/ProposalWizard";
import { usePupis } from "../../../components/PupisProvider";
import { Proposal } from "../../../components/types";

function NewProposalContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentUser, proposals, isHydrated, saveDraft, submitProposal } =
    usePupis();

  const editId = searchParams.get("edit");
  const editingProposal = editId
    ? proposals.find((p) => p.id === editId) ?? null
    : null;

  useEffect(() => {
    if (isHydrated && !currentUser) {
      router.replace("/login");
    }
  }, [isHydrated, currentUser, router]);

  if (!isHydrated || !currentUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] text-sm font-medium text-slate-500">
        Loading proposal wizard...
      </div>
    );
  }

  const handleSaveDraft = (proposal: Proposal) => {
    saveDraft(proposal);
  };

  const handleSubmitProposal = (proposal: Proposal) => {
    submitProposal(proposal);
    router.push(`/dashboard?proposal=${encodeURIComponent(proposal.id)}`);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A]">
      <ProposalWizard
        currentAccount={currentUser}
        editingProposal={editingProposal}
        onCancel={() => router.push("/dashboard")}
        onSaveDraft={handleSaveDraft}
        onSubmitProposal={handleSubmitProposal}
      />
    </div>
  );
}

export default function NewProposalPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] text-sm font-medium text-slate-500">
          Loading proposal wizard...
        </div>
      }
    >
      <NewProposalContent />
    </Suspense>
  );
}
