import { createClient } from "@/lib/supabase/server";

export type ActiveGame = {
  id: string;
  name: string | null;
  code: string;
  status: "lobby" | "in_progress";
  phaseType: string | null;
  dayNumber: number | null;
  playerStatus: "alive" | "dead" | "left";
};

const PHASE_LABELS: Record<string, string> = {
  night: "Night",
  discussion: "Discussion",
  voting: "Voting",
  results: "Results",
  day: "Day",
};

export function formatGamePhase(
  status: ActiveGame["status"],
  phaseType: string | null,
  dayNumber: number | null,
): string {
  if (status === "lobby") return "Lobby";
  if (!phaseType) return "In progress";
  const label = PHASE_LABELS[phaseType] ?? phaseType;
  return dayNumber ? `Day ${dayNumber} · ${label}` : label;
}

/** Active games the user has joined (lobby or in progress, not left). */
export async function getActiveGamesForUser(
  userId: string,
): Promise<ActiveGame[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("game_players")
    .select(
      `
      status,
      game:games!inner(
        id,
        name,
        code,
        status,
        phase:game_phases!games_current_phase_id_fkey(phase_type, day_number)
      )
    `,
    )
    .eq("user_id", userId)
    .neq("status", "left");

  if (!data) return [];

  const games: ActiveGame[] = [];
  for (const row of data) {
    const game = Array.isArray(row.game) ? row.game[0] : row.game;
    if (!game || (game.status !== "lobby" && game.status !== "in_progress")) {
      continue;
    }
    const phase = Array.isArray(game.phase) ? game.phase[0] : game.phase;
    games.push({
      id: game.id,
      name: game.name,
      code: game.code,
      status: game.status,
      phaseType: phase?.phase_type ?? null,
      dayNumber: phase?.day_number ?? null,
      playerStatus: row.status,
    });
  }
  return games;
}
