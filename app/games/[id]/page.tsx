import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserWithProfile } from "@/lib/profile";
import { Lobby } from "./lobby";
import {
  RoleReveal,
  type RoleConfig,
  type RosterEntry,
  type RoundResults,
} from "./role-reveal";
import type { ActivityEntry } from "./activity-log";
import type { NightActionProps } from "./night-actions";
import type { VoteActionProps } from "./vote-actions";
import type { ChatRoomInfo } from "./chat";
import type { HostPlayer } from "./host-dashboard";
import { GameOver } from "./game-over";
import {
  DEFAULT_HEALER_SELF_HEALS,
  DEFAULT_SNIPER_BULLETS,
  nightActionForRole,
} from "@/lib/night";

function firstOf<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function profileName(
  profile:
    | { username: string | null; display_name: string | null }
    | { username: string | null; display_name: string | null }[]
    | null
    | undefined,
): string {
  const p = firstOf(profile);
  return p?.display_name || p?.username || "Player";
}

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
    .select(
      "id, code, name, status, min_players, max_players, host_id, settings, winner_alignment, is_paused",
    )
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
    const [{ data: roleRows }, { data: phase }] = await Promise.all([
      supabase.from("game_player_roles").select(ROLE_SELECT).eq("game_id", id),
      supabase
        .from("game_phases")
        .select(
          "id, phase_type, day_number, phase_number, status, started_at, ends_at",
        )
        .eq("game_id", id)
        .eq("status", "active")
        .order("phase_number", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const roleConfig =
      game.settings &&
      typeof game.settings === "object" &&
      !Array.isArray(game.settings)
        ? ((game.settings as { roleConfig?: RoleConfig }).roleConfig ?? null)
        : null;

    const selfRow = (roleRows ?? []).find((r) => r.user_id === user.id);
    const selfPlayerId = selfRow?.player_id ?? null;
    const selfRoleKey = firstOf(selfRow?.role)?.key ?? null;
    const descriptor = nightActionForRole(
      selfRoleKey,
      selfRow?.alignment ?? null,
    );

    let night: NightActionProps | null = null;

    // Night action UI: only while the active phase is night and the player has
    // a living, acting role.
    if (phase?.phase_type === "night" && descriptor && selfPlayerId) {
      const { data: alive } = await supabase
        .from("game_players")
        .select(
          "id, status, seat, profile:profiles!game_players_user_id_fkey(username, display_name)",
        )
        .eq("game_id", id)
        .eq("status", "alive")
        .order("seat", { ascending: true });

      if ((alive ?? []).some((p) => p.id === selfPlayerId)) {
        const { data: myAction } = await supabase
          .from("role_actions")
          .select("target_id")
          .eq("phase_id", phase.id)
          .eq("actor_id", selfPlayerId)
          .maybeSingle();

        let limit: { label: string; remaining: number | null } | null = null;
        let disableSelf = false;
        if (descriptor.type === "sniper_shoot") {
          const configured = roleConfig?.sniper?.bullets;
          const max =
            configured === null ? null : (configured ?? DEFAULT_SNIPER_BULLETS);
          if (max === null) {
            limit = { label: "Bullets", remaining: null };
          } else {
            const { count } = await supabase
              .from("role_actions")
              .select("id", { count: "exact", head: true })
              .eq("actor_id", selfPlayerId)
              .eq("action_type", "sniper_shoot")
              .not("target_id", "is", null)
              .neq("phase_id", phase.id);
            limit = { label: "Bullets", remaining: Math.max(0, max - (count ?? 0)) };
          }
        } else if (descriptor.type === "heal") {
          const configured = roleConfig?.healer?.selfHeals;
          const max =
            configured === null
              ? null
              : (configured ?? DEFAULT_HEALER_SELF_HEALS);
          if (max === null) {
            limit = { label: "Self-heals", remaining: null };
          } else {
            const { count } = await supabase
              .from("role_actions")
              .select("id", { count: "exact", head: true })
              .eq("actor_id", selfPlayerId)
              .eq("action_type", "heal")
              .eq("target_id", selfPlayerId)
              .neq("phase_id", phase.id);
            const remaining = Math.max(0, max - (count ?? 0));
            limit = { label: "Self-heals", remaining };
            // Out of self-heals: keep the action, just remove the self option.
            disableSelf = remaining === 0;
          }
        }

        night = {
          gameId: game.id,
          actionType: descriptor.type,
          allowSelf: descriptor.allowSelf,
          optional: descriptor.optional,
          alivePlayers: (alive ?? []).map((p) => ({
            id: p.id,
            name: profileName(p.profile),
            isSelf: p.id === selfPlayerId,
          })),
          currentTargetId: myAction?.target_id ?? null,
          hasSubmitted: Boolean(myAction),
          limit,
          disableSelf,
        };
      }
    }

    // Full roster (alive/dead), shown throughout the in-progress game.
    const { data: allPlayers } = await supabase
      .from("game_players")
      .select(
        "id, user_id, status, seat, is_host, is_muted, is_ready, profile:profiles!game_players_user_id_fkey(username, display_name)",
      )
      .eq("game_id", id)
      .order("seat", { ascending: true });

    const nameByPlayerId = new Map(
      (allPlayers ?? []).map((p) => [p.id, profileName(p.profile)]),
    );

    const roster: RosterEntry[] = (allPlayers ?? []).map((p) => ({
      id: p.id,
      name: profileName(p.profile),
      alive: p.status === "alive",
      seat: p.seat,
      isSelf: p.id === selfPlayerId,
      isHost: p.is_host,
      muted: p.is_muted,
    }));

    // Host dashboard: full per-player view (role, alignment, live status). Only
    // built for the host — RLS already exposes every role to them.
    const roleByPlayerId = new Map(
      (roleRows ?? []).map((r) => [r.player_id, r]),
    );
    const hostPlayers: HostPlayer[] = isHost
      ? (allPlayers ?? []).map((p) => {
          const rr = roleByPlayerId.get(p.id);
          const roleKey = firstOf(rr?.role)?.key ?? null;
          const alignment = (rr?.alignment ?? "town") as HostPlayer["alignment"];
          return {
            id: p.id,
            name: profileName(p.profile),
            roleName: firstOf(rr?.role)?.name ?? "—",
            alignment,
            alive: p.status === "alive",
            isHost: p.is_host,
            muted: p.is_muted,
            ready: p.is_ready,
            actsAtNight: Boolean(nightActionForRole(roleKey, alignment)),
          };
        })
      : [];

    // Chat: list readable rooms (RLS already filters to ones the player may see)
    // and compute whether the player may post in each.
    const selfPlayer = (allPlayers ?? []).find((p) => p.id === selfPlayerId);
    const selfStatus = selfPlayer?.status ?? null;
    const selfMuted = Boolean(selfPlayer?.is_muted);
    const selfIsMafia = selfRow?.alignment === "mafia";

    const namesById: Record<string, string> = {};
    for (const p of allPlayers ?? []) {
      namesById[p.id] = profileName(p.profile);
    }

    const { data: chatRoomRows } = await supabase
      .from("chat_rooms")
      .select("id, type, name")
      .eq("game_id", id);

    const ROOM_RANK: Record<string, number> = {
      town: 0,
      mafia: 1,
      dead: 2,
      system: 3,
    };

    const chatRooms: ChatRoomInfo[] = (chatRoomRows ?? [])
      .filter(
        (r) =>
          r.type !== "dead" || selfStatus === "dead" || isHost,
      )
      .slice()
      .sort((a, b) => (ROOM_RANK[a.type] ?? 9) - (ROOM_RANK[b.type] ?? 9))
      .map((r) => {
        let canWrite = false;
        let writeHint: string | null = null;
        if (r.type === "town") {
          canWrite = selfStatus === "alive";
          if (!canWrite && selfStatus === "dead") {
            writeHint = "Dead players can read the town chat but can't post.";
          }
        } else if (r.type === "mafia") {
          canWrite = selfStatus === "alive" && selfIsMafia;
          if (!canWrite) {
            writeHint =
              selfIsMafia && selfStatus === "dead"
                ? "Dead mafia can read the mafia chat but can't post."
                : "You're viewing the mafia chat for moderation.";
          }
        } else if (r.type === "dead") {
          canWrite = selfStatus === "dead";
          if (!canWrite) {
            writeHint = "You're viewing the graveyard for moderation.";
          }
        }
        return {
          id: r.id,
          type: r.type as ChatRoomInfo["type"],
          name: r.name,
          canWrite,
          writeHint,
        };
      });

    // Voting UI: alive players vote, the dead and observers see the live tally.
    let voting: VoteActionProps | null = null;
    if (phase?.phase_type === "voting") {
      const alive = (allPlayers ?? []).filter((p) => p.status === "alive");
      const { data: voteRows } = await supabase
        .from("votes")
        .select("voter_id, target_id")
        .eq("phase_id", phase.id);

      const myVote = selfPlayerId
        ? (voteRows ?? []).find((v) => v.voter_id === selfPlayerId)
        : undefined;
      const meAlive = Boolean(
        selfPlayerId && alive.some((p) => p.id === selfPlayerId),
      );

      voting = {
        gameId: game.id,
        phaseId: phase.id,
        canVote: meAlive,
        alivePlayers: alive.map((p) => ({
          id: p.id,
          name: profileName(p.profile),
          isSelf: p.id === selfPlayerId,
        })),
        currentTargetId: myVote?.target_id ?? null,
        hasVoted: Boolean(myVote),
        initialVotes: voteRows ?? [],
      };
    }

    // Results UI: surface the outcome of the day's vote during the results phase.
    let results: RoundResults = null;
    if (phase?.phase_type === "results") {
      const { data: ev } = await supabase
        .from("game_events")
        .select("data")
        .eq("game_id", id)
        .eq("event_type", "voting_resolved")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const data = ev?.data as {
        eliminated?: string | null;
        tie?: boolean;
        day_number?: number;
      } | null;

      results = {
        eliminatedName: data?.eliminated
          ? (nameByPlayerId.get(data.eliminated) ?? "A player")
          : null,
        tie: Boolean(data?.tie),
        dayNumber: data?.day_number ?? phase.day_number,
      };
    }

    // Player-specific activity history (own actions and events only).
    let activityLog: ActivityEntry[] = [];
    if (selfPlayerId) {
      const [{ data: myActions }, { data: myEvents }] = await Promise.all([
        supabase
          .from("role_actions")
          .select(
            "id, action_type, target_id, result, created_at, phase:game_phases(day_number)",
          )
          .eq("actor_id", selfPlayerId)
          .eq("resolved", true)
          .order("created_at", { ascending: false }),
        supabase
          .from("game_events")
          .select("id, event_type, data, created_at, actor_id")
          .eq("game_id", id)
          .in("event_type", ["player_eliminated", "player_saved"])
          .order("created_at", { ascending: false }),
      ]);

      const entries: ActivityEntry[] = [];

      for (const action of myActions ?? []) {
        const phase = firstOf(
          action.phase as
            | { day_number?: number }
            | { day_number?: number }[]
            | null,
        );
        const dayLabel = phase?.day_number
          ? `Day ${phase.day_number}`
          : "This round";

        if (action.action_type === "investigate") {
          const result = action.result as {
            suspicious?: boolean;
            target_id?: string;
          } | null;
          if (result?.target_id && typeof result.suspicious === "boolean") {
            entries.push({
              id: action.id,
              at: action.created_at,
              title: "Investigation result",
              detail: `${nameByPlayerId.get(result.target_id) ?? "Your target"} is ${
                result.suspicious ? "suspicious" : "not suspicious"
              } (${dayLabel}).`,
              tone: result.suspicious ? "danger" : "success",
            });
          }
        } else if (action.target_id) {
          const targetName = nameByPlayerId.get(action.target_id) ?? "a player";
          if (action.action_type === "mafia_kill") {
            entries.push({
              id: action.id,
              at: action.created_at,
              title: "Mafia kill target",
              detail: `You chose ${targetName} as the mafia's target (${dayLabel}).`,
              tone: "danger",
            });
          } else if (action.action_type === "heal") {
            entries.push({
              id: action.id,
              at: action.created_at,
              title: "Protection used",
              detail: `You protected ${targetName} (${dayLabel}).`,
              tone: "success",
            });
          } else if (action.action_type === "sniper_shoot") {
            entries.push({
              id: action.id,
              at: action.created_at,
              title: "Sniper shot",
              detail: `You shot ${targetName} (${dayLabel}).`,
              tone: "danger",
            });
          }
        } else if (action.action_type === "sniper_shoot") {
          entries.push({
            id: action.id,
            at: action.created_at,
            title: "Held fire",
            detail: `You chose not to shoot (${dayLabel}).`,
            tone: "neutral",
          });
        }
      }

      for (const ev of myEvents ?? []) {
        const data = ev.data as {
          player_id?: string;
          cause?: string;
          day_number?: number;
        } | null;
        const dayLabel = data?.day_number ? `Day ${data.day_number}` : "";

        if (ev.event_type === "player_eliminated" && ev.actor_id === selfPlayerId) {
          const cause =
            data?.cause === "vote"
              ? "voted out by the town"
              : "killed during the night";
          entries.push({
            id: ev.id,
            at: ev.created_at,
            title: "You were eliminated",
            detail: `You were ${cause}${dayLabel ? ` (${dayLabel})` : ""}.`,
            tone: "danger",
          });
        } else if (
          ev.event_type === "player_saved" &&
          data?.player_id === selfPlayerId
        ) {
          entries.push({
            id: ev.id,
            at: ev.created_at,
            title: "You were saved",
            detail: `Someone protected you from an attack${dayLabel ? ` (${dayLabel})` : ""}.`,
            tone: "success",
          });
        }
      }

      activityLog = entries.sort(
        (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
      );
    }

    return (
      <RoleReveal
        gameId={game.id}
        gameName={game.name}
        rows={roleRows ?? []}
        isHost={isHost}
        currentUserId={user.id}
        roleConfig={roleConfig}
        phase={phase ?? null}
        isPaused={game.is_paused}
        hostPlayers={hostPlayers}
        night={night}
        voting={voting}
        results={results}
        roster={roster}
        activityLog={activityLog}
        selfAlive={selfStatus === "alive"}
        chat={{
          gameId: game.id,
          selfPlayerId,
          initialMuted: selfMuted,
          rooms: chatRooms,
          namesById,
        }}
      />
    );
  }

  // Completed: reveal every role and the winning side.
  if (game.status === "completed") {
    const [{ data: roleRows }, { data: players }] = await Promise.all([
      supabase.from("game_player_roles").select(ROLE_SELECT).eq("game_id", id),
      supabase
        .from("game_players")
        .select(
          "id, user_id, status, seat, profile:profiles!game_players_user_id_fkey(username, display_name)",
        )
        .eq("game_id", id)
        .order("seat", { ascending: true }),
    ]);

    const statusByUser = new Map(
      (players ?? []).map((p) => [p.user_id, p.status]),
    );

    const reveal = (roleRows ?? []).map((r) => ({
      name: profileName(r.profile),
      roleName: firstOf(r.role)?.name ?? "—",
      alignment: r.alignment,
      alive: statusByUser.get(r.user_id) === "alive",
      isSelf: r.user_id === user.id,
    }));

    return (
      <GameOver
        gameName={game.name}
        winner={game.winner_alignment}
        reveal={reveal}
      />
    );
  }

  // Cancelled (or any other non-active status).
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-transparent px-6 py-12 text-zinc-100">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 text-center">
        <h1 className="text-lg font-semibold text-zinc-50">Game cancelled</h1>
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
