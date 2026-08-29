export type PhaseType = "night" | "discussion" | "voting" | "results";

export type RoleDefinition = {
  id: string;
  key: string;
  alignment: string;
};

export type Vote = { voterId: string; targetId: string | null };

export type NightAction = {
  type: "mafia_kill" | "heal" | "investigate" | "sniper_shoot";
  targetId: string | null;
};

export const PHASE_ORDER: readonly PhaseType[] = [
  "night",
  "discussion",
  "voting",
  "results",
];

/** Returns the role mix used when a game has no preset or custom composition. */
export function defaultRoleKeys(playerCount: number): string[] {
  if (!Number.isInteger(playerCount) || playerCount < 3 || playerCount > 30) {
    throw new RangeError("Games require between 3 and 30 players.");
  }

  const keys = Array.from(
    { length: Math.max(1, Math.floor(playerCount / 4)) },
    () => "mafia",
  );
  keys.push("detective", "healer");
  if (playerCount >= 7) keys.push("sniper");
  while (keys.length < playerCount) keys.push("villager");
  return keys;
}

/** Fisher-Yates shuffle with injectable randomness for deterministic tests. */
export function shuffle<T>(items: readonly T[], random = Math.random): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function nextPhase(current: PhaseType): PhaseType {
  const index = PHASE_ORDER.indexOf(current);
  return PHASE_ORDER[(index + 1) % PHASE_ORDER.length];
}

export function investigate(alignment: string | undefined): {
  suspicious: boolean;
} {
  return { suspicious: alignment === "mafia" };
}

export function resolveNight(
  actions: readonly NightAction[],
  alivePlayerIds: ReadonlySet<string>,
): { deaths: string[]; mafiaTarget: string | null; protectedTarget: string | null } {
  const mafiaVotes = new Map<string, number>();
  for (const action of actions) {
    if (
      action.type === "mafia_kill" &&
      action.targetId &&
      alivePlayerIds.has(action.targetId)
    ) {
      mafiaVotes.set(action.targetId, (mafiaVotes.get(action.targetId) ?? 0) + 1);
    }
  }

  let mafiaTarget: string | null = null;
  let mostVotes = 0;
  for (const [targetId, votes] of mafiaVotes) {
    if (votes > mostVotes) {
      mafiaTarget = targetId;
      mostVotes = votes;
    }
  }

  const firstLivingTarget = (type: NightAction["type"]) =>
    actions.find(
      (action) =>
        action.type === type &&
        action.targetId !== null &&
        alivePlayerIds.has(action.targetId),
    )?.targetId ?? null;
  const protectedTarget = firstLivingTarget("heal");
  const sniperTarget = firstLivingTarget("sniper_shoot");
  const deaths = new Set<string>();
  if (mafiaTarget && mafiaTarget !== protectedTarget) deaths.add(mafiaTarget);
  if (sniperTarget) deaths.add(sniperTarget);

  return { deaths: [...deaths], mafiaTarget, protectedTarget };
}

export function tallyVotes(
  votes: readonly Vote[],
  alivePlayerIds: ReadonlySet<string>,
): { tally: Record<string, number>; eliminated: string | null; tied: boolean } {
  const tally: Record<string, number> = {};
  for (const vote of votes) {
    if (
      vote.targetId &&
      alivePlayerIds.has(vote.voterId) &&
      alivePlayerIds.has(vote.targetId)
    ) {
      tally[vote.targetId] = (tally[vote.targetId] ?? 0) + 1;
    }
  }

  let eliminated: string | null = null;
  let topCount = 0;
  let tied = false;
  for (const [targetId, count] of Object.entries(tally)) {
    if (count > topCount) {
      eliminated = targetId;
      topCount = count;
      tied = false;
    } else if (count === topCount) {
      tied = true;
    }
  }
  if (tied || topCount === 0) eliminated = null;
  return { tally, eliminated, tied: tied && topCount > 0 };
}
