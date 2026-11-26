import React, { Suspense } from "react";
import { requireAuth } from "@/src/lib/auth/guard";
import { createClient } from "@/src/lib/supabase/server";
import ProposalCreationWizard from "@/components/ProposalCreationWizard";

async function NewProposalLoader() {
  const profile = await requireAuth();
  const supabase = await createClient();

  const { data: directoryUsers } = await supabase
    .from("users")
    .select("id, email, full_name, organization_unit, role")
    .order("role", { ascending: true })
    .order("full_name", { ascending: true })
    .limit(50);

  return (
    <ProposalCreationWizard
      currentUser={{
        id: profile.id,
        email: profile.email,
        full_name: profile.full_name,
        organization_unit: profile.organization_unit,
        role: profile.role,
        has_signature: Boolean(profile.signature_storage_path),
      }}
      initialProposal={null}
      initialDirectoryUsers={directoryUsers ?? []}
    />
  );
}

export default function NewProposalPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-xs font-medium text-slate-500">
          Initializing proposal creation wizard...
        </div>
      }
    >
      <NewProposalLoader />
    </Suspense>
  );
}
