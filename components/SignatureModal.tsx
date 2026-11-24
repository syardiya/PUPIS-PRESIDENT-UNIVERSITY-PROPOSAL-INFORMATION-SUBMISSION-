"use client";

import React, { useEffect, useRef, useState } from "react";
import { CampusAccount, Proposal, SignaturePayload, SignatureType } from "./types";

interface SignatureModalProps {
  isOpen: boolean;
  proposal: Proposal;
  approver: CampusAccount;
  onClose: () => void;
  onConfirm: (payload: SignaturePayload) => void;
}

function getPreviewTimestamp(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min} WIB`;
}

export default function SignatureModal({
  isOpen,
  proposal,
  approver,
  onClose,
  onConfirm,
}: SignatureModalProps) {
  const [activeTab, setActiveTab] = useState<SignatureType>("drawn");
  const [hasDrawn, setHasDrawn] = useState(false);
  const [drawError, setDrawError] = useState("");
  const [stampTimestamp] = useState<string>(() => getPreviewTimestamp());

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);

  // Initialize high-DPI HTML5 canvas whenever modal opens on Draw tab
  useEffect(() => {
    if (!isOpen || activeTab !== "drawn") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0F172A";
    ctx.lineWidth = 2.5;
  }, [isOpen, activeTab]);

  if (!isOpen) return null;

  const getPointerPosition = (
    e: React.PointerEvent<HTMLCanvasElement>
  ): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.setPointerCapture(e.pointerId);
    const { x, y } = getPointerPosition(e);
    isDrawingRef.current = true;
    ctx.beginPath();
    ctx.moveTo(x, y);
    setHasDrawn(true);
    setDrawError("");
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { x, y } = getPointerPosition(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    const canvas = canvasRef.current;
    if (canvas && canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }
  };

  const handleClearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
    setDrawError("");
  };

  const handleConfirmSign = () => {
    if (activeTab === "drawn") {
      if (!hasDrawn || !canvasRef.current) {
        setDrawError(
          "Please draw your signature above the line, or switch to Official Digital Stamp."
        );
        return;
      }
      const dataUrl = canvasRef.current.toDataURL("image/png");
      onConfirm({
        signatureType: "drawn",
        signatureImageUrl: dataUrl,
      });
      return;
    }

    onConfirm({
      signatureType: "stamp",
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="signature-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
    >
      <div className="w-full max-w-lg rounded-2xl border border-[#E2E8F0] bg-white shadow-2xl shadow-slate-900/20 overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-4 border-b border-[#E2E8F0] px-6 py-5">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#1E3A8A]/10 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-[#1E3A8A]">
              Digital TTD Sign-Off
            </span>
            <h2
              id="signature-modal-title"
              className="mt-1.5 text-lg font-bold text-[#0F172A]"
            >
              Approve &amp; Sign Proposal
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {proposal.code} • {proposal.title}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close signing modal"
            className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
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

        {/* Tab Selector */}
        <div className="px-6 pt-5">
          <div className="grid grid-cols-2 gap-1.5 rounded-full border border-[#E2E8F0] bg-[#F8FAFC] p-1">
            <button
              type="button"
              onClick={() => {
                setActiveTab("drawn");
                setDrawError("");
              }}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition cursor-pointer ${
                activeTab === "drawn"
                  ? "bg-[#0F172A] text-white shadow-2xs"
                  : "text-slate-600 hover:text-[#0F172A]"
              }`}
            >
              Draw Signature
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab("stamp");
                setDrawError("");
              }}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition cursor-pointer ${
                activeTab === "stamp"
                  ? "bg-[#0F172A] text-white shadow-2xs"
                  : "text-slate-600 hover:text-[#0F172A]"
              }`}
            >
              Official Digital Stamp
            </button>
          </div>
        </div>

        {/* Tab Body */}
        <div className="px-6 py-5">
          {activeTab === "drawn" ? (
            <div>
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-[#0F172A]">
                  Sign below using your mouse or touchpad
                </p>
                <button
                  type="button"
                  onClick={handleClearCanvas}
                  className="text-xs font-semibold text-[#1E3A8A] hover:underline cursor-pointer"
                >
                  Clear
                </button>
              </div>

              <div className="relative mt-2.5 overflow-hidden rounded-2xl border-2 border-dashed border-slate-300 bg-[#F8FAFC]">
                <canvas
                  ref={canvasRef}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerLeave={handlePointerUp}
                  className="block h-44 w-full touch-none cursor-crosshair bg-white"
                />
                {/* Signature guide line */}
                <div className="pointer-events-none absolute right-6 bottom-8 left-6 border-b border-slate-200" />
                {!hasDrawn && (
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs font-medium text-slate-400">
                    Draw your signature here
                  </span>
                )}
              </div>

              {drawError && (
                <p className="mt-2 text-xs font-semibold text-rose-600">
                  {drawError}
                </p>
              )}

              <p className="mt-2.5 text-[11px] text-slate-500">
                Signing as{" "}
                <strong className="text-[#0F172A]">{approver.name}</strong> (
                <span className="font-mono">{approver.email}</span>)
              </p>
            </div>
          ) : (
            <div>
              <p className="text-xs font-semibold text-[#0F172A]">
                Verified Institutional Digital Stamp Preview
              </p>

              {/* Official Digital Stamp Preview Card */}
              <div className="mt-3 rounded-2xl border-2 border-[#1E3A8A]/40 bg-gradient-to-br from-[#F8FAFC] via-white to-[#1E3A8A]/[0.04] p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-[#0F172A] bg-[#0F172A] text-xs font-bold tracking-wider text-white">
                      PU
                    </div>
                    <div>
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                        ✓ Verified Electronic TTD
                      </span>
                      <p className="mt-1 text-sm font-bold text-[#0F172A]">
                        {approver.name}
                      </p>
                      <p className="text-xs font-medium text-slate-600">
                        {approver.roleTitle}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-2 border-t border-[#E2E8F0] pt-3 sm:grid-cols-2">
                  <div>
                    <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Institutional Email
                    </span>
                    <span className="font-mono text-xs font-semibold text-[#1E3A8A]">
                      {approver.email}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Timestamp
                    </span>
                    <span className="font-mono text-xs font-semibold text-[#0F172A]">
                      {stampTimestamp}
                    </span>
                  </div>
                </div>
              </div>

              <p className="mt-2.5 text-[11px] text-slate-500">
                A unique verification hash (TTD-PU-XXXX) will be generated and
                locked to this proposal&apos;s official approval sheet.
              </p>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-2.5 border-t border-[#E2E8F0] bg-[#F8FAFC] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[#E2E8F0] bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirmSign}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#0F172A] px-6 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-[#1E3A8A] cursor-pointer"
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
                d="M5 13l4 4L19 7"
              />
            </svg>
            <span>Confirm &amp; Apply TTD</span>
          </button>
        </div>
      </div>
    </div>
  );
}
