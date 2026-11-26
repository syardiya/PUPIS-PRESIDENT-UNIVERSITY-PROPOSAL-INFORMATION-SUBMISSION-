"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { UserRole } from "@/src/lib/supabase/database.types";

export interface WorkspaceShellUser {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  organization_unit: string | null;
  has_signature: boolean;
}

interface WorkspaceShellProps {
  user: WorkspaceShellUser;
  unreadNotificationsCount: number;
  children: React.ReactNode;
}

interface NavItem {
  href: string;
  label: string;
  visible: (role: UserRole | string) => boolean;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    visible: () => true,
    icon: (
      <svg
        className="h-4 w-4 shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
        />
      </svg>
    ),
  },
  {
    href: "/proposals",
    label: "Proposals",
    visible: () => true,
    icon: (
      <svg
        className="h-4 w-4 shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
    ),
  },
  {
    href: "/approvals",
    label: "Approval Queue",
    visible: (role) => role === "staff" || role === "approver" || role === "admin",
    icon: (
      <svg
        className="h-4 w-4 shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
  },
  {
    href: "/archive",
    label: "Archive",
    visible: () => true,
    icon: (
      <svg
        className="h-4 w-4 shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
        />
      </svg>
    ),
  },
  {
    href: "/profile",
    label: "Profile & Signature",
    visible: () => true,
    icon: (
      <svg
        className="h-4 w-4 shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
        />
      </svg>
    ),
  },
  {
    href: "/admin",
    label: "Admin Panel",
    visible: (role) => role === "admin",
    icon: (
      <svg
        className="h-4 w-4 shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
        />
      </svg>
    ),
  },
];

function getRoleBadgeMeta(role: UserRole): { label: string; classes: string } {
  switch (role) {
    case "admin":
      return {
        label: "Administrator",
        classes: "bg-indigo-100 text-indigo-900 border-indigo-200",
      };
    case "staff":
      return {
        label: "Approver / Staff",
        classes: "bg-[#1E3A8A]/10 text-[#1E3A8A] border-[#1E3A8A]/20",
      };
    case "student":
    default:
      return {
        label: "Student Submitter",
        classes: "bg-slate-100 text-slate-800 border-slate-200",
      };
  }
}

export default function WorkspaceShell({
  user,
  unreadNotificationsCount,
  children,
}: WorkspaceShellProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close mobile drawer on Escape key
  useEffect(() => {
    if (!mobileMenuOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMobileMenuOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileMenuOpen]);

  const visibleNavItems = NAV_ITEMS.filter((item) => item.visible(user.role));
  const roleBadge = getRoleBadgeMeta(user.role);

  const initials = user.full_name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  const isNavItemActive = (href: string) => {
    if (href === "/dashboard") {
      return pathname === "/dashboard";
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <div className="flex min-h-screen bg-[#F8FAFC] text-[#0F172A]">
      {/* Desktop Sidebar */}
      <aside
        aria-label="Primary Workspace Navigation"
        className="hidden lg:fixed lg:inset-y-0 lg:z-30 lg:flex lg:w-68 lg:flex-col lg:border-r lg:border-[#E2E8F0] lg:bg-white"
      >
        {/* Brand Header */}
        <div className="flex h-16 items-center justify-between border-b border-[#E2E8F0] px-5">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0F172A] text-xs font-bold tracking-wider text-white shadow-2xs">
              PU
            </div>
            <div className="leading-tight">
              <span className="block text-sm font-bold tracking-tight text-[#0F172A]">
                PUPIS
              </span>
              <span className="block text-[11px] text-slate-500">
                President University
              </span>
            </div>
          </Link>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3.5 py-5">
          {visibleNavItems.map((item) => {
            const active = isNavItemActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-semibold transition focus-visible:ring-2 focus-visible:ring-[#1E3A8A] focus-visible:outline-none ${
                  active
                    ? "bg-[#0F172A] text-white shadow-2xs"
                    : "text-slate-600 hover:bg-slate-100 hover:text-[#0F172A]"
                }`}
              >
                <span className="flex items-center gap-3">
                  {item.icon}
                  <span>{item.label}</span>
                </span>
                {item.href === "/profile" && !user.has_signature && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      active
                        ? "bg-white/20 text-white"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    Setup TTD
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* User Identity & Sign-Out Footer */}
        <div className="border-t border-[#E2E8F0] p-4">
          <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-3.5">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1E3A8A] text-xs font-bold text-white">
                {initials || "PU"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-[#0F172A]">
                  {user.full_name}
                </p>
                <p className="truncate font-mono text-[11px] text-slate-500">
                  {user.email}
                </p>
                {user.organization_unit && (
                  <p className="mt-0.5 truncate text-[11px] font-medium text-[#1E3A8A]">
                    {user.organization_unit}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2 border-t border-[#E2E8F0] pt-2.5">
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${roleBadge.classes}`}
              >
                {roleBadge.label}
              </span>

              <form action="/auth/signout" method="POST">
                <button
                  type="submit"
                  className="rounded-lg px-2 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:outline-none cursor-pointer"
                >
                  Sign Out
                </button>
              </form>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile Off-Canvas Drawer */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 flex lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile Navigation Menu"
        >
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          />

          <div
            id="workspace-mobile-drawer"
            className="relative z-10 flex w-76 max-w-[85vw] flex-col bg-white shadow-2xl"
          >
            <div className="flex h-16 items-center justify-between border-b border-[#E2E8F0] px-4">
              <Link
                href="/dashboard"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-2.5"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#0F172A] text-xs font-bold text-white">
                  PU
                </div>
                <span className="text-sm font-bold text-[#0F172A]">PUPIS</span>
              </Link>

              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close navigation drawer"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-[#0F172A] focus-visible:ring-2 focus-visible:ring-[#1E3A8A] focus-visible:outline-none cursor-pointer"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
              {visibleNavItems.map((item) => {
                const active = isNavItemActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-semibold transition ${
                      active
                        ? "bg-[#0F172A] text-white"
                        : "text-slate-600 hover:bg-slate-100 hover:text-[#0F172A]"
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      {item.icon}
                      <span>{item.label}</span>
                    </span>
                  </Link>
                );
              })}
            </nav>

            <div className="border-t border-[#E2E8F0] p-4">
              <div className="mb-3">
                <p className="truncate text-xs font-bold text-[#0F172A]">
                  {user.full_name}
                </p>
                <p className="truncate font-mono text-[11px] text-slate-500">
                  {user.email}
                </p>
                {user.organization_unit && (
                  <p className="mt-0.5 truncate text-[11px] font-medium text-[#1E3A8A]">
                    {user.organization_unit}
                  </p>
                )}
                <span
                  className={`mt-2 inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${roleBadge.classes}`}
                >
                  {roleBadge.label}
                </span>
              </div>

              <form action="/auth/signout" method="POST">
                <button
                  type="submit"
                  className="w-full rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-800 transition hover:bg-rose-100 cursor-pointer"
                >
                  Sign Out
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Column */}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-68">
        {/* Top Workspace Header */}
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-[#E2E8F0] bg-white/95 px-4 backdrop-blur-md sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-expanded={mobileMenuOpen}
              aria-controls="workspace-mobile-drawer"
              aria-label="Open navigation menu"
              className="rounded-xl border border-[#E2E8F0] bg-white p-2 text-slate-700 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-[#1E3A8A] focus-visible:outline-none lg:hidden cursor-pointer"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>

            <div className="hidden sm:block">
              <span className="text-xs font-semibold text-slate-500">
                {user.organization_unit
                  ? `${user.organization_unit} • `
                  : "President University • "}
              </span>
              <span className="text-xs font-bold text-[#0F172A]">
                {roleBadge.label}
              </span>
            </div>
          </div>

          {/* Right Actions: Unread Notifications Badge + New Proposal CTA */}
          <div className="flex items-center gap-3">
            {/* Unread Notifications Counter Badge */}
            <Link
              href="/dashboard#notifications"
              aria-label={`Notifications (${unreadNotificationsCount} unread)`}
              className="relative inline-flex items-center gap-2 rounded-full border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-1.5 text-xs font-semibold text-[#0F172A] transition hover:border-slate-300 hover:bg-white focus-visible:ring-2 focus-visible:ring-[#1E3A8A] focus-visible:outline-none"
            >
              <svg
                className="h-4 w-4 text-slate-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
              <span className="hidden sm:inline">Notifications</span>
              <span
                className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  unreadNotificationsCount > 0
                    ? "bg-[#1E3A8A] text-white"
                    : "bg-slate-200 text-slate-700"
                }`}
              >
                {unreadNotificationsCount}
              </span>
            </Link>

            {(user.role === "student" || user.role === "admin") && (
              <Link
                href="/proposals/new"
                className="inline-flex items-center gap-1.5 rounded-full bg-[#0F172A] px-4 py-2 text-xs font-semibold text-white shadow-2xs transition hover:bg-[#1E3A8A] focus-visible:ring-2 focus-visible:ring-[#1E3A8A] focus-visible:outline-none"
              >
                <span>+ New Proposal</span>
              </Link>
            )}
          </div>
        </header>

        {/* Workspace Page Body */}
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
