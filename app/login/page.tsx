"use client";

import React, { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/src/lib/supabase/client";
import { buildAuthCallbackUrl } from "@/src/lib/supabase/url";
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
      "The Magic Link or one-time verification code could not be verified or has expired. Please request a fresh verification email below.",
  },
  session_expired: {
    title: "Session Expired",
    description:
      "Your institutional session has expired for security. Please sign in again to continue.",
  },
  missing_auth_code: {
    title: "Incomplete Sign-In Request",
    description:
      "No verification token was found in the callback URL. Please initiate sign-in with your campus email below.",
  },
  auth_user_unavailable: {
    title: "Account Verification Incomplete",
    description:
      "We could not retrieve your campus identity from the authentication service. Please try again.",
  },
  profile_lookup_failed: {
    title: "Profile Verification Error",
    description:
      "Unable to verify your institutional profile record. Please try again shortly.",
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
  const [otpToken, setOtpToken] = useState("");
  const [otpSentTo, setOtpSentTo] = useState<string | null>(null);

  const [isOtpLoading, setIsOtpLoading] = useState(false);
  const [isVerifyLoading, setIsVerifyLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [infoMessage, setInfoMessage] = useState("");

  const activeBanner = errorCode
    ? AUTH_ERROR_MESSAGES[errorCode] ?? {
        title: "Authentication Error",
        description:
          "We could not complete your sign-in request. Please sign in with your President University email.",
      }
    : null;

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setInfoMessage("");

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

    setIsOtpLoading(true);
    try {
      const supabase = createClient();
      const browserOrigin =
        typeof window !== "undefined" ? window.location.origin : null;
      const emailRedirectTo = buildAuthCallbackUrl(browserOrigin);

      if (typeof document !== "undefined") {
        if (nextPath !== "/dashboard") {
          document.cookie = `pupis_auth_next=${encodeURIComponent(
            nextPath
          )}; Path=/; Max-Age=600; SameSite=Lax`;
        } else {
          document.cookie = "pupis_auth_next=; Path=/; Max-Age=0; SameSite=Lax";
        }
      }

      const { error } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          shouldCreateUser: true,
          emailRedirectTo,
        },
      });

      if (error) {
        setFormError(
          error.message || "Unable to send Magic Link & OTP to this campus email."
        );
        return;
      }

      setOtpSentTo(normalizedEmail);
      setInfoMessage(
        `Check ${normalizedEmail} for your Magic Link or 6-digit one-time verification code.`
      );
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : "Network error while requesting campus sign-in link."
      );
    } finally {
      setIsOtpLoading(false);
    }
  };

  const handleVerifyOtpCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpSentTo) return;

    if (!isAllowedInstitutionalEmail(otpSentTo)) {
      setFormError(
        "Only @student.president.ac.id and @president.ac.id email addresses are permitted."
      );
      return;
    }

    const cleanToken = otpToken.trim();
    if (cleanToken.length < 6) {
      setFormError("Please enter the verification code sent to your email.");
      return;
    }

    setFormError("");
    setIsVerifyLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.verifyOtp({
        email: otpSentTo,
        token: cleanToken,
        type: "email",
      });

      if (error) {
        setFormError(
          error.message ||
            "Invalid or expired verification code. Please try again."
        );
        return;
      }

      const verifiedEmail = data.user?.email?.trim().toLowerCase() ?? "";
      if (!verifiedEmail || !isAllowedInstitutionalEmail(verifiedEmail)) {
        await supabase.auth.signOut();
        setFormError(
          "Access restricted to official President University (@student.president.ac.id and @president.ac.id) accounts."
        );
        return;
      }

      // Ensure campus profile exists in public.users after OTP verification
      const syncResponse = await fetch("/api/auth/otp", {
        method: "PUT",
      });
      if (!syncResponse.ok) {
        const syncPayload = (await syncResponse.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setFormError(
          syncPayload?.error?.message ??
            "Unable to initialize your campus profile. Please try again."
        );
        return;
      }

      router.replace(nextPath);
      router.refresh();
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : "Unable to verify one-time code."
      );
    } finally {
      setIsVerifyLoading(false);
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
          Enter your official{" "}
          <span className="font-mono font-medium text-slate-700">
            @student.president.ac.id
          </span>{" "}
          or{" "}
          <span className="font-mono font-medium text-slate-700">
            @president.ac.id
          </span>{" "}
          email to receive a Magic Link &amp; one-time code.
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

      {/* Institutional Email Magic Link / OTP Form */}
      <div className="mt-6">
        {!otpSentTo ? (
          <form onSubmit={handleRequestOtp} className="space-y-4">
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
              <p className="mt-1.5 text-[11px] text-slate-500">
                Students (<span className="font-mono">@student.president.ac.id</span>) and Staff / Advisors (<span className="font-mono">@president.ac.id</span>) sign in here.
              </p>
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
              disabled={isOtpLoading}
              className="w-full rounded-full bg-[#0F172A] px-5 py-3 text-sm font-semibold text-white shadow-xs transition hover:bg-[#1E3A8A] disabled:opacity-60 cursor-pointer"
            >
              {isOtpLoading
                ? "Sending Verification Link..."
                : "Send Magic Link & OTP Code"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtpCode} className="space-y-4">
            {infoMessage && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-xs leading-relaxed text-emerald-900">
                <p className="font-bold">Verification Sent</p>
                <p className="mt-0.5">{infoMessage}</p>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between">
                <label
                  htmlFor="otp-token"
                  className="block text-xs font-bold uppercase tracking-wider text-[#0F172A]"
                >
                  One-Time Code (Or click link in email)
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setOtpSentTo(null);
                    setOtpToken("");
                    setFormError("");
                    setInfoMessage("");
                  }}
                  className="text-xs font-semibold text-[#1E3A8A] hover:underline cursor-pointer"
                >
                  Change email
                </button>
              </div>
              <input
                id="otp-token"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={otpToken}
                onChange={(e) => setOtpToken(e.target.value)}
                placeholder="Enter verification code"
                className="mt-1.5 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2.5 font-mono text-sm tracking-widest text-[#0F172A] placeholder:tracking-normal placeholder:text-slate-400 focus:border-[#1E3A8A] focus:bg-white focus:outline-none"
              />
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
              disabled={isVerifyLoading}
              className="w-full rounded-full bg-[#0F172A] px-5 py-3 text-sm font-semibold text-white shadow-xs transition hover:bg-[#1E3A8A] disabled:opacity-60 cursor-pointer"
            >
              {isVerifyLoading
                ? "Verifying Code..."
                : "Verify & Enter Workspace"}
            </button>
          </form>
        )}
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
