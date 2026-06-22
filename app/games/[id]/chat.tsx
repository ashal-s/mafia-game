"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { sendChatMessage, type FormState } from "../actions";

export type ChatRoomType = "town" | "mafia" | "dead" | "system";

export type ChatRoomInfo = {
  id: string;
  type: ChatRoomType;
  name: string | null;
  canWrite: boolean;
  writeHint: string | null;
};

export type ChatProps = {
  gameId: string;
  selfPlayerId: string | null;
  initialMuted: boolean;
  rooms: ChatRoomInfo[];
  namesById: Record<string, string>;
};

type ChatMessage = {
  id: string;
  sender_id: string | null;
  body: string;
  is_system: boolean;
  created_at: string;
};

const ROOM_STYLES: Record<
  ChatRoomType,
  { label: string; active: string; tab: string }
> = {
  town: {
    label: "Town",
    active: "border-zinc-400 bg-zinc-800 text-zinc-50",
    tab: "border-zinc-700/60 text-zinc-400 hover:text-zinc-200",
  },
  mafia: {
    label: "Mafia",
    active: "border-red-600 bg-red-950/50 text-red-200",
    tab: "border-zinc-700/60 text-zinc-400 hover:text-zinc-200",
  },
  dead: {
    label: "Graveyard",
    active: "border-violet-600 bg-violet-950/40 text-violet-200",
    tab: "border-zinc-700/60 text-zinc-400 hover:text-zinc-200",
  },
  system: {
    label: "System",
    active: "border-zinc-400 bg-zinc-800 text-zinc-50",
    tab: "border-zinc-700/60 text-zinc-400 hover:text-zinc-200",
  },
};

function roomLabel(room: ChatRoomInfo) {
  return room.name || ROOM_STYLES[room.type].label;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function Chat({
  gameId,
  selfPlayerId,
  initialMuted,
  rooms,
  namesById,
}: ChatProps) {
  const supabase = useMemo(() => createClient(), []);
  const [activeRoomId, setActiveRoomId] = useState<string>(rooms[0]?.id ?? "");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [muted, setMuted] = useState(initialMuted);
  const [text, setText] = useState("");

  const listRef = useRef<HTMLDivElement>(null);
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    sendChatMessage,
    {},
  );

  const activeRoom = rooms.find((r) => r.id === activeRoomId) ?? null;

  // Load + live-stream messages for the active room. Re-runs on room change.
  useEffect(() => {
    if (!activeRoomId) return;
    let cancelled = false;

    void (async () => {
      const { data } = await supabase
        .from("chat_messages")
        .select("id, sender_id, body, is_system, created_at")
        .eq("room_id", activeRoomId)
        .order("created_at", { ascending: true });
      if (!cancelled && data) setMessages(data as ChatMessage[]);
    })();

    const channel = supabase
      .channel(`chat:${activeRoomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `room_id=eq.${activeRoomId}`,
        },
        (payload) => {
          const row = payload.new as ChatMessage;
          setMessages((prev) =>
            prev.some((m) => m.id === row.id) ? prev : [...prev, row],
          );
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [supabase, activeRoomId]);

  // Live mute state so the input disables the moment the host mutes this player.
  useEffect(() => {
    if (!selfPlayerId) return;
    const channel = supabase
      .channel(`me:${selfPlayerId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "game_players",
          filter: `id=eq.${selfPlayerId}`,
        },
        (payload) => {
          const row = payload.new as { is_muted?: boolean };
          setMuted(Boolean(row.is_muted));
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, selfPlayerId]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const send = useCallback(() => {
    const body = text.trim();
    if (!body || !activeRoomId) return;
    const fd = new FormData();
    fd.set("game_id", gameId);
    fd.set("room_id", activeRoomId);
    fd.set("body", body);
    formAction(fd);
    setText("");
  }, [text, activeRoomId, gameId, formAction]);

  if (rooms.length === 0) return null;

  const canWrite = Boolean(activeRoom?.canWrite) && !muted;
  const disabledReason = muted
    ? "You are muted by the host."
    : (activeRoom?.writeHint ?? null);

  return (
    <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/60">
      <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-2">
        {rooms.map((room) => {
          const style = ROOM_STYLES[room.type];
          const isActive = room.id === activeRoomId;
          return (
            <button
              key={room.id}
              type="button"
              onClick={() => setActiveRoomId(room.id)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                isActive ? style.active : `bg-zinc-950/30 ${style.tab}`
              }`}
            >
              {roomLabel(room)}
            </button>
          );
        })}
      </div>

      <div ref={listRef} className="h-72 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500">
            No messages yet. Say something.
          </p>
        ) : (
          messages.map((m) => {
            if (m.is_system || !m.sender_id) {
              return (
                <p
                  key={m.id}
                  className="text-center text-xs italic text-zinc-500"
                >
                  {m.body}
                </p>
              );
            }
            const isSelf = m.sender_id === selfPlayerId;
            const name = namesById[m.sender_id] ?? "Unknown";
            return (
              <div key={m.id} className="flex flex-col">
                <div className="flex items-baseline gap-2">
                  <span
                    className={`text-xs font-semibold ${
                      isSelf ? "text-red-300" : "text-zinc-300"
                    }`}
                  >
                    {name}
                    {isSelf ? " (you)" : ""}
                  </span>
                  <span className="text-[10px] text-zinc-600">
                    {formatTime(m.created_at)}
                  </span>
                </div>
                <p className="text-sm text-zinc-100">{m.body}</p>
              </div>
            );
          })
        )}
      </div>

      <div className="border-t border-zinc-800 p-3">
        {canWrite ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={500}
              placeholder={`Message ${roomLabel(activeRoom!).toLowerCase()}…`}
              className="h-10 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-base text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={pending || text.trim().length === 0}
              className="h-10 shrink-0 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Send
            </button>
          </form>
        ) : (
          <p className="px-1 py-1 text-xs text-zinc-500">
            {disabledReason ?? "You can only read this chat."}
          </p>
        )}
        {state.error ? (
          <p className="mt-2 text-sm text-red-400">{state.error}</p>
        ) : null}
      </div>
    </section>
  );
}
