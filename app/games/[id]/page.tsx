import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserWithProfile } from "@/lib/profile";
import { Lobby } from "./lobby";
import { RoleReveal } from "./role-reveal";

const PLAYER_SELECT =
  "id, user_id, is_host, is_ready, seat, joined_at, profile:profiles!game_players_user_id_fkey(username, display_name)";

const ROLE_SELECT =
  "player_id, user_id, alignment, role:roles(key, name, description, ability), profile:profiles(username, display_name)";

export default async function GamePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;

  const { user, profile } = await getCurrentUserWithProfile();
  if (!user) {
    redirect("/login");
  }
  if (!profile?.username) {
    redirect("/profile/setup");
  }

  const supabase = await createClient();

  const { data: game } = await supabase
    .from("games")
    .select("id, code, name, status, min_players, max_players, host_id")
    .eq("id", id)
    .maybeSingle();

  if (!game) {
    notFound();
  }

  const isHost = game.host_id === user.id;

  if (game.status === "lobby") {
    const { data: players } = await supabase
      .from("game_players")
      .select(PLAYER_SELECT)
      .eq("game_id", id)
      .order("joined_at", { ascending: true });

    const isMember = (players ?? []).some((p) => p.user_id === user.id);
    if (!isMember) {
      redirect(`/join/${game.code}`);
    }

    return (
      <Lobby
        game={game}
        initialPlayers={players ?? []}
        currentUserId={user.id}
        startError={error === "min_players"}
      />
    );
  }

  if (game.status === "in_progress") {
    const { data: roleRows } = await supabase
      .from("game_player_roles")
      .select(ROLE_SELECT)
      .eq("game_id", id);

    return (
      <RoleReveal
        gameName={game.name}
        rows={roleRows ?? []}
        isHost={isHost}
        currentUserId={user.id}
      />
    );
  }

  // completed or cancelled
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-950 px-6 py-12 text-zinc-100">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 text-center">
        <h1 className="text-lg font-semibold text-zinc-50">
          {game.status === "cancelled" ? "Game cancelled" : "Game over"}
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          {game.name || "This game"} is no longer active.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex h-11 items-center justify-center rounded-lg border border-zinc-700 px-4 text-sm font-medium text-zinc-200 transition-colors hover:border-zinc-600"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
