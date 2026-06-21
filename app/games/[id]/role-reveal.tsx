import Link from "next/link";
import { PhaseBar, type PhaseRow } from "./phase-bar";

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

const DEFAULT_SNIPER_BULLETS = 2;
const DEFAULT_HEALER_SELF_HEALS = 1;

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
}: {
  gameId: string;
  gameName: string | null;
  rows: RoleRow[];
  isHost: boolean;
  currentUserId: string;
  roleConfig?: RoleConfig | null;
  phase?: PhaseRow | null;
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
    <div className="flex flex-1 flex-col bg-zinc-950 text-zinc-100">
      <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
        <Link href="/dashboard" className="text-lg font-bold tracking-tight text-red-500">
          Mafia
        </Link>
        <span className="text-xs font-medium uppercase tracking-widest text-zinc-500">
          {gameName || "Mafia game"}
        </span>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
        <PhaseBar gameId={gameId} isHost={isHost} initialPhase={phase ?? null} />

        {self && selfRole && selfStyle ? (
          <section
            className={`mt-8 rounded-2xl border p-6 ${selfStyle.card}`}
          >
            <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">
              Your role
            </p>
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

        {isHost ? (
          <section className="mt-8">
            <h2 className="text-sm font-semibold text-zinc-200">
              Host overview
              <span className="ml-2 text-xs font-normal text-zinc-500">
                (only you can see this)
              </span>
            </h2>
            <div className="mt-3 overflow-hidden rounded-xl border border-zinc-800">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-900/80 text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-4 py-2 font-medium">Player</th>
                    <th className="px-4 py-2 font-medium">Role</th>
                    <th className="px-4 py-2 font-medium">Team</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {rows.map((row) => {
                    const style = ALIGNMENT_STYLES[row.alignment];
                    return (
                      <tr key={row.player_id} className="bg-zinc-950/40">
                        <td className="px-4 py-2 text-zinc-200">
                          {nameOf(row.profile)}
                          {row.user_id === currentUserId ? (
                            <span className="ml-1 text-xs text-zinc-500">
                              (you)
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-2 text-zinc-300">
                          {one(row.role)?.name ?? "—"}
                        </td>
                        <td className="px-4 py-2">
                          <span
                            className={`rounded-full border px-2 py-0.5 text-xs font-medium ${style.badge}`}
                          >
                            {style.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
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
