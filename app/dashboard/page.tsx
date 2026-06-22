import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserWithProfile } from "@/lib/profile";
import { signOut } from "@/app/(auth)/actions";

export default async function DashboardPage() {
  const { user, profile } = await getCurrentUserWithProfile();

  if (!user) {
    redirect("/login");
  }

  // Enforce username before reaching the app.
  if (!profile?.username) {
    redirect("/profile/setup");
  }

  const greetingName = profile.display_name || profile.username;

  return (
    <div className="flex flex-1 flex-col bg-transparent text-zinc-100">
      <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
        <span className="text-lg font-bold tracking-tight text-red-500">
          Mafia
        </span>
        <form action={signOut}>
          <button
            type="submit"
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm font-medium text-zinc-300 transition-colors hover:border-zinc-600 hover:text-zinc-100"
          >
            Sign out
          </button>
        </form>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <h1 className="text-2xl font-semibold text-zinc-50">
          Welcome, {greetingName}
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          You&apos;re signed in as{" "}
          <span className="font-medium text-zinc-200">@{profile.username}</span>.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
            <h2 className="text-base font-semibold text-zinc-100">
              Create a game
            </h2>
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
            <h2 className="text-base font-semibold text-zinc-100">
              Join a game
            </h2>
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
      </main>
    </div>
  );
}
