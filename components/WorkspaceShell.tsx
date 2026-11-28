"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type {
  FunctionalRoleDb,
  UserRole,
} from "@/src/lib/supabase/database.types";
import {
  formatFunctionalAuthorityLabel,
  isFacultySecretaryProfile,
} from "@/src/lib/proposals/approver-authority";
import NotificationBellPopover, {
  type WorkspaceNotificationItem,
} from "./NotificationBellPopover";

export interface WorkspaceShellUser {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  functional_role?: FunctionalRoleDb | null;
  organization_unit: string | null;
  has_signature: boolean;
  has_assigned_approvals?: boolean;
}

interface WorkspaceShellProps {
  user: WorkspaceShellUser;
  unreadNotificationsCount: number;
  initialNotifications?: WorkspaceNotificationItem[];
  children: React.ReactNode;
}

interface NavItem {
  href: string;
  label: string;
  visible: (role: UserRole | string) => boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    visible: () => true,
  },
  {
    href: "/proposals",
    label: "Proposals",
    visible: () => true,
  },
  {
    href: "/approvals",
    label: "Approval Queue",
    visible: (role) =>
      role === "staff" || role === "approver" || role === "admin",
  },
  {
    href: "/archive",
    label: "Archive",
    visible: () => true,
  },
  {
    href: "/admin",
    label: "Governance",
    visible: (role) => role === "staff" || role === "admin",
  },
];

function getRoleBadgeMeta(user: WorkspaceShellUser): {
  label: string;
  classes: string;
} {
  if (user.role === "admin") {
    return {
      label: "Administrator",
      classes: "bg-indigo-100 text-indigo-900 border-indigo-200",
    };
  }
  if (user.role === "staff") {
    return {
      label: user.functional_role
        ? formatFunctionalAuthorityLabel(user)
        : "Approver / Staff",
      classes: "bg-[#1E3A8A]/10 text-[#1E3A8A] border-[#1E3A8A]/20",
    };
  }
  return {
    label: "Student Org Submitter",
    classes: "bg-[#1E3A8A]/10 text-[#1E3A8A] border-[#1E3A8A]/20",
  };
}

export default function WorkspaceShell({
  user,
  unreadNotificationsCount,
  initialNotifications = [],
  children,
}: WorkspaceShellProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setMobileNavOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const isSecretary = isFacultySecretaryProfile(user);
  const isStudentAffairsOfficer = user.functional_role === "student_affairs";
  const requiresSignature = !isSecretary;

  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (item.href === "/approvals" && user.has_assigned_approvals) {
      return true;
    }
    return item.visible(user.role);
  }).map((item) => {
    if (item.href === "/approvals" && isSecretary) {
      return { ...item, label: "Secretary Intake" };
    }
    if (item.href === "/approvals" && isStudentAffairsOfficer) {
      return { ...item, label: "Final Signature" };
    }
    return item;
  });

  const roleBadge = getRoleBadgeMeta(user);

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
    <div className="workspace-main-column relative flex min-h-screen flex-col bg-[#F8FAFC] text-[#0F172A]">
      {/* Subtle Prototype Top Ambient Glow */}
      <div
        aria-hidden="true"
        className="no-print pointer-events-none fixed top-0 left-1/2 -z-10 h-[340px] w-[960px] -translate-x-1/2 rounded-full bg-gradient-to-tr from-[#1E3A8A]/[0.06] via-indigo-200/20 to-sky-100/30 blur-3xl"
      />

      {/* Sticky Top Workspace Navbar (Prototype Style) */}
      <header className="no-print sticky top-0 z-30 border-b border-[#E2E8F0] bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          {/* Left: Mobile Trigger + PUPIS Brand + Horizontal Navigation */}
          <div className="flex items-center gap-4 lg:gap-8">
            <button
              type="button"
              onClick={() => setMobileNavOpen((prev) => !prev)}
              aria-expanded={mobileNavOpen}
              aria-label="Toggle workspace navigation"
              className="rounded-xl border border-[#E2E8F0] bg-white p-2 text-slate-700 transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-[#1E3A8A] focus-visible:outline-none md:hidden cursor-pointer"
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
                  d={
                    mobileNavOpen
                      ? "M6 18L18 6M6 6l12 12"
                      : "M4 6h16M4 12h16M4 18h16"
                  }
                />
              </svg>
            </button>

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

            <nav
              aria-label="Primary Workspace Navigation"
              className="hidden items-center gap-1 md:flex"
            >
              {visibleNavItems.map((item) => {
                const active = isNavItemActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition sm:text-sm ${
                      active
                        ? "bg-slate-100 text-[#0F172A]"
                        : "text-slate-600 hover:bg-slate-50 hover:text-[#0F172A]"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right: + New Proposal + Notifications Bell + User Avatar/Email Dropdown */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            {(user.role === "student" || user.role === "admin") && (
              <Link
                href="/proposals/new"
                className="inline-flex items-center gap-1.5 rounded-full bg-[#0F172A] px-3.5 py-2 text-xs font-semibold text-white shadow-2xs transition hover:bg-[#1E3A8A] sm:px-4"
              >
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                <span className="hidden sm:inline">New Proposal</span>
                <span className="sm:hidden">New</span>
              </Link>
            )}

            <NotificationBellPopover
              key={`${unreadNotificationsCount}-${initialNotifications[0]?.id ?? "empty"}`}
              initialUnreadCount={unreadNotificationsCount}
              initialNotifications={initialNotifications}
            />

            {/* User Account Dropdown (Prototype Pill Style) */}
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((prev) => !prev)}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                className="flex items-center gap-2.5 rounded-full border border-[#E2E8F0] bg-white py-1 pr-3 pl-1.5 text-left transition hover:border-slate-300 hover:bg-slate-50 cursor-pointer"
              >
                <span className="relative flex h-7 w-7 items-center justify-center rounded-full bg-[#1E3A8A] text-[11px] font-bold text-white">
                  {initials || "PU"}
                  {requiresSignature && !user.has_signature && (
                    <span
                      title="Digital Signature (TTD) not configured yet"
                      className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-amber-500"
                    />
                  )}
                </span>
                <div className="hidden max-w-[190px] lg:block">
                  <p className="truncate text-xs font-semibold text-[#0F172A]">
                    {user.email}
                  </p>
                </div>
                <svg
                  className={`h-3.5 w-3.5 text-slate-400 transition ${
                    menuOpen ? "rotate-180" : ""
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-72 rounded-2xl border border-[#E2E8F0] bg-white p-2 shadow-lg shadow-slate-900/10"
                >
                  <div className="border-b border-[#E2E8F0] px-3 py-2.5">
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${roleBadge.classes}`}
                    >
                      {roleBadge.label}
                    </span>
                    <p className="mt-1.5 truncate text-sm font-bold text-[#0F172A]">
                      {user.full_name}
                    </p>
                    <p className="truncate font-mono text-xs text-slate-500">
                      {user.email}
                    </p>
                    {user.organization_unit && (
                      <p className="mt-0.5 truncate text-[11px] font-medium text-[#1E3A8A]">
                        {user.organization_unit}
                      </p>
                    )}
                  </div>

                  <div className="mt-1 space-y-0.5 p-1">
                    <Link
                      href="/profile"
                      role="menuitem"
                      onClick={() => setMenuOpen(false)}
                      className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold text-[#0F172A] transition hover:bg-slate-50"
                    >
                      <span className="flex items-center gap-2">
                        <svg
                          className="h-4 w-4 text-slate-500"
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
                        <span>Profile &amp; Signature (TTD)</span>
                      </span>
                      {requiresSignature && !user.has_signature && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                          Setup TTD
                        </span>
                      )}
                    </Link>

                    <form action="/auth/signout" method="POST">
                      <button
                        type="submit"
                        role="menuitem"
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold text-rose-700 transition hover:bg-rose-50 cursor-pointer"
                      >
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                          />
                        </svg>
                        <span>Sign Out</span>
                      </button>
                    </form>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Collapsible Mobile Navigation Bar */}
        {mobileNavOpen && (
          <nav
            aria-label="Mobile Workspace Navigation"
            className="border-t border-[#E2E8F0] bg-white px-4 py-3 md:hidden"
          >
            <div className="flex flex-col space-y-1">
              {visibleNavItems.map((item) => {
                const active = isNavItemActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileNavOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                      active
                        ? "bg-[#0F172A] text-white"
                        : "text-slate-600 hover:bg-slate-100 hover:text-[#0F172A]"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
              <Link
                href="/profile"
                onClick={() => setMobileNavOpen(false)}
                className={`flex items-center justify-between rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                  isNavItemActive("/profile")
                    ? "bg-[#0F172A] text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-[#0F172A]"
                }`}
              >
                <span>Profile &amp; Signature</span>
                {requiresSignature && !user.has_signature && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                    Setup TTD
                  </span>
                )}
              </Link>
            </div>
          </nav>
        )}
      </header>

      {/* Workspace Page Body */}
      <main className="flex-1">{children}</main>

      {/* Clean Institutional Footer */}
      <footer className="no-print border-t border-[#E2E8F0] bg-white py-4">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 text-xs text-slate-400 sm:px-6 lg:px-8">
          <span>
            <strong className="font-semibold text-slate-600">PUPIS</strong> •
            President University Proposal Information Submission
          </span>
          <span>Directorate of Student Affairs • Jababeka Campus</span>
        </div>
      </footer>
    </div>
  );
}
