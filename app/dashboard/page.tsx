import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { MafiaLogo } from "@/components/mafia-logo";
import { getCurrentUserWithProfile } from "@/lib/profile";
import {
  formatGamePhase,
  getActiveGamesForUser,
} from "@/lib/active-games";
import { signOut } from "@/app/(auth)/actions";

export default async function DashboardPage() {
  const { user, profile } = await getCurrentUserWithProfile();

  if (!user) {
    redirect("/login");
  }

  if (!profile?.username) {
    redirect("/profile/setup");
  }

  const [activeGames, greetingName] = await Promise.all([
    getActiveGamesForUser(user.id),
    Promise.resolve(profile.display_name || profile.username),
  ]);

  return (
    <div className="flex flex-1 flex-col bg-transparent text-zinc-100">
      <AppHeader>
        <form action={signOut}>
          <button
            type="submit"
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm font-medium text-zinc-300 transition-colors hover:border-zinc-600 hover:text-zinc-100"
          >
            Sign out
          </button>
        </form>
      </AppHeader>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-8">
        <div className="flex flex-col items-center text-center sm:items-start sm:text-left">
          <MafiaLogo size="lg" className="sm:hidden" />
          <h1 className="mt-4 text-2xl font-semibold text-zinc-50 sm:mt-0">
            Welcome, {greetingName}
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            You&apos;re signed in as{" "}
            <span className="font-medium text-zinc-200">@{profile.username}</span>
            .
          </p>
        </div>

        <section className="mt-10">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-400">
            Your games
          </h2>
          {activeGames.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">
              No active games right now. Start a new one below.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {activeGames.map((game) => (
                <li key={game.id}>
                  <Link
                    href={`/games/${game.id}`}
                    className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 px-5 py-4 transition-colors hover:border-zinc-700 hover:bg-zinc-900/80"
                  >
                    <div className="min-w-0 text-left">
                      <p className="truncate font-semibold text-zinc-100">
                        {game.name || "Mafia game"}
                      </p>
                      <p className="mt-0.5 text-sm text-zinc-400">
                        {formatGamePhase(
                          game.status,
                          game.phaseType,
                          game.dayNumber,
                        )}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-xs tracking-widest text-red-400">
                      {game.code}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-10">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-400">
            Start a new game
          </h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
              <h3 className="text-base font-semibold text-zinc-100">
                Create a game
              </h3>
              <p className="mt-1 text-sm text-zinc-400">
                Host a new table and invite your friends.
              </p>
              <Link
                href="/games/new"
                className="mt-4 inline-flex rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500"
              >
                Create game
              </Link>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
              <h3 className="text-base font-semibold text-zinc-100">
                Join a game
              </h3>
              <p className="mt-1 text-sm text-zinc-400">
                Enter a room code to join an existing table.
              </p>
              <Link
                href="/games/join"
                className="mt-4 inline-flex rounded-lg border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-200 transition-colors hover:border-zinc-600"
              >
                Join game
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
