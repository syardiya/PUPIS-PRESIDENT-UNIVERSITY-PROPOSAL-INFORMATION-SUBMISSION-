import React, { Suspense } from "react";
import { connection } from "next/server";
import { requireAuth } from "@/src/lib/auth/guard";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { createClient } from "@/src/lib/supabase/server";
import { normalizeEnvValue } from "@/src/lib/supabase/url";
import ProposalCreationWizard from "@/components/ProposalCreationWizard";

async function NewProposalLoader() {
  await connection();
  const profile = await requireAuth();
  const supabase = await createClient();
  const dbClient = normalizeEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY)
    ? createAdminClient()
    : supabase;

  const { data: directoryUsers } = await dbClient
    .from("users")
    .select("id, email, full_name, organization_unit, role, functional_role")
    .order("role", { ascending: true })
    .order("full_name", { ascending: true })
    .limit(80);

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
