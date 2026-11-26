"use client";

import React from "react";

export default function PrintProposalButton() {
  const handlePrint = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  return (
    <button
      type="button"
      onClick={handlePrint}
      className="no-print inline-flex items-center gap-2 rounded-full border border-[#1E3A8A]/25 bg-[#1E3A8A]/5 px-4 py-2 text-xs font-semibold text-[#1E3A8A] transition hover:bg-[#1E3A8A]/10 focus-visible:ring-2 focus-visible:ring-[#1E3A8A] focus-visible:outline-none cursor-pointer"
    >
      <svg
        className="h-3.5 w-3.5 shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
        />
      </svg>
      <span>Print / Official PDF Sheet</span>
    </button>
  );
}
