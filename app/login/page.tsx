"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CAMPUS_ACCOUNTS, CampusAccount } from "../../components/types";
import { usePupis } from "../../components/PupisProvider";

export default function CampusLoginPage() {
  const router = useRouter();
  const { currentUser, isHydrated, signInWithCredentials, signInWithAccount } =
    usePupis();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (isHydrated && currentUser) {
      router.replace("/dashboard");
    }
  }, [isHydrated, currentUser, router]);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const result = signInWithCredentials(email, password);
    if (!result.ok) {
      setError(result.error ?? "Unable to sign in.");
      return;
    }
    router.push("/dashboard");
  };

  const handleQuickSignIn = (account: CampusAccount) => {
    signInWithAccount(account);
    router.push("/dashboard");
  };

  return (
    <div className="relative flex min-h-screen flex-col justify-between bg-[#F8FAFC] text-[#0F172A]">
      {/* Subtle Ambient Gradient */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-0 left-1/2 -z-10 h-[380px] w-[820px] -translate-x-1/2 rounded-full bg-gradient-to-tr from-[#1E3A8A]/10 via-indigo-200/30 to-sky-100/40 blur-3xl"
      />

      {/* Minimal Header */}
      <header className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#0F172A] text-xs font-bold tracking-wider text-white">
            PU
          </div>
          <span className="text-sm font-bold tracking-tight text-[#0F172A]">
            PUPIS
          </span>
        </Link>

        <Link
          href="/"
          className="text-xs font-semibold text-slate-600 transition hover:text-[#0F172A]"
        >
          ← Back to Home
        </Link>
      </header>

      {/* Centered Login Card */}
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10 sm:px-6">
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-7 shadow-lg shadow-slate-900/5 sm:p-8">
          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0F172A] text-sm font-bold tracking-wider text-white shadow-xs">
              PU
            </div>
            <h1 className="mt-4 text-2xl font-bold tracking-tight text-[#0F172A]">
              Sign in to PUPIS
            </h1>
            <p className="mt-1.5 text-xs text-slate-500">
              Use your official President University institutional email.
            </p>
          </div>

          <form onSubmit={handleFormSubmit} className="mt-7 space-y-4">
            <div>
              <label
                htmlFor="campus-email"
                className="block text-xs font-bold uppercase tracking-wider text-[#0F172A]"
              >
                Campus Email
              </label>
              <input
                id="campus-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@student.president.ac.id"
                className="mt-1.5 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2.5 text-sm text-[#0F172A] placeholder:text-slate-400 focus:border-[#1E3A8A] focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="campus-password"
                className="block text-xs font-bold uppercase tracking-wider text-[#0F172A]"
              >
                Password
              </label>
              <input
                id="campus-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="mt-1.5 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2.5 text-sm text-[#0F172A] placeholder:text-slate-400 focus:border-[#1E3A8A] focus:bg-white focus:outline-none"
              />
            </div>

            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="mt-2 w-full rounded-full bg-[#0F172A] px-5 py-3 text-sm font-semibold text-white shadow-xs transition hover:bg-[#1E3A8A] cursor-pointer"
            >
              Sign In
            </button>
          </form>

          {/* Subtle Quick Sign-In for Evaluation */}
          <div className="mt-7 border-t border-[#E2E8F0] pt-6">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Quick Sign-In for Evaluation
              </span>
              <span className="text-[11px] text-slate-400">1-Click Access</span>
            </div>

            <div className="mt-3 space-y-2">
              {CAMPUS_ACCOUNTS.map((account) => (
                <button
                  key={account.id}
                  type="button"
                  onClick={() => handleQuickSignIn(account)}
                  className="group flex w-full items-center justify-between gap-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2.5 text-left transition hover:border-[#1E3A8A] hover:bg-white cursor-pointer"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[#0F172A]">
                        {account.id === "submitter"
                          ? "Student Org Submitter"
                          : account.id === "approver"
                          ? "Approver / TTD"
                          : "CC Observer"}
                      </span>
                      <span className="rounded-full bg-slate-200/70 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                        {account.badgeText}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate font-mono text-[11px] text-[#1E3A8A]">
                      {account.email}
                    </p>
                  </div>

                  <span className="shrink-0 text-xs font-semibold text-slate-400 transition group-hover:text-[#0F172A]">
                    →
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </main>

      <footer className="py-5 text-center text-xs text-slate-400">
        President University Single Sign-On • PUPIS
      </footer>
    </div>
  );
}
