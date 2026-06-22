"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  read: boolean;
  created_at: string;
};

const TYPE_DOT: Record<string, string> = {
  phase: "bg-sky-400",
  action_required: "bg-amber-400",
  player_killed: "bg-red-400",
  eliminated: "bg-red-400",
  investigation: "bg-violet-400",
  game_ended: "bg-emerald-400",
  chat: "bg-zinc-300",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function NotificationsBell({
  userId,
  gameId,
}: {
  userId: string;
  gameId: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const unread = items.filter((n) => !n.read).length;

  const loadNotifications = useCallback(async () => {
    const { data } = await supabase
      .from("notifications")
      .select("id, type, title, body, read, created_at")
      .eq("game_id", gameId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (data) setItems(data as NotificationRow[]);
  }, [supabase, gameId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("notifications")
        .select("id, type, title, body, read, created_at")
        .eq("game_id", gameId)
        .order("created_at", { ascending: false })
        .limit(30);
      if (!cancelled && data) setItems(data as NotificationRow[]);
    })();

    const channel = supabase
      .channel(`notifs:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as NotificationRow & { game_id: string | null };
            if (row.game_id !== gameId) return;
            setItems((prev) =>
              prev.some((n) => n.id === row.id) ? prev : [row, ...prev],
            );
          } else if (payload.eventType === "UPDATE") {
            const row = payload.new as NotificationRow;
            setItems((prev) =>
              prev.map((n) => (n.id === row.id ? { ...n, ...row } : n)),
            );
          } else if (payload.eventType === "DELETE") {
            const row = payload.old as { id: string };
            setItems((prev) => prev.filter((n) => n.id !== row.id));
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [supabase, userId, gameId]);

  // Re-pull notifications when the app returns to the foreground, since the
  // realtime socket is dropped while a PWA is backgrounded / the phone is locked.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void loadNotifications();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [loadNotifications]);

  // Close the panel when clicking outside it.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const markRead = useCallback(
    async (id: string) => {
      setItems((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
      );
      await supabase.from("notifications").update({ read: true }).eq("id", id);
    },
    [supabase],
  );

  const markAllRead = useCallback(async () => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("game_id", gameId)
      .eq("user_id", userId)
      .eq("read", false);
  }, [supabase, gameId, userId]);

  return (
    <div ref={rootRef} className="relative z-[100]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 text-zinc-300 transition-colors hover:border-zinc-600 hover:text-zinc-100"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-[100] mt-2 w-80 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-xl">
          <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5">
            <span className="text-sm font-semibold text-zinc-100">
              Notifications
            </span>
            {unread > 0 ? (
              <button
                type="button"
                onClick={markAllRead}
                className="text-xs font-medium text-zinc-400 transition-colors hover:text-zinc-200"
              >
                Mark all read
              </button>
            ) : null}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-zinc-500">
                No notifications yet.
              </p>
            ) : (
              <ul className="divide-y divide-zinc-900">
                {items.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => {
                        if (!n.read) void markRead(n.id);
                      }}
                      className={`flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-900/60 ${
                        n.read ? "opacity-60" : ""
                      }`}
                    >
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                          TYPE_DOT[n.type] ?? "bg-zinc-400"
                        }`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium text-zinc-100">
                            {n.title}
                          </span>
                          <span className="shrink-0 text-[10px] text-zinc-600">
                            {timeAgo(n.created_at)}
                          </span>
                        </span>
                        {n.body ? (
                          <span className="mt-0.5 block text-xs text-zinc-400">
                            {n.body}
                          </span>
                        ) : null}
                      </span>
                      {!n.read ? (
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-red-500" />
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
