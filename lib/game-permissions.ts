export type GameStatus = "lobby" | "in_progress" | "completed" | "cancelled";
export type PlayerStatus = "alive" | "dead" | "left";
export type GamePhase = "day" | "night" | "discussion" | "voting" | "results";
export type ChatRoomType = "town" | "mafia" | "dead" | "system";

export class PermissionError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "PermissionError";
    this.code = code;
  }
}

type User = { id: string } | null | undefined;
type Player = {
  user_id?: string;
  status: PlayerStatus;
  is_host?: boolean;
  is_muted?: boolean;
} | null;

export function assertAuthenticated<T extends User>(user: T): asserts user is Exclude<T, null | undefined> {
  if (!user) throw new PermissionError("AUTH_REQUIRED", "Sign in to continue.");
}

export function assertPlayerInGame(player: Player): asserts player is NonNullable<Player> {
  if (!player || player.status === "left") {
    throw new PermissionError("NOT_IN_GAME", "You are not in this game.");
  }
}

export function assertPlayerAlive(player: Player): asserts player is NonNullable<Player> {
  assertPlayerInGame(player);
  if (player.status !== "alive") {
    throw new PermissionError("PLAYER_NOT_ALIVE", "Dead players cannot do that.");
  }
}

export function assertCurrentPhase(actual: GamePhase | null, expected: GamePhase): void {
  if (actual !== expected) {
    throw new PermissionError("WRONG_PHASE", `This action is only available during ${expected}.`);
  }
}

export function assertRoleCanAct(actionType: string | null): asserts actionType is string {
  if (!actionType) {
    throw new PermissionError("ROLE_CANNOT_ACT", "Your role cannot perform this action.");
  }
}

export function assertCanVote(player: Player, phase: GamePhase | null): asserts player is NonNullable<Player> {
  assertPlayerAlive(player);
  assertCurrentPhase(phase, "voting");
}

export function assertHost(game: { host_id: string } | null, userId: string): asserts game is { host_id: string } {
  if (!game || game.host_id !== userId) {
    throw new PermissionError("HOST_REQUIRED", "Only the game host can do that.");
  }
}

export function assertGameActive(
  game: { status: GameStatus; is_paused?: boolean } | null,
  options: { allowPaused?: boolean } = {},
): asserts game is { status: "in_progress"; is_paused?: boolean } {
  if (!game || game.status !== "in_progress") {
    throw new PermissionError("GAME_NOT_ACTIVE", "This game is not active.");
  }
  if (game.is_paused && !options.allowPaused) {
    throw new PermissionError("GAME_PAUSED", "The game is paused by the host.");
  }
}

export function assertCanAccessChatRoom(args: {
  player: Player;
  roomType: ChatRoomType;
  alignment?: string | null;
  forPosting?: boolean;
}): void {
  const { player, roomType, alignment, forPosting = false } = args;
  assertPlayerInGame(player);
  if (forPosting && player.is_muted) {
    throw new PermissionError("CHAT_MUTED", "You can't send messages in this chat.");
  }
  if (player.is_host) return;
  const allowed = roomType === "system"
    ? !forPosting
    : roomType === "dead"
    ? player.status === "dead"
    : roomType === "mafia"
      ? player.status === "alive" && alignment === "mafia"
      : player.status === "alive";
  if (!allowed) {
    throw new PermissionError("CHAT_FORBIDDEN", "You can't access this chat.");
  }
}

export function permissionMessage(error: unknown): string | null {
  return error instanceof PermissionError ? error.message : null;
}
