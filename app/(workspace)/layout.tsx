import React, { Suspense } from "react";
import { redirect } from "next/navigation";
import WorkspaceShell from "@/components/WorkspaceShell";
import { AuthGuardError, requireAuth } from "@/src/lib/auth/guard";
import { createClient } from "@/src/lib/supabase/server";

function WorkspaceShellSkeleton() {
  return (
    <div className="flex min-h-screen bg-[#F8FAFC] text-[#0F172A]">
      <div className="hidden lg:block lg:w-68 lg:border-r lg:border-[#E2E8F0] lg:bg-white" />
      <div className="flex flex-1 flex-col">
        <div className="h-16 border-b border-[#E2E8F0] bg-white" />
        <div className="flex flex-1 items-center justify-center p-8 text-xs font-medium text-slate-500">
          Verifying President University workspace session...
        </div>
      </div>
    </div>
  );
}

async function AuthenticatedWorkspaceContainer({
  children,
}: {
  children: React.ReactNode;
}) {
  let profile;
  try {
    profile = await requireAuth();
  } catch (error) {
    if (error instanceof AuthGuardError) {
      if (error.code === "UNAUTHORIZED_DOMAIN") {
        redirect("/login?error=unauthorized_domain");
      }
      if (error.code === "PROFILE_NOT_FOUND") {
        redirect("/login?error=profile_lookup_failed");
      }
    }
    redirect("/login");
  }

  const supabase = await createClient();
  const [{ count: unreadCount }, { count: assignedApprovalsCount }] =
    await Promise.all([
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", profile.id)
        .eq("is_read", false),
      supabase
        .from("proposal_signers")
        .select("id", { count: "exact", head: true })
        .eq("approver_id", profile.id),
    ]);

  return (
    <WorkspaceShell
      user={{
        id: profile.id,
        email: profile.email,
        full_name: profile.full_name,
        role: profile.role,
        organization_unit: profile.organization_unit,
        has_signature: Boolean(profile.signature_storage_path),
        has_assigned_approvals: (assignedApprovalsCount ?? 0) > 0,
      }}
      unreadNotificationsCount={unreadCount ?? 0}
    >
      {children}
    </WorkspaceShell>
  );
}

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<WorkspaceShellSkeleton />}>
      <AuthenticatedWorkspaceContainer>
        {children}
      </AuthenticatedWorkspaceContainer>
    </Suspense>
  );
}
