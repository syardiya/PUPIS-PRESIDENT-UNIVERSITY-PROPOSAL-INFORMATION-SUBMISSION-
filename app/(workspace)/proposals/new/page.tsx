import React, { Suspense } from "react";
import { requireAuth } from "@/src/lib/auth/guard";
import ProposalWizardClientWrapper from "@/components/ProposalWizardClientWrapper";
import type { CampusAccount } from "@/components/types";

async function NewProposalLoader() {
  const profile = await requireAuth();

  const mappedAccount: CampusAccount = {
    id:
      profile.role === "staff"
        ? "approver"
        : profile.role === "admin"
        ? "approver"
        : "submitter",
    name: profile.full_name,
    roleTitle:
      profile.role === "admin"
        ? "Administrator"
        : profile.role === "staff"
        ? "Approver / Staff"
        : "Student Submitter",
    email: profile.email,
    badgeText: profile.organization_unit ?? "President University",
    description: "Authenticated campus proposal session",
  };

  return <ProposalWizardClientWrapper account={mappedAccount} />;
}

export default function NewProposalPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-xs font-medium text-slate-500">
          Loading proposal wizard...
        </div>
      }
    >
      <NewProposalLoader />
    </Suspense>
  );
}
