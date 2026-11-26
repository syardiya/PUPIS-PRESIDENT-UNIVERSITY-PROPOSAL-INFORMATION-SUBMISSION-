"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export interface WorkspaceNotificationItem {
  id: string;
  proposal_id: string | null;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

interface NotificationBellPopoverProps {
  initialUnreadCount: number;
  initialNotifications: WorkspaceNotificationItem[];
}

function formatShortTimestamp(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function NotificationBellPopover({
  initialUnreadCount,
  initialNotifications,
}: NotificationBellPopoverProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [open, setOpen] = useState(false);
  const [items, setItems] =
    useState<WorkspaceNotificationItem[]>(initialNotifications);
  const [unreadCount, setUnreadCount] = useState<number>(initialUnreadCount);
  const [isMarkingAll, setIsMarkingAll] = useState(false);

  // Close popover on outside click or Escape key
  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const handleToggleOpen = async () => {
    const nextOpen = !open;
    setOpen(nextOpen);

    if (nextOpen) {
      try {
        const res = await fetch("/api/notifications", { method: "GET" });
        const json = (await res.json()) as {
          ok?: boolean;
          unreadCount?: number;
          items?: WorkspaceNotificationItem[];
        };
        if (res.ok && json.ok && json.items) {
          setItems(json.items);
          setUnreadCount(json.unreadCount ?? 0);
        }
      } catch {
        // Keep server-provided notifications if offline
      }
    }
  };

  const markSingleRead = async (notificationId: string) => {
    const target = items.find((n) => n.id === notificationId);
    if (!target || target.is_read) return;

    setItems((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));

    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notification_id: notificationId }),
      });
      router.refresh();
    } catch {
      // Ignore transient network error; next refresh reconciles
    }
  };

  const handleMarkAllRead = async () => {
    if (unreadCount === 0 || isMarkingAll) return;
    setIsMarkingAll(true);

    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);

    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mark_all: true }),
      });
      router.refresh();
    } finally {
      setIsMarkingAll(false);
    }
  };

  const handleSelectNotification = async (item: WorkspaceNotificationItem) => {
    if (!item.is_read) {
      await markSingleRead(item.id);
    }
    setOpen(false);
    if (item.proposal_id) {
      router.push(`/proposals/${item.proposal_id}`);
    }
  };

  return (
    <div ref={containerRef} className="relative no-print">
      <button
        type="button"
        onClick={() => void handleToggleOpen()}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Notifications (${unreadCount} unread)`}
        className="relative inline-flex items-center gap-2 rounded-full border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-1.5 text-xs font-semibold text-[#0F172A] transition hover:border-slate-300 hover:bg-white focus-visible:ring-2 focus-visible:ring-[#1E3A8A] focus-visible:outline-none cursor-pointer"
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
            unreadCount > 0
              ? "bg-[#1E3A8A] text-white"
              : "bg-slate-200 text-slate-700"
          }`}
        >
          {unreadCount}
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="In-App Notifications"
          className="absolute right-0 z-50 mt-2 w-88 max-w-[92vw] overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-xl shadow-slate-900/10 sm:w-96"
        >
          <div className="flex items-center justify-between border-b border-[#E2E8F0] px-4 py-3">
            <div>
              <p className="text-xs font-bold text-[#0F172A]">Notifications</p>
              <p className="text-[11px] text-slate-500">
                {unreadCount > 0
                  ? `${unreadCount} unread update(s)`
                  : "All caught up"}
              </p>
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                disabled={isMarkingAll}
                onClick={() => void handleMarkAllRead()}
                className="rounded-full bg-[#1E3A8A]/10 px-2.5 py-1 text-[11px] font-semibold text-[#1E3A8A] transition hover:bg-[#1E3A8A]/20 disabled:opacity-50 cursor-pointer"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
            {items.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No workflow notifications yet.
              </div>
            ) : (
              items.map((note) => (
                <div
                  key={note.id}
                  className={`p-3.5 transition ${
                    note.is_read
                      ? "bg-white hover:bg-slate-50"
                      : "bg-[#1E3A8A]/[0.04] hover:bg-[#1E3A8A]/[0.07]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => void handleSelectNotification(note)}
                      className="min-w-0 flex-1 text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        {!note.is_read && (
                          <span className="h-2 w-2 shrink-0 rounded-full bg-[#1E3A8A]" />
                        )}
                        <p className="truncate text-xs font-bold text-[#0F172A]">
                          {note.title}
                        </p>
                      </div>
                      <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-slate-600">
                        {note.message}
                      </p>
                      <div className="mt-1.5 flex items-center gap-2 text-[10px] text-slate-400">
                        <span className="font-mono">
                          {formatShortTimestamp(note.created_at)}
                        </span>
                        {note.proposal_id && (
                          <span className="font-semibold text-[#1E3A8A]">
                            Open Proposal →
                          </span>
                        )}
                      </div>
                    </button>

                    {!note.is_read && (
                      <button
                        type="button"
                        onClick={() => void markSingleRead(note.id)}
                        title="Mark as read"
                        className="shrink-0 rounded-full border border-[#E2E8F0] bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                      >
                        Read
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
