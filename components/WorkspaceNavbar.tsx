"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { usePupis } from "./PupisProvider";

export default function WorkspaceNavbar() {
  const { currentUser, signOut } = usePupis();
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!currentUser) return null;

  const initials = currentUser.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  const handleSignOut = () => {
    setMenuOpen(false);
    signOut();
    router.push("/");
  };

  return (
    <header className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        {/* Left: PUPIS Brand + Clean Navigation */}
        <div className="flex items-center gap-8">
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

          <nav className="hidden items-center gap-1 sm:flex">
            <Link
              href="/dashboard"
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                pathname === "/dashboard"
                  ? "bg-slate-100 text-[#0F172A]"
                  : "text-slate-600 hover:bg-slate-50 hover:text-[#0F172A]"
              }`}
            >
              Proposals
            </Link>
          </nav>
        </div>

        {/* Right: + New Proposal (Submitter only) + User Avatar/Email Dropdown */}
        <div className="flex items-center gap-3">
          {currentUser.id === "submitter" && (
            <Link
              href="/proposals/new"
              className="inline-flex items-center gap-1.5 rounded-full bg-[#0F172A] px-4 py-2 text-xs font-semibold text-white shadow-2xs transition hover:bg-[#1E3A8A]"
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
              <span>New Proposal</span>
            </Link>
          )}

          {/* User Account Dropdown */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              className="flex items-center gap-2.5 rounded-full border border-[#E2E8F0] bg-white py-1 pr-3 pl-1.5 text-left transition hover:border-slate-300 hover:bg-slate-50 cursor-pointer"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#1E3A8A] text-[11px] font-bold text-white">
                {initials || "PU"}
              </span>
              <div className="hidden max-w-[200px] sm:block">
                <p className="truncate text-xs font-semibold text-[#0F172A]">
                  {currentUser.email}
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
                  <span className="inline-flex items-center rounded-full bg-[#1E3A8A]/10 px-2.5 py-0.5 text-[10px] font-bold text-[#1E3A8A]">
                    {currentUser.badgeText}
                  </span>
                  <p className="mt-1.5 text-sm font-bold text-[#0F172A]">
                    {currentUser.name}
                  </p>
                  <p className="truncate font-mono text-xs text-slate-500">
                    {currentUser.email}
                  </p>
                </div>

                <div className="mt-1 p-1">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleSignOut}
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
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
