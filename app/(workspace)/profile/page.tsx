import React, { Suspense } from "react";
import { requireAuth } from "@/src/lib/auth/guard";
import ProfileSignatureClient from "@/components/ProfileSignatureClient";

async function ProfileLoaderSection() {
  const profile = await requireAuth();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <span className="text-xs font-bold uppercase tracking-wider text-[#1E3A8A]">
          Account &amp; Electronic TTD Settings
        </span>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#0F172A]">
          Profile &amp; Digital Signature
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage your institutional display details and configure your verified
          transparent PNG signature for proposal sign-offs.
        </p>
      </div>

      <ProfileSignatureClient initialProfile={profile} />
    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-xs font-medium text-slate-500">
          Loading profile &amp; signature settings...
        </div>
      }
    >
      <ProfileLoaderSection />
    </Suspense>
  );
}
