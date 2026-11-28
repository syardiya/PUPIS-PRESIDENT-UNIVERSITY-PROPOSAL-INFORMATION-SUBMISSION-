import React, { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import WorkspaceShell from "@/components/WorkspaceShell";
import { AuthGuardError, requireAuth } from "@/src/lib/auth/guard";
import { createClient } from "@/src/lib/supabase/server";

function WorkspaceShellSkeleton() {
  return (
    <div className="flex min-h-screen flex-col bg-[#F8FAFC] text-[#0F172A]">
      <div className="h-16 border-b border-[#E2E8F0] bg-white/95" />
      <div className="flex flex-1 items-center justify-center p-8 text-xs font-medium text-slate-500">
        Verifying President University workspace session...
      </div>
    </div>
  );
}

async function AuthenticatedWorkspaceContainer({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();

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
  const [
    { count: unreadCount },
    { data: recentNotifications },
    { count: assignedApprovalsCount },
  ] = await Promise.all([
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", profile.id)
      .eq("is_read", false),
    supabase
      .from("notifications")
      .select("id, proposal_id, title, message, is_read, created_at")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(12),
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
        functional_role: profile.functional_role,
        organization_unit: profile.organization_unit,
        has_signature: Boolean(profile.signature_storage_path),
        has_assigned_approvals: (assignedApprovalsCount ?? 0) > 0,
      }}
      unreadNotificationsCount={unreadCount ?? 0}
      initialNotifications={recentNotifications ?? []}
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
