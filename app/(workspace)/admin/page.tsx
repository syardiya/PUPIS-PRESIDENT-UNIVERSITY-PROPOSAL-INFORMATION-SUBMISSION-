import React, { Suspense } from "react";
import { redirect } from "next/navigation";
import { AuthGuardError, requireRole } from "@/src/lib/auth/guard";
import { createClient } from "@/src/lib/supabase/server";

async function AdminPanelSection() {
  try {
    await requireRole(["admin"]);
  } catch (err) {
    if (err instanceof AuthGuardError && err.code === "FORBIDDEN_ROLE") {
      redirect("/dashboard");
    }
    redirect("/login");
  }

  const supabase = await createClient();

  const [{ data: users }, { count: proposalCount }] = await Promise.all([
    supabase
      .from("users")
      .select("id, email, full_name, organization_unit, role, created_at")
      .order("created_at", { ascending: false })
      .limit(25),
    supabase.from("proposals").select("id", { count: "exact", head: true }),
  ]);

  const userList = users ?? [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <span className="text-xs font-bold uppercase tracking-wider text-[#1E3A8A]">
          Institutional Administration
        </span>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#0F172A]">
          Admin Panel
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Directory of verified President University users and system-wide
          governance metrics.
        </p>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-2xs">
          <span className="text-xs font-semibold text-slate-500">
            Registered Campus Users
          </span>
          <p className="mt-2 text-3xl font-bold text-[#0F172A]">
            {userList.length}
          </p>
        </div>

        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-2xs">
          <span className="text-xs font-semibold text-slate-500">
            Total Proposals in System
          </span>
          <p className="mt-2 text-3xl font-bold text-[#1E3A8A]">
            {proposalCount ?? 0}
          </p>
        </div>

        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-2xs">
          <span className="text-xs font-semibold text-slate-500">
            Whitelisted Domains
          </span>
          <p className="mt-2 font-mono text-xs font-semibold text-[#0F172A]">
            @student.president.ac.id
            <br />
            @president.ac.id
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-2xs">
        <h2 className="text-base font-bold text-[#0F172A]">
          Campus Accounts Directory
        </h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#E2E8F0] text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <th className="pb-3 pr-4">Full Name</th>
                <th className="pb-3 pr-4">Email</th>
                <th className="pb-3 pr-4">Organization Unit</th>
                <th className="pb-3">Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {userList.map((u) => (
                <tr key={u.id}>
                  <td className="py-3 pr-4 font-semibold text-[#0F172A]">
                    {u.full_name}
                  </td>
                  <td className="py-3 pr-4 font-mono text-slate-600">
                    {u.email}
                  </td>
                  <td className="py-3 pr-4 text-slate-600">
                    {u.organization_unit ?? "—"}
                  </td>
                  <td className="py-3">
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-semibold text-slate-800">
                      {u.role}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function AdminPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-xs font-medium text-slate-500">
          Loading admin panel...
        </div>
      }
    >
      <AdminPanelSection />
    </Suspense>
  );
}
