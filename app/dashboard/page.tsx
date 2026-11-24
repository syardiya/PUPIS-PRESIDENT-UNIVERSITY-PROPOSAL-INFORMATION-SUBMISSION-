"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import WorkspaceNavbar from "../../components/WorkspaceNavbar";
import ProposalDashboard from "../../components/ProposalDashboard";
import { usePupis } from "../../components/PupisProvider";
import { Proposal } from "../../components/types";

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    currentUser,
    proposals,
    isHydrated,
    approveAndSign,
    requestRevision,
  } = usePupis();

  const proposalQueryParam = searchParams.get("proposal");
  const [manualSelectedId, setManualSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (isHydrated && !currentUser) {
      router.replace("/login");
    }
  }, [isHydrated, currentUser, router]);

  if (!isHydrated || !currentUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] text-sm font-medium text-slate-500">
        Loading workspace...
      </div>
    );
  }

  const effectiveSelectedId =
    manualSelectedId && proposals.some((p) => p.id === manualSelectedId)
      ? manualSelectedId
      : proposalQueryParam &&
        proposals.some((p) => p.id === proposalQueryParam)
      ? proposalQueryParam
      : proposals[0]?.id ?? "";

  const handleEditProposal = (proposal: Proposal) => {
    router.push(`/proposals/new?edit=${encodeURIComponent(proposal.id)}`);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex flex-col">
      <WorkspaceNavbar />

      <main className="flex-1">
        <ProposalDashboard
          currentAccount={currentUser}
          proposals={proposals}
          selectedProposalId={effectiveSelectedId}
          onSelectProposal={setManualSelectedId}
          onEditProposal={handleEditProposal}
          onApproveAndSign={approveAndSign}
          onRequestRevision={requestRevision}
        />
      </main>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] text-sm font-medium text-slate-500">
          Loading workspace...
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
