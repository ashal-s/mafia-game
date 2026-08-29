"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { advancePhase } from "@/app/games/actions";
import { SubmitButton } from "@/components/submit-button";

export type PhaseRow = {
  id: string;
  phase_type: string;
  day_number: number;
  phase_number: number;
  status: string;
  started_at: string | null;
  ends_at: string | null;
};

const PHASE_ORDER = ["night", "discussion", "voting", "results"] as const;

const PHASE_META: Record<
  string,
  { label: string; blurb: string; text: string; card: string; dot: string }
> = {
  night: {
    label: "Night",
    blurb: "The mafia quietly choose their target.",
    text: "text-indigo-300",
    card: "border-indigo-800/50 bg-indigo-950/20",
    dot: "bg-indigo-400",
  },
  discussion: {
    label: "Discussion",
    blurb: "Debate who the mafia might be.",
    text: "text-sky-300",
    card: "border-sky-800/50 bg-sky-950/20",
    dot: "bg-sky-400",
  },
  voting: {
    label: "Voting",
    blurb: "Vote to put a suspect on trial.",
    text: "text-amber-300",
    card: "border-amber-800/50 bg-amber-950/20",
    dot: "bg-amber-400",
  },
  results: {
    label: "Results",
    blurb: "Reveal what happened this round.",
    text: "text-emerald-300",
    card: "border-emerald-800/50 bg-emerald-950/20",
    dot: "bg-emerald-400",
  },
  day: {
    label: "Day",
    blurb: "",
    text: "text-zinc-300",
    card: "border-zinc-800 bg-zinc-900/40",
    dot: "bg-zinc-400",
  },
};

function nextPhaseLabel(current: string): string {
  const idx = PHASE_ORDER.indexOf(current as (typeof PHASE_ORDER)[number]);
  const next = PHASE_ORDER[(idx + 1) % PHASE_ORDER.length];
  return PHASE_META[next]?.label ?? next;
}

function formatClock(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return hours > 0
    ? `${hours}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

type PlayerPhaseState = "action" | "submitted" | "waiting" | "dead";

const PLAYER_STATE_META: Record<
  PlayerPhaseState,
  { eyebrow: string; title: string; detail: string; style: string; icon: string }
> = {
  action: {
    eyebrow: "Action required",
    title: "You need to act",
    detail: "Complete your action below before this phase ends.",
    style: "border-amber-500/40 bg-amber-500/10 text-amber-100",
    icon: "!",
  },
  submitted: {
    eyebrow: "Submitted",
    title: "Your choice is locked in",
    detail: "You can update it below until this phase ends.",
    style: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
    icon: "✓",
  },
  waiting: {
    eyebrow: "No action needed",
    title: "You’re all caught up",
    detail: "Stay tuned while the current phase continues.",
    style: "border-sky-500/25 bg-sky-500/10 text-sky-100",
    icon: "…",
  },
  dead: {
    eyebrow: "Eliminated",
    title: "You’re watching from the graveyard",
    detail: "You can follow the game, but you can’t vote or use abilities.",
    style: "border-red-500/35 bg-red-500/10 text-red-100",
    icon: "×",
  },
};

export function PhaseBar({
  gameId,
  isHost,
  initialPhase,
  paused = false,
  playerState = "waiting",
}: {
  gameId: string;
  isHost: boolean;
  initialPhase: PhaseRow | null;
  paused?: boolean;
  playerState?: PlayerPhaseState;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [phase, setPhase] = useState<PhaseRow | null>(initialPhase);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from("game_phases")
      .select(
        "id, phase_type, day_number, phase_number, status, started_at, ends_at",
      )
      .eq("game_id", gameId)
      .eq("status", "active")
      .order("phase_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) setPhase(data as PhaseRow);
    router.refresh();
  }, [supabase, gameId, router]);

  useEffect(() => {
    const channel = supabase
      .channel(`phase:${gameId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_phases",
          filter: `game_id=eq.${gameId}`,
        },
        () => {
          void refresh();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, gameId, refresh]);

  // Resync when the app returns to the foreground. iOS suspends JS (and drops
  // the realtime socket) while a Home Screen PWA is backgrounded or the phone
  // is locked, so on resume we re-fetch the active phase instead of waiting for
  // a manual refresh.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [refresh]);

  if (!phase) {
    return null;
  }

  const meta = PHASE_META[phase.phase_type] ?? PHASE_META.day;
  const secondsLeft = phase.ends_at
    ? Math.max(0, Math.ceil((new Date(phase.ends_at).getTime() - now) / 1000))
    : null;
  const playerMeta = PLAYER_STATE_META[playerState];

  const timerText = paused
    ? "Paused"
    : secondsLeft === null
      ? "--:--"
      : secondsLeft === 0
        ? "Time's up"
        : formatClock(secondsLeft);

  return (
    <section
      className={`overflow-hidden rounded-2xl border ${meta.card}`}
      aria-label="Current game phase"
    >
      <div className="p-5 sm:p-6">
        <div className="grid gap-5 sm:grid-cols-[1fr_auto] sm:items-start">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">
              Day {phase.day_number}
            </p>
            <div className="mt-1 flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
              <h2 className={`text-xl font-semibold ${meta.text}`}>
                {meta.label}
              </h2>
            </div>
            {meta.blurb ? (
              <p className="mt-1 text-sm text-zinc-400">{meta.blurb}</p>
            ) : null}
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-left sm:min-w-40 sm:text-right">
            <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">
              Time left
            </p>
            <p
              className="mt-1 font-mono text-3xl font-semibold tabular-nums text-zinc-50 sm:text-4xl"
              role="timer"
              aria-live="off"
              suppressHydrationWarning
            >
              {timerText}
            </p>
          </div>
        </div>

        <div
          className={`mt-5 flex gap-3 rounded-xl border p-4 ${playerMeta.style}`}
        >
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-current/30 text-sm font-bold"
            aria-hidden="true"
          >
            {playerMeta.icon}
          </span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest opacity-70">
              {playerMeta.eyebrow}
            </p>
            <p className="mt-0.5 text-sm font-semibold">{playerMeta.title}</p>
            <p className="mt-1 text-xs leading-5 opacity-75">
              {playerMeta.detail}
            </p>
          </div>
        </div>

        {isHost ? (
          <form action={advancePhase} className="mt-4">
            <input type="hidden" name="game_id" value={gameId} />
            <SubmitButton pendingText="Advancing…">
              Move to {nextPhaseLabel(phase.phase_type)} →
            </SubmitButton>
          </form>
        ) : (
          <p className="mt-4 text-xs text-zinc-400">
            <span className="text-zinc-500">Up next</span>{" "}
            <span className="font-semibold text-zinc-200">
              {nextPhaseLabel(phase.phase_type)}
            </span>
          </p>
        )}
      </div>
    </section>
  );
}
