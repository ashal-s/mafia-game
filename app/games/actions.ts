"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUsers } from "@/lib/push/send";
import type { Json } from "@/lib/database.types";
import {
  DEFAULT_HEALER_SELF_HEALS,
  DEFAULT_SNIPER_BULLETS,
  nightActionForRole,
} from "@/lib/night";
import { evaluateWin, type WinAlignment } from "@/lib/win";

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
 * Inserts the same notification for several users at once. Notifications are
 * always tied to a game here, so the host's "insert game notifications" policy
 * (WEB-44) lets these writes through during host-run transitions.
 */
async function notifyUsers(
  supabase: DbClient,
  gameId: string,
  userIds: string[],
  type: string,
  title: string,
  body: string,
): Promise<void> {
  const unique = Array.from(new Set(userIds));
  if (unique.length === 0) return;
  await supabase.from("notifications").insert(
    unique.map((uid) => ({
      user_id: uid,
      game_id: gameId,
      type,
      title,
      body,
    })),
  );

  // Mirror the in-app notification to a native Web Push so locked phones get a
  // lock-screen alert. Best-effort: never let push failures break game flow.
  await sendPushToUsers(unique, {
    title,
    body,
    url: `/games/${gameId}`,
    tag: `${gameId}:${type}`,
  }).catch(() => {});
}

/**
 * Fans out the "a phase started" notifications when a new phase opens: a phase
 * notice to everyone, plus an action-required nudge to the players who actually
 * need to do something this phase (acting roles at night, living voters during
 * voting).
 */
async function notifyPhaseStart(
  supabase: DbClient,
  gameId: string,
  phaseType: PhaseType,
  dayNumber: number,
): Promise<void> {
  const { data: players } = await supabase
    .from("game_players")
    .select("user_id, status")
    .eq("game_id", gameId);

  const members = players ?? [];
  const allUserIds = members.map((p) => p.user_id);
  const aliveUserIds = members
    .filter((p) => p.status === "alive")
    .map((p) => p.user_id);

  if (phaseType === "night") {
    await notifyUsers(
      supabase,
      gameId,
      allUserIds,
      "phase",
      "Night falls",
      `Night ${dayNumber} has begun.`,
    );

    const { data: roleRows } = await supabase
      .from("game_player_roles")
      .select("user_id, alignment, role:roles(key)")
      .eq("game_id", gameId);

    const aliveSet = new Set(aliveUserIds);
    const actors = (roleRows ?? [])
      .filter((r) => {
        if (!aliveSet.has(r.user_id)) return false;
        const key = one(r.role)?.key ?? null;
        return Boolean(nightActionForRole(key, r.alignment));
      })
      .map((r) => r.user_id);

    await notifyUsers(
      supabase,
      gameId,
      actors,
      "action_required",
      "Your action is needed",
      "Use your night ability before the phase ends.",
    );
  } else if (phaseType === "discussion") {
    await notifyUsers(
      supabase,
      gameId,
      allUserIds,
      "phase",
      "Discussion has begun",
      "Debate who the mafia might be.",
    );
  } else if (phaseType === "voting") {
    await notifyUsers(
      supabase,
      gameId,
      allUserIds,
      "phase",
      "Voting has started",
      "Cast your vote to put a suspect on trial.",
    );
    await notifyUsers(
      supabase,
      gameId,
      aliveUserIds,
      "action_required",
      "Cast your vote",
      "Vote before the voting phase ends.",
    );
  } else if (phaseType === "results") {
    await notifyUsers(
      supabase,
      gameId,
      allUserIds,
      "phase",
      "Results are in",
      `The Day ${dayNumber} results are ready.`,
    );
  }
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
  // A game has one night per round, so it can never run more rounds than there
  // are players — cap bullets / self-heals to that ceiling (unlimited stays null).
  const maxRounds = maxPlayers;
  if (
    roleConfig.sniper &&
    roleConfig.sniper.bullets !== null &&
    roleConfig.sniper.bullets > maxRounds
  ) {
    roleConfig.sniper.bullets = maxRounds;
  }
  if (
    roleConfig.healer &&
    roleConfig.healer.selfHeals !== null &&
    roleConfig.healer.selfHeals > maxRounds
  ) {
    roleConfig.healer.selfHeals = maxRounds;
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

  // Create the town, mafia, and dead chat rooms once.
  const { count: roomCount } = await supabase
    .from("chat_rooms")
    .select("id", { count: "exact", head: true })
    .eq("game_id", gameId);
  if (!roomCount) {
    await supabase.from("chat_rooms").insert([
      { game_id: gameId, type: "town", name: "Town Square" },
      { game_id: gameId, type: "mafia", name: "Mafia" },
      { game_id: gameId, type: "dead", name: "Graveyard" },
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

  // Let everyone know the game has begun and nudge the night-acting roles.
  await notifyPhaseStart(supabase, gameId, "night", 1);

  redirect(`/games/${gameId}`);
}

/**
 * Core phase-transition engine, shared by the host's manual "advance" action and
 * the server-side auto-advance cron. Closes the active phase (resolving night or
 * voting first), ends the game on a win, or opens the next phase and fans out the
 * phase-start notifications.
 *
 * Pure of auth, redirects, and revalidation so it can run with either a
 * request-scoped host client (RLS) or the service-role client (cron). The caller
 * is responsible for authorising and for any redirect/revalidate.
 */
async function transitionPhase(
  supabase: DbClient,
  gameId: string,
): Promise<{ ended: boolean; error?: string }> {
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

  // Resolve the phase being left before it transitions:
  //  * night  → apply kills, protection, and private investigation results.
  //  * voting  → tally the day vote and eliminate the chosen player (if any).
  if (current && currentType === "night") {
    await processNight(supabase, gameId, current.id, currentDay);
  } else if (current && currentType === "voting") {
    await processVoting(supabase, gameId, current.id, currentDay);
  }

  // A win can be reached after night kills or after a day elimination. When it
  // is, end the game here instead of opening the next phase.
  if (current && (currentType === "night" || currentType === "voting")) {
    const winner = await evaluateGameWinner(supabase, gameId);
    if (winner) {
      await endGame(supabase, gameId, current.id, winner);
      return { ended: true };
    }
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
    return { ended: false, error: nextError?.message ?? "phase" };
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

  await notifyPhaseStart(supabase, gameId, nextType, nextDay);

  return { ended: false };
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

  const result = await transitionPhase(supabase, gameId);
  if (result.error) {
    redirect(`/games/${gameId}?error=${encodeURIComponent(result.error)}`);
  }

  revalidatePath(`/games/${gameId}`);
}

/**
 * Server-side auto-advance: finds every in-progress, non-paused game whose
 * active phase has passed its scheduled `ends_at` and advances it. Driven by the
 * Supabase pg_cron route (`/api/cron/advance-phases`) so games keep moving even when
 * every player's phone is locked and their PWA is suspended.
 *
 * Runs with the service-role client (bypasses RLS) since there is no logged-in
 * host during a cron tick. Each game advances at most one phase per call; the
 * newly opened phase's `ends_at` is in the future, so a game is only advanced
 * again on a later tick.
 */
export async function autoAdvanceExpiredPhases(): Promise<{
  scanned: number;
  advanced: number;
  ended: number;
  errors: number;
}> {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data: rows, error } = await admin
    .from("game_phases")
    .select("game_id, ends_at, game:games!inner(status, is_paused)")
    .eq("status", "active")
    .not("ends_at", "is", null)
    .lte("ends_at", nowIso)
    .eq("game.status", "in_progress")
    .eq("game.is_paused", false);

  if (error || !rows) {
    return { scanned: 0, advanced: 0, ended: 0, errors: error ? 1 : 0 };
  }

  // De-dupe defensively in case a game somehow has more than one active phase.
  const gameIds = Array.from(new Set(rows.map((r) => r.game_id)));

  let advanced = 0;
  let ended = 0;
  let errors = 0;
  for (const gameId of gameIds) {
    try {
      const result = await transitionPhase(admin as unknown as DbClient, gameId);
      if (result.error) errors++;
      else if (result.ended) ended++;
      else advanced++;
    } catch {
      errors++;
    }
  }

  return { scanned: gameIds.length, advanced, ended, errors };
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
    .select("id, status, settings, is_paused")
    .eq("id", gameId)
    .maybeSingle();
  if (!game || game.status !== "in_progress") {
    return { error: "This game is not in progress." };
  }
  if (game.is_paused) {
    return { error: "The game is paused by the host." };
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
 * Casts (or updates) the current player's day vote. A living player may vote for
 * any living player, or abstain, and may change that choice until the voting
 * phase closes. One vote per player per phase is enforced by the
 * `(phase_id, voter_id)` unique constraint via upsert.
 */
export async function submitVote(
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
    .select("id, status, is_paused")
    .eq("id", gameId)
    .maybeSingle();
  if (!game || game.status !== "in_progress") {
    return { error: "This game is not in progress." };
  }
  if (game.is_paused) {
    return { error: "The game is paused by the host." };
  }

  // The active phase must be voting.
  const { data: phase } = await supabase
    .from("game_phases")
    .select("id, phase_type, status")
    .eq("game_id", gameId)
    .eq("status", "active")
    .order("phase_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!phase || phase.phase_type !== "voting") {
    return { error: "You can only vote during the voting phase." };
  }

  // The voter must be a living member of this game.
  const { data: me } = await supabase
    .from("game_players")
    .select("id, status")
    .eq("game_id", gameId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!me) return { error: "You are not in this game." };
  if (me.status !== "alive") return { error: "Dead players cannot vote." };

  // "abstain" / empty selection means a null target (no one).
  const targetId =
    typeof rawTarget === "string" && rawTarget && rawTarget !== "abstain"
      ? rawTarget
      : null;

  if (targetId) {
    const { data: target } = await supabase
      .from("game_players")
      .select("id, status")
      .eq("id", targetId)
      .eq("game_id", gameId)
      .maybeSingle();
    if (!target || target.status !== "alive") {
      return { error: "You can only vote for a living player." };
    }
  }

  const { error } = await supabase.from("votes").upsert(
    {
      game_id: gameId,
      phase_id: phase.id,
      voter_id: me.id,
      target_id: targetId,
    },
    { onConflict: "phase_id,voter_id" },
  );

  if (error) return { error: error.message };

  revalidatePath(`/games/${gameId}`);
  return {};
}

/**
 * Tallies the day vote for a voting phase and eliminates the player with the
 * most votes. Only votes cast by living players for living targets count, and a
 * tie (or no votes) eliminates no one. Writes a notification for the eliminated
 * player and a `voting_resolved` event with the full tally. Runs as the host
 * (the only caller is `advancePhase`, which verifies host + running game).
 */
async function processVoting(
  supabase: DbClient,
  gameId: string,
  phaseId: string,
  dayNumber: number,
): Promise<void> {
  const { data: players } = await supabase
    .from("game_players")
    .select(
      "id, user_id, status, profile:profiles!game_players_user_id_fkey(username, display_name)",
    )
    .eq("game_id", gameId);

  const aliveIds = new Set(
    (players ?? []).filter((p) => p.status === "alive").map((p) => p.id),
  );
  const userByPlayer = new Map(
    (players ?? []).map((p) => [p.id, p.user_id]),
  );
  const nameByPlayer = new Map(
    (players ?? []).map((p) => [p.id, profileName(p.profile)]),
  );
  const allUserIds = (players ?? []).map((p) => p.user_id);

  const { data: votes } = await supabase
    .from("votes")
    .select("voter_id, target_id")
    .eq("phase_id", phaseId);

  // Tally one vote per living voter for living targets (abstains are ignored).
  const tally = new Map<string, number>();
  for (const v of votes ?? []) {
    if (
      v.target_id &&
      aliveIds.has(v.voter_id) &&
      aliveIds.has(v.target_id)
    ) {
      tally.set(v.target_id, (tally.get(v.target_id) ?? 0) + 1);
    }
  }

  // Find the highest-voted target; a draw for the top spot eliminates no one.
  let eliminated: string | null = null;
  let topCount = 0;
  let tie = false;
  for (const [target, count] of tally) {
    if (count > topCount) {
      topCount = count;
      eliminated = target;
      tie = false;
    } else if (count === topCount) {
      tie = true;
    }
  }
  if (tie || topCount === 0) eliminated = null;

  const now = new Date().toISOString();

  if (eliminated) {
    await supabase
      .from("game_players")
      .update({ status: "dead", eliminated_at: now })
      .eq("id", eliminated)
      .eq("game_id", gameId);

    const uid = userByPlayer.get(eliminated);
    if (uid) {
      await supabase.from("notifications").insert({
        user_id: uid,
        game_id: gameId,
        type: "eliminated",
        title: "You were voted out",
        body: "The town voted to eliminate you.",
      });
      await sendPushToUsers([uid], {
        title: "You were voted out",
        body: "The town voted to eliminate you.",
        url: `/games/${gameId}`,
        tag: `${gameId}:eliminated`,
      }).catch(() => {});
    }

    // Tell everyone else who the town voted out.
    const victimName = nameByPlayer.get(eliminated) ?? "A player";
    await notifyUsers(
      supabase,
      gameId,
      allUserIds.filter((u) => u !== uid),
      "player_killed",
      "A player was voted out",
      `${victimName} was eliminated by the town vote.`,
    );

    await supabase.from("game_events").insert({
      game_id: gameId,
      phase_id: phaseId,
      actor_id: eliminated,
      event_type: "player_eliminated",
      data: { player_id: eliminated, cause: "vote", day_number: dayNumber },
    });
  }

  await supabase.from("game_events").insert({
    game_id: gameId,
    phase_id: phaseId,
    event_type: "voting_resolved",
    data: {
      day_number: dayNumber,
      eliminated,
      tie: tie && topCount > 0,
      tally: Object.fromEntries(tally),
    },
  });
}

/**
 * Counts the living players by alignment and returns the winning alignment, or
 * `null` if the game continues. Reads secret alignments, so it must run as the
 * host (RLS allows the host to read every role in their game).
 */
async function evaluateGameWinner(
  supabase: DbClient,
  gameId: string,
): Promise<WinAlignment | null> {
  const [{ data: players }, { data: roleRows }] = await Promise.all([
    supabase.from("game_players").select("id, status").eq("game_id", gameId),
    supabase
      .from("game_player_roles")
      .select("player_id, alignment")
      .eq("game_id", gameId),
  ]);

  const alignmentByPlayer = new Map(
    (roleRows ?? []).map((r) => [r.player_id, r.alignment as string]),
  );
  const aliveAlignments = (players ?? [])
    .filter((p) => p.status === "alive")
    .map((p) => alignmentByPlayer.get(p.id) ?? "town");

  return evaluateWin(aliveAlignments);
}

/**
 * Ends a game: closes the final phase, stamps the winner and completion time on
 * the game, and logs a `game_ended` event. Updating the phase to `completed`
 * (which is on the realtime publication) nudges every client to refresh onto the
 * game-over screen.
 */
async function endGame(
  supabase: DbClient,
  gameId: string,
  finalPhaseId: string | null,
  winner: WinAlignment | null,
): Promise<void> {
  const now = new Date().toISOString();

  if (finalPhaseId) {
    await supabase
      .from("game_phases")
      .update({ status: "completed", ended_at: now })
      .eq("id", finalPhaseId);
  }

  await supabase
    .from("games")
    .update({
      status: "completed",
      winner_alignment: winner,
      ended_at: now,
      current_phase_id: null,
    })
    .eq("id", gameId);

  await supabase.from("game_events").insert({
    game_id: gameId,
    phase_id: finalPhaseId,
    event_type: "game_ended",
    data: { winner_alignment: winner },
  });

  // Tell everyone the game is over and who won.
  const { data: players } = await supabase
    .from("game_players")
    .select("user_id")
    .eq("game_id", gameId);

  const body = winner
    ? `${winner === "mafia" ? "The Mafia" : "The Town"} won the game.`
    : "The host ended the game.";

  await notifyUsers(
    supabase,
    gameId,
    (players ?? []).map((p) => p.user_id),
    "game_ended",
    "The game has ended",
    body,
  );
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
  const allUserIds = (players ?? []).map((p) => p.user_id);
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
      await sendPushToUsers([uid], {
        title: "You were eliminated",
        body: "You did not survive the night.",
        url: `/games/${gameId}`,
        tag: `${gameId}:eliminated`,
      }).catch(() => {});
    }

    // Announce the overnight death to everyone else.
    const victimName = nameByPlayer.get(playerId) ?? "A player";
    await notifyUsers(
      supabase,
      gameId,
      allUserIds.filter((u) => u !== uid),
      "player_killed",
      "A player was killed",
      `${victimName} did not survive the night.`,
    );

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
        const investigationBody = `${targetName} is ${suspicious ? "suspicious" : "not suspicious"}.`;
        await supabase.from("notifications").insert({
          user_id: detectiveUid,
          game_id: gameId,
          type: "investigation",
          title: "Investigation result",
          body: investigationBody,
        });
        await sendPushToUsers([detectiveUid], {
          title: "Investigation result",
          body: investigationBody,
          url: `/games/${gameId}`,
          tag: `${gameId}:investigation`,
        }).catch(() => {});
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

const MAX_CHAT_LENGTH = 500;

/**
 * Sends a chat message to a room. Room access (which player may post where, and
 * the mute/dead restrictions) is enforced by RLS via `private.can_post_chat_room`,
 * so a rejected insert means the player isn't allowed to post in that room.
 */
export async function sendChatMessage(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const { supabase, user } = await requirePlayer();

  const gameId = formData.get("game_id");
  const roomId = formData.get("room_id");
  const rawBody = formData.get("body");
  if (
    typeof gameId !== "string" ||
    !gameId ||
    typeof roomId !== "string" ||
    !roomId
  ) {
    return { error: "Missing chat room." };
  }

  const body = typeof rawBody === "string" ? rawBody.trim() : "";
  if (!body) return { error: "Type a message first." };
  if (body.length > MAX_CHAT_LENGTH) {
    return { error: `Messages are limited to ${MAX_CHAT_LENGTH} characters.` };
  }

  const { data: me } = await supabase
    .from("game_players")
    .select("id")
    .eq("game_id", gameId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!me) return { error: "You are not in this game." };

  const { error } = await supabase.from("chat_messages").insert({
    game_id: gameId,
    room_id: roomId,
    sender_id: me.id,
    body,
  });

  // RLS blocks posting when muted, dead (in a living room), or in a room the
  // player can't access — surface a friendly message instead of the raw error.
  if (error) {
    return { error: "You can't send messages in this chat." };
  }

  return {};
}

/**
 * Host moderation: mute or unmute a player so they can read chat but not post.
 * RLS lets the host update players in their own game; the host's own row is
 * never muted.
 */
export async function toggleMute(formData: FormData): Promise<void> {
  const { supabase, user } = await requirePlayer();

  const gameId = formData.get("game_id");
  const playerId = formData.get("player_id");
  if (typeof gameId !== "string" || typeof playerId !== "string") return;

  const mute = formData.get("mute") === "true";

  const { data: game } = await supabase
    .from("games")
    .select("host_id")
    .eq("id", gameId)
    .maybeSingle();
  if (!game || game.host_id !== user.id) {
    redirect(`/games/${gameId}`);
  }

  await supabase
    .from("game_players")
    .update({ is_muted: mute })
    .eq("id", playerId)
    .eq("game_id", gameId)
    .eq("is_host", false);

  await supabase.from("host_actions").insert({
    game_id: gameId,
    host_id: user.id,
    action_type: mute ? "mute_player" : "unmute_player",
    target_player_id: playerId,
  });

  revalidatePath(`/games/${gameId}`);
}

/**
 * Host moderation: pause or resume a running game. While paused, players can't
 * submit night actions or votes; the host can still force the next phase or end
 * the game. Logs the action and notifies every player.
 */
export async function setGamePause(formData: FormData): Promise<void> {
  const { supabase, user } = await requirePlayer();

  const gameId = formData.get("game_id");
  if (typeof gameId !== "string") return;

  const pause = formData.get("pause") === "true";

  const { data: game } = await supabase
    .from("games")
    .select("id, host_id, status")
    .eq("id", gameId)
    .maybeSingle();
  if (!game || game.host_id !== user.id || game.status !== "in_progress") {
    redirect(`/games/${gameId}`);
  }

  await supabase
    .from("games")
    .update({ is_paused: pause })
    .eq("id", gameId)
    .eq("host_id", user.id);

  await supabase.from("host_actions").insert({
    game_id: gameId,
    host_id: user.id,
    action_type: pause ? "pause_game" : "resume_game",
  });

  const { data: players } = await supabase
    .from("game_players")
    .select("user_id")
    .eq("game_id", gameId);

  await notifyUsers(
    supabase,
    gameId,
    (players ?? []).map((p) => p.user_id),
    "phase",
    pause ? "Game paused" : "Game resumed",
    pause
      ? "The host paused the game. Hang tight."
      : "The host resumed the game.",
  );

  revalidatePath(`/games/${gameId}`);
}

/**
 * Host moderation: end the game immediately. Closes the active phase, marks the
 * game completed with no winner, and notifies every player. The auto-win path
 * (`advancePhase` → `endGame`) stamps a winner; this manual stop does not.
 */
export async function endGameByHost(formData: FormData): Promise<void> {
  const { supabase, user } = await requirePlayer();

  const gameId = formData.get("game_id");
  if (typeof gameId !== "string") return;

  const { data: game } = await supabase
    .from("games")
    .select("id, host_id, status")
    .eq("id", gameId)
    .maybeSingle();
  if (!game || game.host_id !== user.id || game.status !== "in_progress") {
    redirect(`/games/${gameId}`);
  }

  const { data: active } = await supabase
    .from("game_phases")
    .select("id")
    .eq("game_id", gameId)
    .eq("status", "active")
    .order("phase_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  await endGame(supabase, gameId, active?.id ?? null, null);

  await supabase.from("host_actions").insert({
    game_id: gameId,
    host_id: user.id,
    action_type: "end_game",
  });

  revalidatePath(`/games/${gameId}`);
}
