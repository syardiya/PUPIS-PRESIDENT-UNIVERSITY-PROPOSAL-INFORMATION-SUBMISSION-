"use client";

import React, { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/src/lib/supabase/client";
import {
  isAllowedInstitutionalEmail,
  sanitizeRedirectPath,
} from "@/src/lib/auth/domain";

const AUTH_ERROR_MESSAGES: Record<
  string,
  { title: string; description: string }
> = {
  unauthorized_domain: {
    title: "Institutional Email Required",
    description:
      "Access to PUPIS is strictly limited to official President University accounts (@student.president.ac.id and @president.ac.id). Your session has been terminated.",
  },
  auth_callback_failed: {
    title: "Sign-In Verification Failed",
    description:
      "Your authentication request could not be verified. Please sign in with your campus email and password below.",
  },
  session_expired: {
    title: "Session Expired",
    description:
      "Your institutional session has expired for security. Please sign in again to continue.",
  },
  missing_auth_code: {
    title: "Incomplete Sign-In Request",
    description:
      "Please sign in using your official campus email and password below.",
  },
  auth_user_unavailable: {
    title: "Account Verification Incomplete",
    description:
      "We could not retrieve your campus identity from the authentication service. Please try again.",
  },
  profile_lookup_failed: {
    title: "Profile Verification Error",
    description:
      "Unable to verify your institutional profile record. Please sign in again.",
  },
  profile_sync_failed: {
    title: "Profile Provisioning Error",
    description:
      "Your campus account was authenticated, but profile initialization failed. Please contact Student Affairs IT support.",
  },
  auth_not_configured: {
    title: "Authentication Service Unavailable",
    description:
      "Campus authentication environment variables are not yet configured on this server.",
  },
};

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const errorCode = searchParams.get("error");
  const nextPath = sanitizeRedirectPath(searchParams.get("next"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const activeBanner = errorCode
    ? AUTH_ERROR_MESSAGES[errorCode] ?? {
        title: "Authentication Error",
        description:
          "We could not complete your sign-in request. Please sign in with your President University email and password.",
      }
    : null;

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setFormError("Please enter your President University email address.");
      return;
    }

    if (!isAllowedInstitutionalEmail(normalizedEmail)) {
      setFormError(
        "Only @student.president.ac.id and @president.ac.id email addresses are permitted."
      );
      return;
    }

    if (!password) {
      setFormError("Please enter your password.");
      return;
    }

    setIsSubmitting(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error || !data.user) {
        setFormError(
          error?.message || "Invalid campus email or password. Please try again."
        );
        return;
      }

      const verifiedEmail = data.user.email?.trim().toLowerCase() ?? "";
      if (!verifiedEmail || !isAllowedInstitutionalEmail(verifiedEmail)) {
        await supabase.auth.signOut();
        setFormError(
          "Access restricted to official President University (@student.president.ac.id and @president.ac.id) accounts."
        );
        return;
      }

      // Server-side profile check & idempotent initialization in `public.users` via Service Role
      const headers: Record<string, string> = {};
      if (data.session?.access_token) {
        headers.Authorization = `Bearer ${data.session.access_token}`;
      }

      const syncResponse = await fetch("/api/auth/otp", {
        method: "PUT",
        credentials: "same-origin",
        headers,
      });

      if (!syncResponse.ok) {
        const syncPayload = (await syncResponse.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setFormError(
          syncPayload?.error?.message ??
            "Unable to initialize your campus profile. Please contact Student Affairs IT support."
        );
        return;
      }

      router.replace(nextPath);
      router.refresh();
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : "Network error while signing in to campus workspace."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-[#E2E8F0] bg-white p-7 shadow-lg shadow-slate-900/5 sm:p-8">
      {/* Header */}
      <div className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0F172A] text-sm font-bold tracking-wider text-white shadow-xs">
          PU
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-[#0F172A]">
          Institutional Sign In
        </h1>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
          Sign in with your official{" "}
          <span className="font-mono font-medium text-slate-700">
            @student.president.ac.id
          </span>{" "}
          or{" "}
          <span className="font-mono font-medium text-slate-700">
            @president.ac.id
          </span>{" "}
          email and password.
        </p>
      </div>

      {/* Redirect / Callback Error Banner */}
      {activeBanner && (
        <div
          role="alert"
          className="mt-6 rounded-2xl border border-rose-200 bg-rose-50/90 p-4 text-left"
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-600 text-[11px] font-bold text-white">
              !
            </span>
            <div>
              <p className="text-xs font-bold text-rose-900">
                {activeBanner.title}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-rose-800">
                {activeBanner.description}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Preserved Destination Notice */}
      {nextPath !== "/dashboard" && (
        <div className="mt-5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2.5 text-xs text-slate-600">
          You will be redirected to{" "}
          <span className="font-mono font-semibold text-[#0F172A]">
            {nextPath}
          </span>{" "}
          after signing in.
        </div>
      )}

      {/* Institutional Email + Password Form */}
      <div className="mt-6">
        <form onSubmit={handleSignIn} className="space-y-4">
          <div>
            <label
              htmlFor="campus-email"
              className="block text-xs font-bold uppercase tracking-wider text-[#0F172A]"
            >
              Institutional Email
            </label>
            <input
              id="campus-email"
              type="email"
              autoComplete="email"
              required
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
            <div className="relative mt-1.5">
              <input
                id="campus-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] py-2.5 pr-11 pl-3.5 text-sm text-[#0F172A] placeholder:text-slate-400 focus:border-[#1E3A8A] focus:bg-white focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400 transition hover:text-[#0F172A] focus-visible:text-[#1E3A8A] focus-visible:outline-none cursor-pointer"
              >
                {showPassword ? (
                  /* EyeOff icon */
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M1 1l22 22"
                    />
                  </svg>
                ) : (
                  /* Eye icon */
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
                    />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {formError && (
            <div
              role="alert"
              className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700"
            >
              {formError}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-full bg-[#0F172A] px-5 py-3 text-sm font-semibold text-white shadow-xs transition hover:bg-[#1E3A8A] disabled:opacity-60 cursor-pointer"
          >
            {isSubmitting ? "Signing In..." : "Sign In"}
          </button>
        </form>
      </div>

      {/* Domain Security Notice */}
      <div className="mt-6 border-t border-[#E2E8F0] pt-4 text-center">
        <p className="text-[11px] leading-relaxed text-slate-400">
          Protected by President University Zero-Trust Domain Guard. Non-campus
          accounts are automatically rejected.
        </p>
      </div>
    </div>
  );
}

export default function CampusLoginPage() {
  return (
    <div className="relative flex min-h-screen flex-col justify-between bg-[#F8FAFC] text-[#0F172A]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-0 left-1/2 -z-10 h-[380px] w-[820px] -translate-x-1/2 rounded-full bg-gradient-to-tr from-[#1E3A8A]/10 via-indigo-200/30 to-sky-100/40 blur-3xl"
      />

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
          ← Back to Portal
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10 sm:px-6">
        <Suspense
          fallback={
            <div className="rounded-2xl border border-[#E2E8F0] bg-white p-8 text-center text-xs font-medium text-slate-500 shadow-xs">
              Loading President University Sign-In...
            </div>
          }
        >
          <LoginFormContent />
        </Suspense>
      </main>

      <footer className="py-5 text-center text-xs text-slate-400">
        President University Proposal Information Submission • PUPIS
      </footer>
    </div>
  );
}
