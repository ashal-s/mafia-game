"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  leaveGame,
  removePlayer,
  setReady,
  startGame,
} from "@/app/games/actions";

type ProfileRef =
  | { username: string | null; display_name: string | null }
  | { username: string | null; display_name: string | null }[]
  | null;

export type LobbyPlayer = {
  id: string;
  user_id: string;
  is_host: boolean;
  is_ready: boolean;
  seat: number | null;
  joined_at: string;
  profile: ProfileRef;
};

type LobbyGame = {
  id: string;
  code: string;
  name: string | null;
  status: "lobby" | "in_progress" | "completed" | "cancelled";
  min_players: number;
  max_players: number;
  host_id: string;
};

const PLAYER_SELECT =
  "id, user_id, is_host, is_ready, seat, joined_at, profile:profiles!game_players_user_id_fkey(username, display_name)";

function profileOf(ref: ProfileRef) {
  const p = Array.isArray(ref) ? ref[0] : ref;
  return p ?? null;
}

function displayNameOf(player: LobbyPlayer) {
  const p = profileOf(player.profile);
  return p?.display_name || p?.username || "Player";
}

export function Lobby({
  game: initialGame,
  initialPlayers,
  currentUserId,
  startError,
}: {
  game: LobbyGame;
  initialPlayers: LobbyPlayer[];
  currentUserId: string;
  startError: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [game, setGame] = useState<LobbyGame>(initialGame);
  const [players, setPlayers] = useState<LobbyPlayer[]>(initialPlayers);
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const refresh = useCallback(async () => {
    const [{ data: g }, { data: p }] = await Promise.all([
      supabase
        .from("games")
        .select("id, code, name, status, min_players, max_players, host_id")
        .eq("id", initialGame.id)
        .maybeSingle(),
      supabase
        .from("game_players")
        .select(PLAYER_SELECT)
        .eq("game_id", initialGame.id)
        .order("joined_at", { ascending: true }),
    ]);
    if (g) setGame(g as LobbyGame);
    if (p) setPlayers(p as LobbyPlayer[]);
  }, [supabase, initialGame.id]);

  useEffect(() => {
    const channel = supabase
      .channel(`lobby:${initialGame.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_players",
          filter: `game_id=eq.${initialGame.id}`,
        },
        () => {
          void refresh();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "games",
          filter: `id=eq.${initialGame.id}`,
        },
        () => {
          void refresh();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, initialGame.id, refresh]);

  const inviteUrl = origin ? `${origin}/join/${game.code}` : "";
  const me = players.find((p) => p.user_id === currentUserId);
  const isHost = game.host_id === currentUserId;
  const canStart = isHost && players.length >= game.min_players;

  async function copyInvite() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable; the input still shows the link to copy manually.
    }
  }

  if (game.status === "cancelled") {
    return (
      <CenteredCard>
        <h1 className="text-lg font-semibold text-zinc-50">Game cancelled</h1>
        <p className="mt-1 text-sm text-zinc-400">
          The host closed this lobby.
        </p>
        <Link href="/dashboard" className="mt-6 inline-flex h-11 items-center justify-center rounded-lg border border-zinc-700 px-4 text-sm font-medium text-zinc-200 transition-colors hover:border-zinc-600">
          Back to dashboard
        </Link>
      </CenteredCard>
    );
  }

  if (game.status !== "lobby") {
    return (
      <CenteredCard>
        <p className="text-xs font-medium uppercase tracking-widest text-emerald-400">
          Game started
        </p>
        <h1 className="mt-2 text-lg font-semibold text-zinc-50">
          {game.name || "Mafia game"} is underway
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          {players.length} players are in. The in-game experience is coming soon.
        </p>
        <Link href="/dashboard" className="mt-6 inline-flex h-11 items-center justify-center rounded-lg border border-zinc-700 px-4 text-sm font-medium text-zinc-200 transition-colors hover:border-zinc-600">
          Back to dashboard
        </Link>
      </CenteredCard>
    );
  }

  return (
    <div className="flex flex-1 flex-col bg-zinc-950 text-zinc-100">
      <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
        <Link href="/dashboard" className="text-lg font-bold tracking-tight text-red-500">
          Mafia
        </Link>
        <form action={leaveGame}>
          <input type="hidden" name="game_id" value={game.id} />
          <button
            type="submit"
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm font-medium text-zinc-300 transition-colors hover:border-zinc-600 hover:text-zinc-100"
          >
            {isHost ? "Close lobby" : "Leave"}
          </button>
        </form>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-50">
              {game.name || "Mafia game"}
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              Waiting for players — {players.length}/{game.max_players} joined,
              minimum {game.min_players} to start.
            </p>
          </div>
          <span className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs font-medium text-zinc-300">
            Lobby
          </span>
        </div>

        <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
          <h2 className="text-sm font-semibold text-zinc-200">Invite players</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Share the code or link. Anyone signed in can join before the game
            starts.
          </p>
          <div className="mt-3 flex items-center gap-3">
            <span className="font-mono text-2xl tracking-[0.35em] text-red-400">
              {game.code}
            </span>
          </div>
          <div className="mt-3 flex gap-2">
            <input
              readOnly
              value={inviteUrl}
              className="h-10 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-300"
            />
            <button
              type="button"
              onClick={copyInvite}
              className="h-10 shrink-0 rounded-lg bg-zinc-100 px-4 text-sm font-semibold text-zinc-900 transition-colors hover:bg-white"
            >
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
        </section>

        {startError ? (
          <p className="mt-4 rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">
            You need at least {game.min_players} players to start.
          </p>
        ) : null}

        <section className="mt-6">
          <h2 className="text-sm font-semibold text-zinc-200">
            Players ({players.length})
          </h2>
          <ul className="mt-3 space-y-2">
            {players.map((player) => {
              const isMe = player.user_id === currentUserId;
              return (
                <li
                  key={player.id}
                  className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-800 text-sm font-semibold text-zinc-300">
                      {displayNameOf(player).charAt(0).toUpperCase()}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-zinc-100">
                        {displayNameOf(player)}
                        {isMe ? (
                          <span className="ml-1 text-xs text-zinc-500">(you)</span>
                        ) : null}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {player.is_host ? "Host" : "Player"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {player.is_host ? (
                      <span className="rounded-full border border-amber-700/50 bg-amber-950/30 px-2.5 py-1 text-xs font-medium text-amber-300">
                        Host
                      </span>
                    ) : player.is_ready ? (
                      <span className="rounded-full border border-emerald-700/50 bg-emerald-950/30 px-2.5 py-1 text-xs font-medium text-emerald-300">
                        Ready
                      </span>
                    ) : (
                      <span className="rounded-full border border-zinc-700 bg-zinc-800/60 px-2.5 py-1 text-xs font-medium text-zinc-400">
                        Not ready
                      </span>
                    )}

                    {isHost && !player.is_host ? (
                      <form action={removePlayer}>
                        <input type="hidden" name="game_id" value={game.id} />
                        <input type="hidden" name="player_id" value={player.id} />
                        <button
                          type="submit"
                          className="rounded-lg border border-zinc-700 px-2.5 py-1 text-xs font-medium text-zinc-400 transition-colors hover:border-red-700 hover:text-red-300"
                        >
                          Remove
                        </button>
                      </form>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          {me && !me.is_host ? (
            <form action={setReady} className="flex-1">
              <input type="hidden" name="game_id" value={game.id} />
              <input
                type="hidden"
                name="ready"
                value={me.is_ready ? "false" : "true"}
              />
              <button
                type="submit"
                className={`flex h-11 w-full items-center justify-center rounded-lg px-4 text-sm font-semibold transition-colors ${
                  me.is_ready
                    ? "border border-zinc-700 text-zinc-200 hover:border-zinc-600"
                    : "bg-emerald-600 text-white hover:bg-emerald-500"
                }`}
              >
                {me.is_ready ? "Mark as not ready" : "I'm ready"}
              </button>
            </form>
          ) : null}

          {isHost ? (
            <form action={startGame} className="flex-1">
              <input type="hidden" name="game_id" value={game.id} />
              <button
                type="submit"
                disabled={!canStart}
                className="flex h-11 w-full items-center justify-center rounded-lg bg-red-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {canStart
                  ? "Start game"
                  : `Need ${game.min_players - players.length} more player${
                      game.min_players - players.length === 1 ? "" : "s"
                    }`}
              </button>
            </form>
          ) : null}
        </div>
      </main>
    </div>
  );
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-950 px-6 py-12 text-zinc-100">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 text-center">
        {children}
      </div>
    </div>
  );
}
