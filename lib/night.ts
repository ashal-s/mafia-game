// Shared night-action helpers used by both the server actions and the game UI
// so the rules (which role acts, defaults for ability limits) stay in sync.

export const DEFAULT_SNIPER_BULLETS = 2;
export const DEFAULT_HEALER_SELF_HEALS = 1;

export type NightActionType =
  | "mafia_kill"
  | "investigate"
  | "heal"
  | "sniper_shoot";

export type NightActionDescriptor = {
  type: NightActionType;
  /** Whether the player may target themselves (healer self-protect). */
  allowSelf: boolean;
  /** Whether the action can be skipped (sniper holding fire). */
  optional: boolean;
};

/** Returns the night action a player may take, or `null` if their role is idle. */
export function nightActionForRole(
  roleKey: string | null,
  alignment: string | null,
): NightActionDescriptor | null {
  if (alignment === "mafia")
    return { type: "mafia_kill", allowSelf: false, optional: false };
  if (roleKey === "detective")
    return { type: "investigate", allowSelf: false, optional: false };
  if (roleKey === "healer")
    return { type: "heal", allowSelf: true, optional: false };
  if (roleKey === "sniper")
    return { type: "sniper_shoot", allowSelf: false, optional: true };
  return null;
}
