"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  advancePhase,
  endGameByHost,
  removePlayerByHost,
  reprocessCurrentPhase,
  setPlayerLifeState,
  setGamePause,
} from "@/app/games/actions";

type Alignment = "town" | "mafia" | "neutral";

export type HostPlayer = {
  id: string;
  name: string;
  roleName: string;
  alignment: Alignment;
  alive: boolean;
  status: "alive" | "dead" | "left";
  isHost: boolean;
  muted: boolean;
  ready: boolean;
  actsAtNight: boolean;
};

export type HostDashboardProps = {
  gameId: string;
  isPaused: boolean;
  phaseType: string | null;
  dayNumber: number | null;
  players: HostPlayer[];
};

const ALIGNMENT_BADGE: Record<Alignment, string> = {
  mafia: "border-red-700/60 bg-red-950/40 text-red-300",
  town: "border-emerald-700/50 bg-emerald-950/30 text-emerald-300",
  neutral: "border-amber-700/50 bg-amber-950/30 text-amber-300",
};

const PHASE_LABEL: Record<string, string> = {
  night: "Night",
  discussion: "Discussion",
  voting: "Voting",
  results: "Results",
  day: "Day",
};

const PHASE_ORDER = ["night", "discussion", "voting", "results"] as const;

function nextPhaseLabel(current: string | null): string {
  if (!current) return "next phase";
  const idx = PHASE_ORDER.indexOf(current as (typeof PHASE_ORDER)[number]);
  if (idx === -1) return "next phase";
  return PHASE_LABEL[PHASE_ORDER[(idx + 1) % PHASE_ORDER.length]];
}

export function HostDashboard({
  gameId,
  isPaused,
  phaseType,
  dayNumber,
  players,
}: HostDashboardProps) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const staticById = useMemo(
    () => new Map(players.map((p) => [p.id, p])),
    [players],
  );

  const [rows, setRows] = useState<HostPlayer[]>(players);
  const [phase, setPhase] = useState<string | null>(phaseType);
  const [day, setDay] = useState<number | null>(dayNumber);
  const [paused, setPaused] = useState(isPaused);
  const [acted, setActed] = useState<Set<string>>(new Set());
  const [voted, setVoted] = useState<Set<string>>(new Set());
  const [audit, setAudit] = useState<
    { id: string; action_type: string; target_player_id: string | null; created_at: string }[]
  >([]);

  const load = useCallback(async () => {
    const { data: activePhase } = await supabase
      .from("game_phases")
      .select("id, phase_type, day_number")
      .eq("game_id", gameId)
      .eq("status", "active")
      .order("phase_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: gameRow } = await supabase
      .from("games")
      .select("is_paused")
      .eq("id", gameId)
      .maybeSingle();

    const { data: livePlayers } = await supabase
      .from("game_players")
      .select("id, status, is_muted, is_ready")
      .eq("game_id", gameId);

    const { data: hostActions } = await supabase
      .from("host_actions")
      .select("id, action_type, target_player_id, created_at")
      .eq("game_id", gameId)
      .order("created_at", { ascending: false })
      .limit(12);

    const merged = (livePlayers ?? [])
      .map((lp) => {
        const base = staticById.get(lp.id);
        if (!base) return null;
        return {
          ...base,
          alive: lp.status === "alive",
          status: lp.status,
          muted: lp.is_muted,
          ready: lp.is_ready,
        } satisfies HostPlayer;
      })
      .filter((p): p is HostPlayer => p !== null)
      .sort((a, b) => a.name.localeCompare(b.name));

    let actedSet = new Set<string>();
    let votedSet = new Set<string>();
    if (activePhase?.phase_type === "night") {
      const { data: actions } = await supabase
        .from("role_actions")
        .select("actor_id")
        .eq("phase_id", activePhase.id);
      actedSet = new Set((actions ?? []).map((a) => a.actor_id));
    } else if (activePhase?.phase_type === "voting") {
      const { data: voteRows } = await supabase
        .from("votes")
        .select("voter_id")
        .eq("phase_id", activePhase.id);
      votedSet = new Set((voteRows ?? []).map((v) => v.voter_id));
    }

    if (merged.length > 0) setRows(merged);
    setPhase(activePhase?.phase_type ?? null);
    setDay(activePhase?.day_number ?? null);
    setActed(actedSet);
    setVoted(votedSet);
    setAudit(hostActions ?? []);
    if (gameRow) setPaused(gameRow.is_paused);
  }, [supabase, gameId, staticById]);

  useEffect(() => {
    void (async () => {
      await load();
    })();

    const channel = supabase
      .channel(`host:${gameId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "role_actions", filter: `game_id=eq.${gameId}` },
        () => void load(),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "host_actions", filter: `game_id=eq.${gameId}` },
        () => void load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "votes", filter: `game_id=eq.${gameId}` },
        () => void load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "game_players", filter: `game_id=eq.${gameId}` },
        () => void load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "game_phases", filter: `game_id=eq.${gameId}` },
        () => void load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "games", filter: `id=eq.${gameId}` },
        () => void load(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, gameId, load]);

  const aliveCount = rows.filter((p) => p.alive).length;
  const deadCount = rows.filter((p) => p.status === "dead").length;

  function statusFor(p: HostPlayer): { label: string; tone: string } {
    if (!p.alive) return { label: "—", tone: "text-zinc-600" };
    if (phase === "night") {
      if (!p.actsAtNight) return { label: "No action", tone: "text-zinc-600" };
      return acted.has(p.id)
        ? { label: "Acted", tone: "text-emerald-300" }
        : { label: "Waiting", tone: "text-amber-300" };
    }
    if (phase === "voting") {
      return voted.has(p.id)
        ? { label: "Voted", tone: "text-emerald-300" }
        : { label: "Waiting", tone: "text-amber-300" };
    }
    return p.ready
      ? { label: "Ready", tone: "text-emerald-300" }
      : { label: "—", tone: "text-zinc-600" };
  }

  const overview = [
    { label: "Phase", value: phase ? (PHASE_LABEL[phase] ?? phase) : "—" },
    { label: "Day", value: day != null ? String(day) : "—" },
    { label: "Alive", value: String(aliveCount) },
    { label: "Dead", value: String(deadCount) },
  ];

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-200">
          Host dashboard
          <span className="ml-2 text-xs font-normal text-zinc-500">
            (only you can see this)
          </span>
        </h2>
        {paused ? (
          <span className="rounded-full border border-amber-700/60 bg-amber-950/40 px-2.5 py-0.5 text-xs font-semibold text-amber-300">
            Paused
          </span>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {overview.map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-4 py-3"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              {card.label}
            </p>
            <p className="mt-1 text-lg font-semibold text-zinc-100">
              {card.value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <form action={advancePhase}>
          <input type="hidden" name="game_id" value={gameId} />
          <button
            type="submit"
            className="inline-flex h-10 items-center justify-center rounded-lg bg-red-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-red-500"
          >
            Force {nextPhaseLabel(phase)} →
          </button>
        </form>

        <form action={setGamePause}>
          <input type="hidden" name="game_id" value={gameId} />
          <input type="hidden" name="pause" value={paused ? "false" : "true"} />
          <button
            type="submit"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-700 px-4 text-sm font-medium text-zinc-200 transition-colors hover:border-amber-700 hover:text-amber-300"
          >
            {paused ? "Resume game" : "Pause game"}
          </button>
        </form>

        <form
          action={reprocessCurrentPhase}
          onSubmit={(e) => {
            if (!window.confirm("Re-run the current phase results? This may resend outcome notifications.")) e.preventDefault();
          }}
        >
          <input type="hidden" name="game_id" value={gameId} />
          <button
            type="submit"
            disabled={phase !== "night" && phase !== "voting"}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-700 px-4 text-sm font-medium text-zinc-200 transition-colors hover:border-amber-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Reprocess phase
          </button>
        </form>

        <form
          action={endGameByHost}
          onSubmit={(e) => {
            if (!window.confirm("End the game now for everyone?")) {
              e.preventDefault();
            }
          }}
        >
          <input type="hidden" name="game_id" value={gameId} />
          <button
            type="submit"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-red-900/60 bg-red-950/30 px-4 text-sm font-medium text-red-300 transition-colors hover:border-red-700 hover:text-red-200"
          >
            End game
          </button>
        </form>

        <button
          type="button"
          onClick={() => router.refresh()}
          className="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-800 px-4 text-sm font-medium text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-200"
        >
          Refresh
        </button>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-900/80 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-2 font-medium">Player</th>
              <th className="px-4 py-2 font-medium">Role</th>
              <th className="px-4 py-2 font-medium">Team</th>
              <th className="px-4 py-2 font-medium">State</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Recovery</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {rows.map((p) => {
              const status = statusFor(p);
              return (
                <tr key={p.id} className="bg-zinc-950/40">
                  <td className="px-4 py-2 text-zinc-200">
                    {p.name}
                    {p.isHost ? (
                      <span className="ml-1 text-xs text-zinc-500">(host)</span>
                    ) : null}
                    {p.muted ? (
                      <span className="ml-2 rounded-full border border-amber-700/50 bg-amber-950/30 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                        Muted
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 text-zinc-300">{p.roleName}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs font-medium ${ALIGNMENT_BADGE[p.alignment]}`}
                    >
                      {p.alignment === "mafia"
                        ? "Mafia"
                        : p.alignment === "neutral"
                          ? "Neutral"
                          : "Town"}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={
                        p.alive
                          ? "text-emerald-300"
                          : "text-zinc-500 line-through"
                      }
                    >
                      {p.status === "left" ? "Removed" : p.alive ? "Alive" : "Dead"}
                    </span>
                  </td>
                  <td className={`px-4 py-2 font-medium ${status.tone}`}>
                    {status.label}
                  </td>
                  <td className="px-4 py-2">
                    {p.status !== "left" ? (
                      <div className="flex flex-wrap gap-2">
                        <form action={setPlayerLifeState}>
                          <input type="hidden" name="game_id" value={gameId} />
                          <input type="hidden" name="player_id" value={p.id} />
                          <input type="hidden" name="status" value={p.alive ? "dead" : "alive"} />
                          <button type="submit" className="text-xs font-medium text-amber-300 hover:text-amber-200">
                            Mark {p.alive ? "dead" : "alive"}
                          </button>
                        </form>
                        {!p.isHost ? (
                          <form
                            action={removePlayerByHost}
                            onSubmit={(e) => {
                              if (!window.confirm(`Remove ${p.name} from the active game?`)) e.preventDefault();
                            }}
                          >
                            <input type="hidden" name="game_id" value={gameId} />
                            <input type="hidden" name="player_id" value={p.id} />
                            <button type="submit" className="text-xs font-medium text-red-400 hover:text-red-300">Remove</button>
                          </form>
                        ) : null}
                      </div>
                    ) : <span className="text-xs text-zinc-600">No actions</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Recovery audit log</h3>
        {audit.length ? (
          <ul className="mt-3 space-y-2">
            {audit.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-4 text-xs">
                <span className="text-zinc-300">
                  {entry.action_type.replaceAll("_", " ")}
                  {entry.target_player_id ? ` · ${staticById.get(entry.target_player_id)?.name ?? "Player"}` : ""}
                </span>
                <time className="shrink-0 text-zinc-600">{new Date(entry.created_at).toLocaleString()}</time>
              </li>
            ))}
          </ul>
        ) : <p className="mt-2 text-xs text-zinc-600">No recovery actions yet.</p>}
      </div>
    </section>
  );
}
