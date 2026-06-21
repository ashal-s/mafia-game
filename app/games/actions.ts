"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/database.types";
import {
  DEFAULT_HEALER_SELF_HEALS,
  DEFAULT_SNIPER_BULLETS,
  nightActionForRole,
} from "@/lib/night";

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

// Phase cycle: night → discussion → voting → results → (next day) night.
type PhaseType = "night" | "discussion" | "voting" | "results";
const PHASE_ORDER: PhaseType[] = ["night", "discussion", "voting", "results"];
const PHASE_DURATIONS_SECONDS: Record<PhaseType, number> = {
  night: 60,
  discussion: 120,
  voting: 60,
  results: 30,
};

function nextPhaseOf(current: PhaseType): PhaseType {
  const idx = PHASE_ORDER.indexOf(current);
  return PHASE_ORDER[(idx + 1) % PHASE_ORDER.length];
}

type DbClient = Awaited<ReturnType<typeof createClient>>;

type RoleConfigShape = {
  sniper?: { bullets: number | null };
  healer?: { selfHeals: number | null };
};

function readRoleConfig(settings: Json | null): RoleConfigShape | null {
  if (settings && typeof settings === "object" && !Array.isArray(settings)) {
    return (settings as { roleConfig?: RoleConfigShape }).roleConfig ?? null;
  }
  return null;
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function profileName(
  profile:
    | { username: string | null; display_name: string | null }
    | { username: string | null; display_name: string | null }[]
    | null,
): string {
  const p = one(profile);
  return p?.display_name || p?.username || "Player";
}


/**
 * Parses a configurable role limit. The sentinel string "unlimited" maps to
 * `null` (no limit); otherwise we expect a small non-negative integer and fall
 * back to the provided default when the value is missing or invalid.
 */
function parseRoleLimit(
  raw: FormDataEntryValue | null,
  fallback: number,
): number | null {
  if (raw === "unlimited") return null;
  const n = Number(raw);
  if (Number.isInteger(n) && n >= 0 && n <= 99) return n;
  return fallback;
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

  const choice = formData.get("setup");
  if (typeof choice !== "string" || choice.length === 0) {
    return { error: "Choose a game setup." };
  }

  let presetId: string | null = null;
  let minPlayers = 5;
  let maxPlayers = 15;
  const settingsObj: {
    composition?: Record<string, number>;
    roleConfig?: {
      sniper?: { bullets: number | null };
      healer?: { selfHeals: number | null };
    };
  } = {};

  if (choice === "custom") {
    const playerCount = Number(formData.get("players"));
    if (!Number.isInteger(playerCount) || playerCount < 3 || playerCount > 30) {
      return { error: "Choose between 3 and 30 players for a custom game." };
    }

    // Gather a count for each non-villager role; villagers fill the rest.
    const { data: specialRoles } = await supabase
      .from("roles")
      .select("key, alignment")
      .neq("key", "villager");

    const composition: Record<string, number> = {};
    let specialsTotal = 0;
    let mafiaTotal = 0;

    for (const role of specialRoles ?? []) {
      const raw = formData.get(`count_${role.key}`);
      const count = raw == null ? 0 : Number(raw);
      if (!Number.isInteger(count) || count < 0 || count > playerCount) {
        return { error: `Invalid count for the ${role.key} role.` };
      }
      if (count > 0) composition[role.key] = count;
      specialsTotal += count;
      if (role.alignment === "mafia") mafiaTotal += count;
    }

    if (mafiaTotal < 1) {
      return { error: "Add at least one Mafia role." };
    }
    if (specialsTotal > playerCount) {
      return {
        error:
          "You've assigned more special roles than players. Reduce some counts.",
      };
    }

    // Custom games run with an exact roster: special roles + villagers = players.
    minPlayers = playerCount;
    maxPlayers = playerCount;
    settingsObj.composition = composition;
  } else {
    const { data: preset } = await supabase
      .from("role_presets")
      .select("id, min_players, max_players")
      .eq("id", choice)
      .maybeSingle();

    if (!preset) {
      return { error: "That role preset no longer exists." };
    }
    presetId = preset.id;
    minPlayers = preset.min_players;
    maxPlayers = preset.max_players;
  }

  // Optional per-role limits. The form only submits these fields when the
  // relevant role is part of the chosen setup, so their presence implies the
  // role is in play. `null` means unlimited.
  const roleConfig: NonNullable<typeof settingsObj.roleConfig> = {};
  if (formData.has("sniper_bullets")) {
    roleConfig.sniper = {
      bullets: parseRoleLimit(
        formData.get("sniper_bullets"),
        DEFAULT_SNIPER_BULLETS,
      ),
    };
  }
  if (formData.has("healer_self_heals")) {
    roleConfig.healer = {
      selfHeals: parseRoleLimit(
        formData.get("healer_self_heals"),
        DEFAULT_HEALER_SELF_HEALS,
      ),
    };
  }
  if (Object.keys(roleConfig).length > 0) {
    settingsObj.roleConfig = roleConfig;
  }

  const settings = settingsObj as Json;

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
        settings,
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
    .select("id, host_id, status, min_players, preset_id, settings")
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
  } else {
    // Custom composition stored on the game (role key -> count). Villagers are
    // not stored; they fill the remaining seats below.
    const composition =
      game.settings &&
      typeof game.settings === "object" &&
      !Array.isArray(game.settings)
        ? ((game.settings as { composition?: Record<string, number> })
            .composition ?? null)
        : null;
    if (composition) {
      for (const [key, count] of Object.entries(composition)) {
        const role = roleByKey.get(key);
        if (role) {
          for (let i = 0; i < count; i++) roleIds.push(role.id);
        }
      }
    }
  }

  if (roleIds.length === 0) {
    // Fallback composition derived from the player count.
    const mafiaCount = Math.max(1, Math.floor(players.length / 4));
    const mafia = roleByKey.get("mafia");
    const detective = roleByKey.get("detective");
    const healer = roleByKey.get("healer");
    const sniper = roleByKey.get("sniper");
    for (let i = 0; i < mafiaCount && mafia; i++) roleIds.push(mafia.id);
    if (detective) roleIds.push(detective.id);
    if (healer) roleIds.push(healer.id);
    if (sniper && players.length >= 7) roleIds.push(sniper.id);
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

  let firstPhaseId: string | null = null;
  if (!phaseCount) {
    const now = new Date();
    const endsAt = new Date(now.getTime() + PHASE_DURATIONS_SECONDS.night * 1000);
    const { data: phase } = await supabase
      .from("game_phases")
      .insert({
        game_id: gameId,
        phase_number: 1,
        phase_type: "night",
        day_number: 1,
        status: "active",
        started_at: now.toISOString(),
        ends_at: endsAt.toISOString(),
      })
      .select("id")
      .single();
    firstPhaseId = phase?.id ?? null;

    if (firstPhaseId) {
      await supabase.from("game_events").insert({
        game_id: gameId,
        phase_id: firstPhaseId,
        event_type: "phase_started",
        data: { phase_type: "night", day_number: 1, phase_number: 1 },
      });
    }
  } else {
    const { data: active } = await supabase
      .from("game_phases")
      .select("id")
      .eq("game_id", gameId)
      .eq("status", "active")
      .order("phase_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    firstPhaseId = active?.id ?? null;
  }

  await supabase
    .from("games")
    .update({
      status: "in_progress",
      started_at: new Date().toISOString(),
      current_phase_id: firstPhaseId,
    })
    .eq("id", gameId);

  redirect(`/games/${gameId}`);
}

export async function advancePhase(formData: FormData): Promise<void> {
  const { supabase, user } = await requirePlayer();
  const gameId = formData.get("game_id");
  if (typeof gameId !== "string") return;

  const { data: game } = await supabase
    .from("games")
    .select("id, host_id, status")
    .eq("id", gameId)
    .maybeSingle();

  // Only the host can advance, and only while the game is running.
  if (!game || game.host_id !== user.id || game.status !== "in_progress") {
    redirect(`/games/${gameId}`);
  }

  const { data: current } = await supabase
    .from("game_phases")
    .select("id, phase_number, phase_type, day_number")
    .eq("game_id", gameId)
    .eq("status", "active")
    .order("phase_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const now = new Date();
  const currentType = (current?.phase_type ?? "results") as PhaseType;
  const currentDay = current?.day_number ?? 1;

  const nextType = nextPhaseOf(currentType);
  // A full cycle completes when results rolls back to night — bump the day.
  const nextDay = currentType === "results" ? currentDay + 1 : currentDay;
  const nextNumber = (current?.phase_number ?? 0) + 1;
  const endsAt = new Date(
    now.getTime() + PHASE_DURATIONS_SECONDS[nextType] * 1000,
  );

  // Leaving the night: resolve all submitted night actions before the phase
  // transitions, applying kills, protection, and private investigation results.
  if (currentType === "night" && current) {
    await processNight(supabase, gameId, current.id, currentDay);
  }

  if (current) {
    await supabase
      .from("game_phases")
      .update({ status: "completed", ended_at: now.toISOString() })
      .eq("id", current.id);
  }

  const { data: next, error: nextError } = await supabase
    .from("game_phases")
    .insert({
      game_id: gameId,
      phase_number: nextNumber,
      phase_type: nextType,
      day_number: nextDay,
      status: "active",
      started_at: now.toISOString(),
      ends_at: endsAt.toISOString(),
    })
    .select("id")
    .single();

  if (nextError || !next) {
    redirect(
      `/games/${gameId}?error=${encodeURIComponent(nextError?.message ?? "phase")}`,
    );
  }

  await supabase
    .from("games")
    .update({ current_phase_id: next.id })
    .eq("id", gameId);

  await supabase.from("game_events").insert({
    game_id: gameId,
    phase_id: next.id,
    event_type: "phase_changed",
    data: {
      from: current?.phase_type ?? null,
      to: nextType,
      day_number: nextDay,
      phase_number: nextNumber,
    },
  });

  revalidatePath(`/games/${gameId}`);
}

export async function submitNightAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const { supabase, user } = await requirePlayer();

  const gameId = formData.get("game_id");
  const rawTarget = formData.get("target_id");
  if (typeof gameId !== "string" || !gameId) {
    return { error: "Missing game." };
  }

  const { data: game } = await supabase
    .from("games")
    .select("id, status, settings")
    .eq("id", gameId)
    .maybeSingle();
  if (!game || game.status !== "in_progress") {
    return { error: "This game is not in progress." };
  }

  // The active phase must be night.
  const { data: phase } = await supabase
    .from("game_phases")
    .select("id, phase_type, status")
    .eq("game_id", gameId)
    .eq("status", "active")
    .order("phase_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!phase || phase.phase_type !== "night") {
    return { error: "You can only act during the night." };
  }

  // The actor must be a living member of this game.
  const { data: me } = await supabase
    .from("game_players")
    .select("id, status")
    .eq("game_id", gameId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!me) return { error: "You are not in this game." };
  if (me.status !== "alive") return { error: "Dead players cannot act." };

  const { data: roleRow } = await supabase
    .from("game_player_roles")
    .select("alignment, role:roles(key)")
    .eq("game_id", gameId)
    .eq("user_id", user.id)
    .maybeSingle();
  const roleKey = one(roleRow?.role)?.key ?? null;
  const descriptor = nightActionForRole(roleKey, roleRow?.alignment ?? null);
  if (!descriptor) {
    return { error: "Your role has no night action." };
  }

  const targetId =
    typeof rawTarget === "string" && rawTarget && rawTarget !== "skip"
      ? rawTarget
      : null;

  if (!targetId && !descriptor.optional) {
    return { error: "Choose a target." };
  }

  if (targetId) {
    if (targetId === me.id && !descriptor.allowSelf) {
      return { error: "You cannot target yourself." };
    }
    const { data: target } = await supabase
      .from("game_players")
      .select("id, status")
      .eq("id", targetId)
      .eq("game_id", gameId)
      .maybeSingle();
    if (!target || target.status !== "alive") {
      return { error: "That player is not a valid target." };
    }

    // Enforce configurable ability limits (bullets / self-heals). Actions in
    // the current phase don't count yet — they're updates to this submission.
    const roleConfig = readRoleConfig(game.settings);
    if (descriptor.type === "sniper_shoot") {
      const limit = roleConfig?.sniper?.bullets;
      const max = limit === null ? null : (limit ?? DEFAULT_SNIPER_BULLETS);
      if (max !== null) {
        const { count } = await supabase
          .from("role_actions")
          .select("id", { count: "exact", head: true })
          .eq("actor_id", me.id)
          .eq("action_type", "sniper_shoot")
          .not("target_id", "is", null)
          .neq("phase_id", phase.id);
        if ((count ?? 0) >= max) {
          return { error: "You are out of bullets." };
        }
      }
    } else if (descriptor.type === "heal" && targetId === me.id) {
      const limit = roleConfig?.healer?.selfHeals;
      const max =
        limit === null ? null : (limit ?? DEFAULT_HEALER_SELF_HEALS);
      if (max !== null) {
        const { count } = await supabase
          .from("role_actions")
          .select("id", { count: "exact", head: true })
          .eq("actor_id", me.id)
          .eq("action_type", "heal")
          .eq("target_id", me.id)
          .neq("phase_id", phase.id);
        if ((count ?? 0) >= max) {
          return { error: "You have no self-heals left." };
        }
      }
    }
  }

  const { error } = await supabase.from("role_actions").upsert(
    {
      game_id: gameId,
      phase_id: phase.id,
      actor_id: me.id,
      target_id: targetId,
      action_type: descriptor.type,
      resolved: false,
      result: null,
    },
    { onConflict: "phase_id,actor_id" },
  );

  if (error) return { error: error.message };

  revalidatePath(`/games/${gameId}`);
  return {};
}

/**
 * Resolves every night action for a phase: tallies the mafia kill, applies the
 * sniper shot, honours the healer's protection, records the detective's private
 * result, marks the dead, and writes notifications / events. Runs as the host
 * (the only caller is `advancePhase`, which verifies host + running game).
 */
async function processNight(
  supabase: DbClient,
  gameId: string,
  phaseId: string,
  dayNumber: number,
): Promise<void> {
  const { data: roleRows } = await supabase
    .from("game_player_roles")
    .select(
      "player_id, user_id, alignment, role:roles(key), profile:profiles(username, display_name)",
    )
    .eq("game_id", gameId);

  const { data: players } = await supabase
    .from("game_players")
    .select("id, user_id, status")
    .eq("game_id", gameId);

  const aliveIds = new Set(
    (players ?? []).filter((p) => p.status === "alive").map((p) => p.id),
  );
  const alignmentByPlayer = new Map(
    (roleRows ?? []).map((r) => [r.player_id, r.alignment as string]),
  );
  const userByPlayer = new Map(
    (roleRows ?? []).map((r) => [r.player_id, r.user_id]),
  );
  const nameByPlayer = new Map(
    (roleRows ?? []).map((r) => [r.player_id, profileName(r.profile)]),
  );

  const { data: actions } = await supabase
    .from("role_actions")
    .select("id, actor_id, target_id, action_type")
    .eq("phase_id", phaseId);
  const list = actions ?? [];

  // Mafia kill: pick the target with the most votes among living players.
  const mafiaVotes = new Map<string, number>();
  for (const a of list) {
    if (a.action_type === "mafia_kill" && a.target_id && aliveIds.has(a.target_id)) {
      mafiaVotes.set(a.target_id, (mafiaVotes.get(a.target_id) ?? 0) + 1);
    }
  }
  let mafiaTarget: string | null = null;
  let bestVotes = 0;
  for (const [target, votes] of mafiaVotes) {
    if (votes > bestVotes) {
      bestVotes = votes;
      mafiaTarget = target;
    }
  }

  const sniperTarget =
    list.find(
      (a) =>
        a.action_type === "sniper_shoot" &&
        a.target_id &&
        aliveIds.has(a.target_id),
    )?.target_id ?? null;

  const protectedTarget =
    list.find(
      (a) => a.action_type === "heal" && a.target_id && aliveIds.has(a.target_id),
    )?.target_id ?? null;

  // Deaths: mafia target dies unless protected; the sniper's shot always lands.
  const deaths = new Set<string>();
  if (mafiaTarget && mafiaTarget !== protectedTarget) deaths.add(mafiaTarget);
  if (sniperTarget) deaths.add(sniperTarget);

  const now = new Date().toISOString();

  for (const playerId of deaths) {
    await supabase
      .from("game_players")
      .update({ status: "dead", eliminated_at: now })
      .eq("id", playerId)
      .eq("game_id", gameId);

    const uid = userByPlayer.get(playerId);
    if (uid) {
      await supabase.from("notifications").insert({
        user_id: uid,
        game_id: gameId,
        type: "eliminated",
        title: "You were eliminated",
        body: "You did not survive the night.",
      });
    }
    await supabase.from("game_events").insert({
      game_id: gameId,
      phase_id: phaseId,
      actor_id: playerId,
      event_type: "player_eliminated",
      data: { player_id: playerId, cause: "night", day_number: dayNumber },
    });
  }

  // A successful protection (mafia target was healed) is logged for the timeline.
  if (mafiaTarget && mafiaTarget === protectedTarget) {
    await supabase.from("game_events").insert({
      game_id: gameId,
      phase_id: phaseId,
      event_type: "player_saved",
      data: { player_id: protectedTarget, day_number: dayNumber },
    });
  }

  // Detective: save a private suspicious / not-suspicious result + notify them.
  for (const a of list) {
    if (a.action_type === "investigate" && a.target_id) {
      const suspicious = alignmentByPlayer.get(a.target_id) === "mafia";
      await supabase
        .from("role_actions")
        .update({
          result: { suspicious, target_id: a.target_id },
          resolved: true,
        })
        .eq("id", a.id);

      const detectiveUid = userByPlayer.get(a.actor_id);
      if (detectiveUid) {
        const targetName = nameByPlayer.get(a.target_id) ?? "Your target";
        await supabase.from("notifications").insert({
          user_id: detectiveUid,
          game_id: gameId,
          type: "investigation",
          title: "Investigation result",
          body: `${targetName} is ${suspicious ? "suspicious" : "not suspicious"}.`,
        });
      }
    }
  }

  // Mark any remaining (non-detective) actions resolved.
  await supabase
    .from("role_actions")
    .update({ resolved: true })
    .eq("phase_id", phaseId)
    .eq("resolved", false);

  await supabase.from("game_events").insert({
    game_id: gameId,
    phase_id: phaseId,
    event_type: "night_resolved",
    data: { day_number: dayNumber, deaths: Array.from(deaths) },
  });
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
