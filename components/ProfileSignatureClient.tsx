"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { UserRole } from "@/src/lib/supabase/database.types";

interface ProfileSignatureClientProps {
  initialProfile: {
    id: string;
    email: string;
    full_name: string;
    role: UserRole;
    organization_unit: string | null;
    signature_storage_path: string | null;
    signature_url: string | null;
    created_at: string;
  };
}

type SignatureMode = "draw" | "upload";

const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024; // 2 MB

function getRoleDisplayLabel(role: UserRole): string {
  switch (role) {
    case "admin":
      return "Administrator";
    case "staff":
      return "Approver / Campus Staff";
    case "student":
    default:
      return "Student Submitter";
  }
}

export default function ProfileSignatureClient({
  initialProfile,
}: ProfileSignatureClientProps) {
  const router = useRouter();

  // Profile form state
  const [fullName, setFullName] = useState(initialProfile.full_name);
  const [organizationUnit, setOrganizationUnit] = useState(
    initialProfile.organization_unit ?? ""
  );
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Signature state
  const [mode, setMode] = useState<SignatureMode>("draw");
  const [activePreviewUrl, setActivePreviewUrl] = useState<string | null>(
    initialProfile.signature_url
  );
  const [activeStoragePath, setActiveStoragePath] = useState<string | null>(
    initialProfile.signature_storage_path
  );

  // Draw pad state
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  // Upload file state
  const [selectedPngFile, setSelectedPngFile] = useState<File | null>(null);
  const [localUploadPreviewUrl, setLocalUploadPreviewUrl] = useState<
    string | null
  >(null);

  const [isUploadingSignature, setIsUploadingSignature] = useState(false);
  const [signatureFeedback, setSignatureFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Initialize high-DPI transparent HTML5 canvas
  useEffect(() => {
    if (mode !== "draw") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0F172A";
    ctx.lineWidth = 2.6;
  }, [mode]);

  // Revoke temporary blob preview URL on cleanup
  useEffect(() => {
    return () => {
      if (localUploadPreviewUrl) {
        URL.revokeObjectURL(localUploadPreviewUrl);
      }
    };
  }, [localUploadPreviewUrl]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileFeedback(null);

    const trimmedName = fullName.trim();
    if (trimmedName.length < 2) {
      setProfileFeedback({
        type: "error",
        message: "Full name must be at least 2 characters.",
      });
      return;
    }

    setIsSavingProfile(true);
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: trimmedName,
          organization_unit: organizationUnit.trim() || null,
        }),
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        error?: { message?: string };
      };

      if (!response.ok || !payload.ok) {
        setProfileFeedback({
          type: "error",
          message: payload.error?.message ?? "Unable to save profile changes.",
        });
        return;
      }

      setProfileFeedback({
        type: "success",
        message: "Your institutional profile has been updated.",
      });
      router.refresh();
    } catch {
      setProfileFeedback({
        type: "error",
        message: "Network error while saving profile.",
      });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const getPointerCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
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
    const { x, y } = getPointerCoords(e);
    isDrawingRef.current = true;
    ctx.beginPath();
    ctx.moveTo(x, y);
    setHasDrawn(true);
    setSignatureFeedback(null);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { x, y } = getPointerCoords(e);
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
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    setHasDrawn(false);
    setSignatureFeedback(null);
  };

  const uploadSignatureFile = async (file: File) => {
    setSignatureFeedback(null);
    setIsUploadingSignature(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/profile/signature", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        storagePath?: string;
        signedUrl?: string;
        error?: { message?: string };
      };

      if (!response.ok || !payload.ok || !payload.signedUrl) {
        setSignatureFeedback({
          type: "error",
          message:
            payload.error?.message ?? "Failed to upload PNG signature.",
        });
        return;
      }

      setActivePreviewUrl(payload.signedUrl);
      setActiveStoragePath(payload.storagePath ?? null);
      setSelectedPngFile(null);
      if (localUploadPreviewUrl) {
        URL.revokeObjectURL(localUploadPreviewUrl);
        setLocalUploadPreviewUrl(null);
      }

      setSignatureFeedback({
        type: "success",
        message:
          "Transparent PNG signature saved to private storage and verified.",
      });
      router.refresh();
    } catch {
      setSignatureFeedback({
        type: "error",
        message: "Network error while uploading digital signature.",
      });
    } finally {
      setIsUploadingSignature(false);
    }
  };

  const handleSaveDrawnSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasDrawn) {
      setSignatureFeedback({
        type: "error",
        message: "Please draw your signature on the pad before saving.",
      });
      return;
    }

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setSignatureFeedback({
            type: "error",
            message: "Unable to export PNG from canvas.",
          });
          return;
        }
        const pngFile = new File([blob], `drawn-signature-${Date.now()}.png`, {
          type: "image/png",
        });
        void uploadSignatureFile(pngFile);
      },
      "image/png",
      1.0
    );
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSignatureFeedback(null);
    const file = e.target.files?.[0] ?? null;
    if (!file) return;

    if (file.type !== "image/png" || !file.name.toLowerCase().endsWith(".png")) {
      setSignatureFeedback({
        type: "error",
        message: "Only transparent PNG signature files (.png) are accepted.",
      });
      e.target.value = "";
      return;
    }

    if (file.size > MAX_SIGNATURE_BYTES) {
      setSignatureFeedback({
        type: "error",
        message: "Signature PNG file size cannot exceed 2 MB.",
      });
      e.target.value = "";
      return;
    }

    if (localUploadPreviewUrl) {
      URL.revokeObjectURL(localUploadPreviewUrl);
    }
    setSelectedPngFile(file);
    setLocalUploadPreviewUrl(URL.createObjectURL(file));
  };

  const handleUploadSelectedPng = () => {
    if (!selectedPngFile) {
      setSignatureFeedback({
        type: "error",
        message: "Please select a PNG signature file first.",
      });
      return;
    }
    void uploadSignatureFile(selectedPngFile);
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* LEFT COLUMN: Institutional Identity & Profile Form */}
      <section className="lg:col-span-5 rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-2xs">
        <div className="border-b border-[#E2E8F0] pb-4">
          <span className="text-xs font-bold uppercase tracking-wider text-[#1E3A8A]">
            Campus Identity
          </span>
          <h2 className="mt-1 text-lg font-bold text-[#0F172A]">
            Account Details
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Update your display name and organization or academic unit.
          </p>
        </div>

        <form onSubmit={handleSaveProfile} className="mt-5 space-y-4">
          {/* Locked Institutional Email */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Institutional Email
              </label>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                SSO Locked
              </span>
            </div>
            <input
              type="email"
              disabled
              value={initialProfile.email}
              className="mt-1.5 w-full rounded-xl border border-[#E2E8F0] bg-slate-100 px-3.5 py-2.5 font-mono text-xs text-slate-600"
            />
          </div>

          {/* Locked Institutional Role */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                System Role
              </label>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                Admin Managed
              </span>
            </div>
            <input
              type="text"
              disabled
              value={getRoleDisplayLabel(initialProfile.role)}
              className="mt-1.5 w-full rounded-xl border border-[#E2E8F0] bg-slate-100 px-3.5 py-2.5 text-xs font-semibold text-slate-700"
            />
          </div>

          {/* Editable Full Name */}
          <div>
            <label
              htmlFor="profile-full-name"
              className="block text-xs font-bold uppercase tracking-wider text-[#0F172A]"
            >
              Full Name
            </label>
            <input
              id="profile-full-name"
              type="text"
              required
              minLength={2}
              maxLength={120}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g., Dr. Rila Mandala, M.Eng."
              className="mt-1.5 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2.5 text-sm font-medium text-[#0F172A] focus:border-[#1E3A8A] focus:bg-white focus:outline-none"
            />
          </div>

          {/* Editable Organization / Academic Unit */}
          <div>
            <label
              htmlFor="profile-org-unit"
              className="block text-xs font-bold uppercase tracking-wider text-[#0F172A]"
            >
              Organization / Academic Unit
            </label>
            <input
              id="profile-org-unit"
              type="text"
              maxLength={150}
              value={organizationUnit}
              onChange={(e) => setOrganizationUnit(e.target.value)}
              placeholder="e.g., BEM President University / Directorate of Student Affairs"
              className="mt-1.5 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2.5 text-sm font-medium text-[#0F172A] focus:border-[#1E3A8A] focus:bg-white focus:outline-none"
            />
          </div>

          {profileFeedback && (
            <div
              role="status"
              className={`rounded-xl border px-3.5 py-2.5 text-xs font-semibold ${
                profileFeedback.type === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-rose-200 bg-rose-50 text-rose-700"
              }`}
            >
              {profileFeedback.message}
            </div>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSavingProfile}
              className="w-full rounded-full bg-[#0F172A] px-5 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-[#1E3A8A] disabled:opacity-60 cursor-pointer"
            >
              {isSavingProfile ? "Saving Profile..." : "Save Profile Changes"}
            </button>
          </div>
        </form>
      </section>

      {/* RIGHT COLUMN: Digital Signature (TTD) Management & Preview */}
      <section className="lg:col-span-7 rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-2xs">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#E2E8F0] pb-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[#1E3A8A]">
              Campus Digital Signature
            </span>
            <h2 className="mt-1 text-lg font-bold text-[#0F172A]">
              Official Digital Signature (TTD)
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Saved securely to your campus profile for official proposal
              sign-offs.
            </p>
          </div>

          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
              activePreviewUrl
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-amber-200 bg-amber-50 text-amber-800"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                activePreviewUrl ? "bg-emerald-600" : "bg-amber-500"
              }`}
            />
            {activePreviewUrl ? "Signature Active" : "No Signature Yet"}
          </span>
        </div>

        {/* Active Transparent Signature Preview Card */}
        <div className="mt-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Active Signature Preview (Transparency Check)
            </span>
            {activeStoragePath && (
              <span className="text-[11px] font-medium text-slate-500">
                Saved on profile
              </span>
            )}
          </div>

          <div
            style={{
              backgroundImage:
                "linear-gradient(45deg, #f1f5f9 25%, transparent 25%), linear-gradient(-45deg, #f1f5f9 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #f1f5f9 75%), linear-gradient(-45deg, transparent 75%, #f1f5f9 75%)",
              backgroundSize: "16px 16px",
              backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
            }}
            className="mt-2 flex h-36 items-center justify-center rounded-2xl border border-[#E2E8F0] bg-white p-4"
          >
            {activePreviewUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={activePreviewUrl}
                alt={`Active digital signature for ${initialProfile.full_name}`}
                className="max-h-28 max-w-full object-contain"
              />
            ) : (
              <p className="text-xs font-medium text-slate-400">
                Draw on the signature pad or upload a transparent PNG below to
                activate your campus TTD.
              </p>
            )}
          </div>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="mt-6">
          <div className="grid grid-cols-2 gap-1.5 rounded-full border border-[#E2E8F0] bg-[#F8FAFC] p-1">
            <button
              type="button"
              onClick={() => {
                setMode("draw");
                setSignatureFeedback(null);
              }}
              className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition cursor-pointer ${
                mode === "draw"
                  ? "bg-[#0F172A] text-white shadow-2xs"
                  : "text-slate-600 hover:text-[#0F172A]"
              }`}
            >
              <svg
                className="h-3.5 w-3.5"
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
              <span>Draw Signature</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("upload");
                setSignatureFeedback(null);
              }}
              className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition cursor-pointer ${
                mode === "upload"
                  ? "bg-[#0F172A] text-white shadow-2xs"
                  : "text-slate-600 hover:text-[#0F172A]"
              }`}
            >
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                />
              </svg>
              <span>Upload PNG</span>
            </button>
          </div>

          {mode === "draw" ? (
            <div className="mt-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-[#0F172A]">
                  Sign inside the box using mouse, stylus, or touchpad
                </p>
                <button
                  type="button"
                  onClick={handleClearCanvas}
                  className="text-xs font-semibold text-[#1E3A8A] hover:underline cursor-pointer"
                >
                  Clear Pad
                </button>
              </div>

              <div className="relative mt-2 overflow-hidden rounded-2xl border-2 border-dashed border-slate-300 bg-white">
                <canvas
                  ref={canvasRef}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerLeave={handlePointerUp}
                  className="block h-44 w-full touch-none cursor-crosshair bg-transparent"
                />
                <div className="pointer-events-none absolute right-8 bottom-8 left-8 border-b border-slate-200" />
                {!hasDrawn && (
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs font-medium text-slate-400">
                    Draw your official TTD signature here
                  </span>
                )}
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  disabled={isUploadingSignature}
                  onClick={handleSaveDrawnSignature}
                  className="inline-flex items-center gap-2 rounded-full bg-[#0F172A] px-6 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-[#1E3A8A] disabled:opacity-60 cursor-pointer"
                >
                  <span>
                    {isUploadingSignature
                      ? "Uploading PNG Signature..."
                      : "Save Drawn Signature as Active TTD"}
                  </span>
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <label
                htmlFor="signature-png-upload"
                className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#1E3A8A]/35 bg-[#F8FAFC] p-6 text-center transition hover:border-[#1E3A8A] hover:bg-white"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0F172A] text-xs font-bold text-white">
                  PNG
                </span>
                <span className="mt-2.5 text-xs font-bold text-[#0F172A]">
                  {selectedPngFile
                    ? selectedPngFile.name
                    : "Click to choose a transparent PNG signature"}
                </span>
                <span className="mt-1 text-[11px] text-slate-500">
                  Transparent PNG format (.png) • Maximum 2 MB
                </span>
                <input
                  id="signature-png-upload"
                  type="file"
                  accept="image/png,.png"
                  onChange={handleFileChange}
                  className="sr-only"
                />
              </label>

              {localUploadPreviewUrl && (
                <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3 text-center">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Staged File Preview
                  </p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={localUploadPreviewUrl}
                    alt="Selected PNG signature preview"
                    className="mx-auto max-h-24 object-contain"
                  />
                </div>
              )}

              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={!selectedPngFile || isUploadingSignature}
                  onClick={handleUploadSelectedPng}
                  className="inline-flex items-center gap-2 rounded-full bg-[#0F172A] px-6 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-[#1E3A8A] disabled:opacity-50 cursor-pointer"
                >
                  <span>
                    {isUploadingSignature
                      ? "Verifying & Uploading..."
                      : "Upload & Save PNG Signature"}
                  </span>
                </button>
              </div>
            </div>
          )}

          {signatureFeedback && (
            <div
              role="status"
              className={`mt-4 rounded-xl border px-3.5 py-2.5 text-xs font-semibold ${
                signatureFeedback.type === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-rose-200 bg-rose-50 text-rose-700"
              }`}
            >
              {signatureFeedback.message}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
