// Shared win-condition rules, kept separate from the server actions so the logic
// stays pure and easy to reason about.
//
// MVP rules:
//   * Town wins when every Mafia is dead.
//   * Mafia wins when the living Mafia equal or outnumber the living non-Mafia
//     (town + neutral), because at that point they can no longer be out-voted.

export type WinAlignment = "town" | "mafia";

/**
 * Evaluates the win condition from the alignments of the currently living
 * players. Returns the winning alignment, or `null` if the game continues.
 */
export function evaluateWin(aliveAlignments: string[]): WinAlignment | null {
  const mafia = aliveAlignments.filter((a) => a === "mafia").length;
  const nonMafia = aliveAlignments.length - mafia;

  // All mafia eliminated — town wins (also covers an empty/last-player board).
  if (mafia === 0) return "town";
  // Mafia reach parity with the rest of the table — mafia wins.
  if (mafia >= nonMafia) return "mafia";

  return null;
}
