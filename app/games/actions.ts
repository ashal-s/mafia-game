"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string };

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no ambiguous chars (0/O, 1/I/L)
const CODE_LENGTH = 6;

function generateInviteCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return code;
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Ensures there is an authenticated user with a completed profile (username).
 * Redirects to login / profile setup otherwise. Never call inside try/catch —
 * `redirect()` works by throwing.
 */
async function requirePlayer() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.username) {
    redirect("/profile/setup");
  }

  return { supabase, user };
}

export async function createGame(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const { supabase, user } = await requirePlayer();

  const rawName = formData.get("name");
  const name =
    typeof rawName === "string" && rawName.trim().length > 0
      ? rawName.trim().slice(0, 80)
      : null;

  const presetId =
    typeof formData.get("preset_id") === "string" &&
    (formData.get("preset_id") as string).length > 0
      ? (formData.get("preset_id") as string)
      : null;

  let minPlayers = 5;
  let maxPlayers = 15;

  if (presetId) {
    const { data: preset } = await supabase
      .from("role_presets")
      .select("min_players, max_players")
      .eq("id", presetId)
      .maybeSingle();

    if (!preset) {
      return { error: "That role preset no longer exists." };
    }
    minPlayers = preset.min_players;
    maxPlayers = preset.max_players;
  }

  let gameId: string | null = null;
  for (let attempt = 0; attempt < 5 && !gameId; attempt++) {
    const { data, error } = await supabase
      .from("games")
      .insert({
        host_id: user.id,
        code: generateInviteCode(),
        name,
        preset_id: presetId,
        min_players: minPlayers,
        max_players: maxPlayers,
      })
      .select("id")
      .single();

    if (data) {
      gameId = data.id;
      break;
    }
    // 23505 = unique violation on the invite code; retry with a fresh code.
    if (error && error.code !== "23505") {
      return { error: error.message };
    }
  }

  if (!gameId) {
    return { error: "Could not create a game right now. Please try again." };
  }

  const { error: joinError } = await supabase.from("game_players").insert({
    game_id: gameId,
    user_id: user.id,
    is_host: true,
    is_ready: true,
  });

  if (joinError) {
    return { error: joinError.message };
  }

  redirect(`/games/${gameId}`);
}

export async function joinByCode(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const { supabase, user } = await requirePlayer();

  const rawCode = formData.get("code");
  const code =
    typeof rawCode === "string" ? rawCode.trim().toUpperCase() : "";

  if (!code) {
    return { error: "Enter an invite code." };
  }

  const { data: game } = await supabase
    .from("games")
    .select("id, status")
    .eq("code", code)
    .maybeSingle();

  if (!game) {
    return { error: "No game found with that code." };
  }
  if (game.status !== "lobby") {
    return { error: "That game has already started." };
  }

  const { error } = await supabase
    .from("game_players")
    .insert({ game_id: game.id, user_id: user.id });

  // 23505 = already a member; fall through to the lobby.
  if (error && error.code !== "23505") {
    return { error: error.message };
  }

  redirect(`/games/${game.id}`);
}

/** Used by the invite-link landing page's "Join game" button. */
export async function joinGameById(formData: FormData): Promise<void> {
  const { supabase, user } = await requirePlayer();
  const gameId = formData.get("game_id");
  const code = formData.get("code");
  if (typeof gameId !== "string" || !gameId) {
    redirect("/dashboard");
  }

  const { error } = await supabase
    .from("game_players")
    .insert({ game_id: gameId, user_id: user.id });

  if (error && error.code !== "23505" && typeof code === "string") {
    redirect(`/join/${code}?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`/games/${gameId}`);
}

export async function setReady(formData: FormData): Promise<void> {
  const { supabase, user } = await requirePlayer();
  const gameId = formData.get("game_id");
  if (typeof gameId !== "string") return;

  const ready = formData.get("ready") === "true";

  await supabase
    .from("game_players")
    .update({ is_ready: ready })
    .eq("game_id", gameId)
    .eq("user_id", user.id);

  revalidatePath(`/games/${gameId}`);
}

export async function removePlayer(formData: FormData): Promise<void> {
  const { supabase } = await requirePlayer();
  const gameId = formData.get("game_id");
  const playerId = formData.get("player_id");
  if (typeof gameId !== "string" || typeof playerId !== "string") return;

  // RLS restricts deletes to the host; never remove the host's own row.
  await supabase
    .from("game_players")
    .delete()
    .eq("id", playerId)
    .eq("game_id", gameId)
    .eq("is_host", false);

  revalidatePath(`/games/${gameId}`);
}

export async function startGame(formData: FormData): Promise<void> {
  const { supabase, user } = await requirePlayer();
  const gameId = formData.get("game_id");
  if (typeof gameId !== "string") return;

  const { data: game } = await supabase
    .from("games")
    .select("id, host_id, status, min_players, preset_id")
    .eq("id", gameId)
    .maybeSingle();

  if (!game || game.host_id !== user.id) {
    redirect(`/games/${gameId}`);
  }
  if (game.status !== "lobby") {
    redirect(`/games/${gameId}`);
  }

  const { data: players } = await supabase
    .from("game_players")
    .select("id, user_id, joined_at")
    .eq("game_id", gameId)
    .order("joined_at", { ascending: true });

  if (!players || players.length < game.min_players) {
    redirect(`/games/${gameId}?error=min_players`);
  }

  const { data: roles } = await supabase
    .from("roles")
    .select("id, key, alignment");

  const villager = roles?.find((r) => r.key === "villager");
  if (!roles || !villager) {
    redirect(`/games/${gameId}?error=roles_unavailable`);
  }

  const roleByKey = new Map(roles.map((r) => [r.key, r]));
  const alignmentByRoleId = new Map(roles.map((r) => [r.id, r.alignment]));

  // Build a list of role ids — one per player — from the preset composition,
  // padding any extra players with villagers (and trimming if necessary).
  const roleIds: string[] = [];
  if (game.preset_id) {
    const { data: items } = await supabase
      .from("role_preset_items")
      .select("role_id, count")
      .eq("preset_id", game.preset_id);
    for (const item of items ?? []) {
      for (let i = 0; i < item.count; i++) roleIds.push(item.role_id);
    }
  }

  if (roleIds.length === 0) {
    // Fallback composition derived from the player count.
    const mafiaCount = Math.max(1, Math.floor(players.length / 4));
    const mafia = roleByKey.get("mafia");
    const detective = roleByKey.get("detective");
    const healer = roleByKey.get("healer");
    const mayor = roleByKey.get("mayor");
    for (let i = 0; i < mafiaCount && mafia; i++) roleIds.push(mafia.id);
    if (detective) roleIds.push(detective.id);
    if (healer) roleIds.push(healer.id);
    if (mayor && players.length >= 7) roleIds.push(mayor.id);
  }

  while (roleIds.length < players.length) roleIds.push(villager.id);
  roleIds.length = players.length;

  const shuffledRoles = shuffle(roleIds);
  const shuffledPlayers = shuffle(players);

  const assignments = shuffledPlayers.map((player, index) => ({
    game_id: gameId,
    player_id: player.id,
    user_id: player.user_id,
    role_id: shuffledRoles[index],
    alignment: alignmentByRoleId.get(shuffledRoles[index]) ?? "town",
  }));

  // Reset any partial assignment from a prior failed attempt, then assign.
  await supabase.from("game_player_roles").delete().eq("game_id", gameId);
  const { error: roleError } = await supabase
    .from("game_player_roles")
    .insert(assignments);
  if (roleError) {
    redirect(`/games/${gameId}?error=${encodeURIComponent(roleError.message)}`);
  }

  // Seat players in the shuffled (randomized) order.
  await Promise.all(
    shuffledPlayers.map((player, index) =>
      supabase
        .from("game_players")
        .update({ seat: index + 1, status: "alive" })
        .eq("id", player.id),
    ),
  );

  // Create the town and mafia chat rooms once.
  const { count: roomCount } = await supabase
    .from("chat_rooms")
    .select("id", { count: "exact", head: true })
    .eq("game_id", gameId);
  if (!roomCount) {
    await supabase.from("chat_rooms").insert([
      { game_id: gameId, type: "town", name: "Town Square" },
      { game_id: gameId, type: "mafia", name: "Mafia" },
    ]);
  }

  // Open the first night phase once.
  const { count: phaseCount } = await supabase
    .from("game_phases")
    .select("id", { count: "exact", head: true })
    .eq("game_id", gameId);
  if (!phaseCount) {
    await supabase.from("game_phases").insert({
      game_id: gameId,
      phase_number: 1,
      phase_type: "night",
      day_number: 1,
      status: "active",
      started_at: new Date().toISOString(),
    });
  }

  await supabase
    .from("games")
    .update({ status: "in_progress", started_at: new Date().toISOString() })
    .eq("id", gameId);

  redirect(`/games/${gameId}`);
}

export async function leaveGame(formData: FormData): Promise<void> {
  const { supabase, user } = await requirePlayer();
  const gameId = formData.get("game_id");
  if (typeof gameId !== "string") return;

  const { data: game } = await supabase
    .from("games")
    .select("host_id, status")
    .eq("id", gameId)
    .maybeSingle();

  if (game && game.host_id === user.id && game.status === "lobby") {
    // Host leaving the lobby cancels the game for everyone.
    await supabase
      .from("games")
      .update({ status: "cancelled" })
      .eq("id", gameId);
  } else {
    await supabase
      .from("game_players")
      .delete()
      .eq("game_id", gameId)
      .eq("user_id", user.id);
  }

  redirect("/dashboard");
}
