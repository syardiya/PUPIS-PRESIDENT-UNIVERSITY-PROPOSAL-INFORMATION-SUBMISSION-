"use client";

import React from "react";
import { useRouter } from "next/navigation";
import ProposalWizard from "@/components/ProposalWizard";
import type { CampusAccount } from "@/components/types";

export default function ProposalWizardClientWrapper({
  account,
}: {
  account: CampusAccount;
}) {
  const router = useRouter();

  return (
    <ProposalWizard
      currentAccount={account}
      editingProposal={null}
      onCancel={() => router.push("/proposals")}
      onSaveDraft={() => {
        // Phase 4 connects formal database draft & PDF storage submission
      }}
      onSubmitProposal={() => {
        router.push("/proposals");
      }}
    />
  );
}
