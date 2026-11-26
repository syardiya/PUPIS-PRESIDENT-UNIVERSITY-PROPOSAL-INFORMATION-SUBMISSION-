import React, { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { requireAuth } from "@/src/lib/auth/guard";
import { createClient } from "@/src/lib/supabase/server";
import { uuidSchema } from "@/src/lib/validations/proposal";
import { fetchHydratedProposalDetail } from "@/src/lib/proposals/server-helpers";
import ProposalCreationWizard, {
  type InitialWizardProposalData,
} from "@/components/ProposalCreationWizard";

async function EditProposalLoader({
  paramsPromise,
}: {
  paramsPromise: Promise<{ id: string }>;
}) {
  const profile = await requireAuth();
  const { id } = await paramsPromise;

  const parsedId = uuidSchema.safeParse(id);
  if (!parsedId.success) {
    notFound();
  }

  const supabase = await createClient();
  const [detail, { data: directoryUsers }] = await Promise.all([
    fetchHydratedProposalDetail(supabase, parsedId.data),
    supabase
      .from("users")
      .select("id, email, full_name, organization_unit, role")
      .order("role", { ascending: true })
      .order("full_name", { ascending: true })
      .limit(50),
  ]);

  if (!detail) {
    notFound();
  }

  if (detail.submitter_id !== profile.id && profile.role !== "admin") {
    redirect(`/proposals/${detail.id}`);
  }

  // Locked proposals redirect cleanly to the read-only detail view
  if (detail.status !== "draft" && detail.status !== "needs_revision") {
    redirect(`/proposals/${detail.id}`);
  }

  const latestRevisionEntry = [...detail.revision_logs]
    .reverse()
    .find((log) => log.action_type === "revision_requested" && log.note);

  const initialProposalData: InitialWizardProposalData = {
    id: detail.id,
    proposal_code: detail.proposal_code,
    title: detail.title,
    activity_type: detail.activity_type,
    organization_name: detail.organization_name,
    person_in_charge: detail.person_in_charge,
    event_date: detail.event_date,
    event_end_date: detail.event_end_date,
    venue: detail.venue,
    background: detail.background,
    objectives: detail.objectives,
    target_audience: detail.target_audience,
    budget_items: detail.budget_items,
    total_budget: Number(detail.total_budget),
    status: detail.status,
    current_version: detail.current_version,
    updated_at: detail.updated_at,
    signers: detail.signers.map((s) => ({
      approver_id: s.approver_id,
      email: s.approver?.email ?? "unknown@president.ac.id",
      full_name: s.approver?.full_name ?? "Campus Approver",
      role_title: s.role_title,
      step_order: s.step_order,
      status: s.status,
    })),
    cc_users: detail.cc_users.map((c) => ({
      stakeholder_id: c.stakeholder_id,
      email: c.stakeholder?.email ?? "observer@president.ac.id",
      full_name: c.stakeholder?.full_name ?? "Campus Observer",
      organization_unit: c.stakeholder?.organization_unit ?? null,
    })),
    attachments: detail.attachments,
    latest_revision_note: latestRevisionEntry
      ? {
          note: latestRevisionEntry.note ?? "",
          actor_name: latestRevisionEntry.actor?.full_name ?? "Approver",
          created_at: latestRevisionEntry.created_at,
        }
      : null,
  };

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
      initialProposal={initialProposalData}
      initialDirectoryUsers={directoryUsers ?? []}
    />
  );
}

export default function EditProposalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-xs font-medium text-slate-500">
          Recovering saved proposal draft...
        </div>
      }
    >
      <EditProposalLoader paramsPromise={params} />
    </Suspense>
  );
}
