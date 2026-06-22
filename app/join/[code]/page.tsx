import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserWithProfile } from "@/lib/profile";
import { joinGameById } from "@/app/games/actions";

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { code: rawCode } = await params;
  const code = rawCode.toUpperCase();
  const { error } = await searchParams;

  const { user, profile } = await getCurrentUserWithProfile();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/join/${code}`)}`);
  }
  if (!profile?.username) {
    redirect("/profile/setup");
  }

  const supabase = await createClient();
  const { data: game } = await supabase
    .from("games")
    .select("id, name, status, max_players, host:profiles!games_host_id_fkey(username, display_name)")
    .eq("code", code)
    .maybeSingle();

  // Already in this game? Go straight to the lobby.
  if (game) {
    const { data: existing } = await supabase
      .from("game_players")
      .select("id")
      .eq("game_id", game.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (existing) {
      redirect(`/games/${game.id}`);
    }
  }

  const host = Array.isArray(game?.host) ? game?.host[0] : game?.host;
  const hostName = host?.display_name || host?.username;

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-transparent px-6 py-12 text-zinc-100">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 text-center">
        <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">
          Game invite
        </p>
        <p className="mt-2 font-mono text-2xl tracking-[0.4em] text-red-400">
          {code}
        </p>

        {!game || game.status !== "lobby" ? (
          <>
            <h1 className="mt-6 text-lg font-semibold text-zinc-50">
              This invite isn&apos;t available
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              The game may have already started, been cancelled, or the code is
              incorrect.
            </p>
            <Link
              href="/dashboard"
              className="mt-6 inline-flex h-11 items-center justify-center rounded-lg border border-zinc-700 px-4 text-sm font-medium text-zinc-200 transition-colors hover:border-zinc-600"
            >
              Back to dashboard
            </Link>
          </>
        ) : (
          <>
            <h1 className="mt-6 text-lg font-semibold text-zinc-50">
              {game.name || "Mafia game"}
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              {hostName ? (
                <>
                  Hosted by{" "}
                  <span className="font-medium text-zinc-200">@{host?.username}</span>.{" "}
                </>
              ) : null}
              Up to {game.max_players} players.
            </p>

            {error ? (
              <p className="mt-4 rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">
                {error}
              </p>
            ) : null}

            <form action={joinGameById} className="mt-6">
              <input type="hidden" name="game_id" value={game.id} />
              <input type="hidden" name="code" value={code} />
              <button
                type="submit"
                className="flex h-11 w-full items-center justify-center rounded-lg bg-red-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-red-500"
              >
                Join game
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
