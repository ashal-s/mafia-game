import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { PhaseBar, type PhaseRow } from "./phase-bar";
import { NightActions, type NightActionProps } from "./night-actions";
import { VoteActions, type VoteActionProps } from "./vote-actions";
import { Chat, type ChatProps } from "./chat";
import { NotificationsBell } from "./notifications-bell";
import { NotificationOptIn } from "./notification-opt-in";
import { HostDashboard, type HostPlayer } from "./host-dashboard";
import { toggleMute } from "@/app/games/actions";
import {
  DEFAULT_HEALER_SELF_HEALS,
  DEFAULT_SNIPER_BULLETS,
} from "@/lib/night";

import { ActivityLog, type ActivityEntry } from "./activity-log";

export type RosterEntry = {
  id: string;
  name: string;
  alive: boolean;
  seat: number | null;
  isSelf: boolean;
  isHost: boolean;
  muted: boolean;
};

export type RoundResults = {
  eliminatedName: string | null;
  tie: boolean;
  dayNumber: number;
} | null;

type RoleInfo = {
  key: string;
  name: string;
  description: string | null;
  ability: string;
};

type ProfileInfo = {
  username: string | null;
  display_name: string | null;
};

type Alignment = "town" | "mafia" | "neutral";

export type RoleRow = {
  player_id: string;
  user_id: string;
  alignment: Alignment;
  role: RoleInfo | RoleInfo[] | null;
  profile: ProfileInfo | ProfileInfo[] | null;
};

export type RoleConfig = {
  sniper?: { bullets: number | null };
  healer?: { selfHeals: number | null };
};

function formatLimit(value: number | null | undefined, fallback: number) {
  if (value === null) return "Unlimited";
  return String(value ?? fallback);
}

function one<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function nameOf(profile: ProfileInfo | ProfileInfo[] | null) {
  const p = one(profile);
  return p?.display_name || p?.username || "Player";
}

const ALIGNMENT_STYLES: Record<
  Alignment,
  { label: string; card: string; badge: string }
> = {
  mafia: {
    label: "Mafia",
    card: "border-red-800/60 bg-red-950/30",
    badge: "border-red-700/60 bg-red-950/40 text-red-300",
  },
  town: {
    label: "Town",
    card: "border-emerald-800/50 bg-emerald-950/20",
    badge: "border-emerald-700/50 bg-emerald-950/30 text-emerald-300",
  },
  neutral: {
    label: "Neutral",
    card: "border-amber-800/50 bg-amber-950/20",
    badge: "border-amber-700/50 bg-amber-950/30 text-amber-300",
  },
};

export function RoleReveal({
  gameId,
  gameName,
  rows,
  isHost,
  currentUserId,
  roleConfig,
  phase,
  isPaused,
  hostPlayers,
  night,
  voting,
  results,
  roster,
  activityLog,
  selfAlive = true,
  chat,
}: {
  gameId: string;
  gameName: string | null;
  rows: RoleRow[];
  isHost: boolean;
  currentUserId: string;
  roleConfig?: RoleConfig | null;
  phase?: PhaseRow | null;
  isPaused?: boolean;
  hostPlayers?: HostPlayer[];
  night?: NightActionProps | null;
  voting?: VoteActionProps | null;
  results?: RoundResults;
  roster?: RosterEntry[];
  activityLog?: ActivityEntry[];
  selfAlive?: boolean;
  chat?: ChatProps | null;
}) {
  const self = rows.find((r) => r.user_id === currentUserId);
  const selfRole = self ? one(self.role) : null;
  const selfStyle = self ? ALIGNMENT_STYLES[self.alignment] : null;

  let selfLimit: { label: string; value: string } | null = null;
  if (selfRole?.key === "sniper") {
    selfLimit = {
      label: "Bullets",
      value: formatLimit(roleConfig?.sniper?.bullets, DEFAULT_SNIPER_BULLETS),
    };
  } else if (selfRole?.key === "healer") {
    selfLimit = {
      label: "Self-heals",
      value: formatLimit(
        roleConfig?.healer?.selfHeals,
        DEFAULT_HEALER_SELF_HEALS,
      ),
    };
  }

  const mafiaTeammates = rows.filter(
    (r) => r.user_id !== currentUserId && r.alignment === "mafia",
  );

  return (
    <div className="flex flex-1 flex-col bg-transparent text-zinc-100">
      <AppHeader>
        <span className="hidden text-xs font-medium uppercase tracking-widest text-zinc-500 sm:inline">
          {gameName || "Mafia game"}
        </span>
        <NotificationOptIn />
        <NotificationsBell userId={currentUserId} gameId={gameId} />
      </AppHeader>

      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
        <PhaseBar
          gameId={gameId}
          isHost={isHost}
          initialPhase={phase ?? null}
          paused={Boolean(isPaused)}
        />

        {isPaused ? (
          <div className="mt-4 rounded-xl border border-amber-800/60 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">
            The host has paused the game. Actions and voting are disabled until it
            resumes.
          </div>
        ) : null}

        {!selfAlive ? (
          <div className="mt-4 rounded-xl border border-red-700/70 bg-red-950/50 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-red-300">
              You are dead
            </p>
            <p className="mt-2 text-sm text-red-100">
              You were eliminated and can no longer vote or use night actions. You
              can still read town chat and speak in the graveyard.
            </p>
          </div>
        ) : null}

        {self && selfRole && selfStyle ? (
          <section
            className={`mt-8 rounded-2xl border p-6 ${
              selfAlive ? selfStyle.card : "border-zinc-800 bg-zinc-900/50 opacity-70"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">
                Your role
              </p>
              {!selfAlive ? (
                <span className="rounded-full border border-red-700/60 bg-red-950/50 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-red-300">
                  Eliminated
                </span>
              ) : null}
            </div>
            <div className="mt-2 flex items-center gap-3">
              <h2 className="text-2xl font-bold text-zinc-50">
                {selfRole.name}
              </h2>
              <span
                className={`rounded-full border px-2.5 py-1 text-xs font-medium ${selfStyle.badge}`}
              >
                {selfStyle.label}
              </span>
            </div>
            {selfRole.description ? (
              <p className="mt-3 text-sm text-zinc-300">
                {selfRole.description}
              </p>
            ) : null}
            {selfLimit ? (
              <div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-zinc-700/60 bg-zinc-950/40 px-3 py-1.5">
                <span className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                  {selfLimit.label}
                </span>
                <span className="font-mono text-sm font-semibold text-zinc-100">
                  {selfLimit.value}
                </span>
              </div>
            ) : null}
          </section>
        ) : (
          <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
            <p className="text-sm text-zinc-400">
              You are observing this game.
            </p>
          </section>
        )}

        {night ? <NightActions {...night} /> : null}

        {voting ? <VoteActions {...voting} /> : null}

        {results ? (
          <section
            className={`mt-6 rounded-2xl border p-6 ${
              results.eliminatedName
                ? "border-red-800/60 bg-red-950/30"
                : "border-emerald-800/50 bg-emerald-950/20"
            }`}
          >
            <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">
              Day {results.dayNumber} results
            </p>
            {results.eliminatedName ? (
              <p className="mt-2 text-sm text-zinc-200">
                The town voted out{" "}
                <span className="font-semibold text-zinc-50">
                  {results.eliminatedName}
                </span>
                .
              </p>
            ) : results.tie ? (
              <p className="mt-2 text-sm text-zinc-200">
                The vote was tied — no one was eliminated.
              </p>
            ) : (
              <p className="mt-2 text-sm text-zinc-200">
                No one received enough votes — no one was eliminated.
              </p>
            )}
          </section>
        ) : null}

        {activityLog && activityLog.length > 0 ? (
          <ActivityLog entries={activityLog} />
        ) : null}

        {chat ? <Chat {...chat} /> : null}

        {roster && roster.length > 0 ? (
          <section className="mt-6">
            <h2 className="text-sm font-semibold text-zinc-200">
              Players
              <span className="ml-2 text-xs font-normal text-zinc-500">
                {roster.filter((p) => p.alive).length} alive
              </span>
            </h2>
            <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {roster.map((p) => (
                <li
                  key={p.id}
                  className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
                    p.alive
                      ? "border-zinc-700/60 bg-zinc-950/30"
                      : "border-zinc-800 bg-zinc-900/40"
                  }`}
                >
                  <span
                    className={`text-sm font-medium ${
                      p.alive
                        ? "text-zinc-100"
                        : "text-zinc-500 line-through"
                    }`}
                  >
                    {p.name}
                    {p.isSelf ? (
                      <span className="ml-1 text-xs text-zinc-500 no-underline">
                        (you)
                      </span>
                    ) : null}
                  </span>
                  <div className="flex items-center gap-2">
                    {p.muted ? (
                      <span className="rounded-full border border-amber-700/50 bg-amber-950/30 px-2 py-0.5 text-xs font-medium text-amber-300">
                        Muted
                      </span>
                    ) : null}
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                        p.alive
                          ? "border-emerald-700/50 bg-emerald-950/30 text-emerald-300"
                          : "border-zinc-700 bg-zinc-900 text-zinc-500"
                      }`}
                    >
                      {p.alive ? "Alive" : "Dead"}
                    </span>
                    {isHost && !p.isHost ? (
                      <form action={toggleMute}>
                        <input type="hidden" name="game_id" value={gameId} />
                        <input type="hidden" name="player_id" value={p.id} />
                        <input
                          type="hidden"
                          name="mute"
                          value={p.muted ? "false" : "true"}
                        />
                        <button
                          type="submit"
                          className="rounded-lg border border-zinc-700 px-2.5 py-1 text-xs font-medium text-zinc-400 transition-colors hover:border-amber-700 hover:text-amber-300"
                        >
                          {p.muted ? "Unmute" : "Mute"}
                        </button>
                      </form>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {self?.alignment === "mafia" ? (
          <section className="mt-6">
            <h2 className="text-sm font-semibold text-zinc-200">
              Your mafia teammates
            </h2>
            {mafiaTeammates.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-400">
                You are the only member of the mafia.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {mafiaTeammates.map((row) => (
                  <li
                    key={row.player_id}
                    className="flex items-center justify-between rounded-xl border border-red-900/50 bg-red-950/20 px-4 py-3"
                  >
                    <span className="text-sm font-medium text-zinc-100">
                      {nameOf(row.profile)}
                    </span>
                    <span className="text-xs font-medium text-red-300">
                      {one(row.role)?.name ?? "Mafia"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        {isHost && hostPlayers ? (
          <HostDashboard
            gameId={gameId}
            isPaused={Boolean(isPaused)}
            phaseType={phase?.phase_type ?? null}
            dayNumber={phase?.day_number ?? null}
            players={hostPlayers}
          />
        ) : null}

        <div className="mt-8">
          <Link
            href="/dashboard"
            className="inline-flex h-11 items-center justify-center rounded-lg border border-zinc-700 px-4 text-sm font-medium text-zinc-200 transition-colors hover:border-zinc-600"
          >
            Back to dashboard
          </Link>
        </div>
      </main>
    </div>
  );
}
