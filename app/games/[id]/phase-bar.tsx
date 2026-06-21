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
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function PhaseBar({
  gameId,
  isHost,
  initialPhase,
}: {
  gameId: string;
  isHost: boolean;
  initialPhase: PhaseRow | null;
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

  if (!phase) {
    return null;
  }

  const meta = PHASE_META[phase.phase_type] ?? PHASE_META.day;
  const secondsLeft = phase.ends_at
    ? Math.max(0, Math.floor((new Date(phase.ends_at).getTime() - now) / 1000))
    : null;

  const timerText =
    secondsLeft === null
      ? "--:--"
      : secondsLeft === 0
        ? "Time's up"
        : formatClock(secondsLeft);

  return (
    <section className={`rounded-2xl border p-5 ${meta.card}`}>
      <div className="flex items-start justify-between gap-4">
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

        <div className="text-right">
          <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">
            Time left
          </p>
          <p
            className="mt-1 font-mono text-3xl font-semibold tabular-nums text-zinc-50"
            suppressHydrationWarning
          >
            {timerText}
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
        <p className="mt-4 text-xs text-zinc-500">
          Waiting for the host to advance to{" "}
          {nextPhaseLabel(phase.phase_type)}.
        </p>
      )}
    </section>
  );
}
