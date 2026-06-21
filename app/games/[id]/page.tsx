import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserWithProfile } from "@/lib/profile";
import { Lobby } from "./lobby";

const PLAYER_SELECT =
  "id, user_id, is_host, is_ready, seat, joined_at, profile:profiles!game_players_user_id_fkey(username, display_name)";

export default async function GameLobbyPage({
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

  const { data: players } = await supabase
    .from("game_players")
    .select(PLAYER_SELECT)
    .eq("game_id", id)
    .order("joined_at", { ascending: true });

  const isMember = (players ?? []).some((p) => p.user_id === user.id);

  // Visible (lobby) but not joined yet → send to the invite landing.
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
