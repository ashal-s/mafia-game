import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  defaultRoleKeys,
  investigate,
  nextPhase,
  resolveNight,
  shuffle,
  tallyVotes,
} from "../.test-dist/game-engine.js";
import { evaluateWin } from "../.test-dist/win.js";

describe("role assignment", () => {
  for (let playerCount = 5; playerCount <= 15; playerCount += 1) {
    it(`creates the correct role count for ${playerCount} players`, () => {
      const roles = defaultRoleKeys(playerCount);
      assert.equal(roles.length, playerCount);
      assert.equal(
        roles.filter((role) => role === "mafia").length,
        Math.floor(playerCount / 4),
      );
      assert.ok(roles.includes("detective"));
      assert.ok(roles.includes("healer"));
    });
  }

  it("assigns every role once without mutating the source list", () => {
    const roles = defaultRoleKeys(7);
    const assigned = shuffle(roles, () => 0);
    assert.equal(assigned.length, 7);
    assert.deepEqual(assigned.sort(), [...roles].sort());
    assert.deepEqual(roles, defaultRoleKeys(7));
  });
});

describe("night resolution", () => {
  const alive = new Set(["mafia", "healer", "target", "detective"]);

  it("prevents the mafia target from dying when protected", () => {
    const result = resolveNight(
      [
        { type: "mafia_kill", targetId: "target" },
        { type: "heal", targetId: "target" },
      ],
      alive,
    );
    assert.deepEqual(result.deaths, []);
    assert.equal(result.protectedTarget, "target");
  });

  it("reports the target's correct team to the detective", () => {
    assert.deepEqual(investigate("mafia"), { suspicious: true });
    assert.deepEqual(investigate("town"), { suspicious: false });
    assert.deepEqual(investigate("neutral"), { suspicious: false });
  });
});

describe("voting", () => {
  const alive = new Set(["a", "b", "c", "d"]);

  it("counts one standard vote per living voter", () => {
    assert.deepEqual(
      tallyVotes(
        [
          { voterId: "a", targetId: "d" },
          { voterId: "b", targetId: "d" },
          { voterId: "c", targetId: "a" },
        ],
        alive,
      ),
      { tally: { d: 2, a: 1 }, eliminated: "d", tied: false },
    );
  });

  it("eliminates no one when the leading vote is tied", () => {
    const result = tallyVotes(
      [
        { voterId: "a", targetId: "c" },
        { voterId: "b", targetId: "d" },
      ],
      alive,
    );
    assert.equal(result.eliminated, null);
    assert.equal(result.tied, true);
  });
});

describe("win and phase rules", () => {
  it("awards the village a win after all mafia are eliminated", () => {
    assert.equal(evaluateWin(["town", "town", "neutral"]), "town");
  });

  it("awards the opposing team a win when mafia reach parity", () => {
    assert.equal(evaluateWin(["mafia", "town"]), "mafia");
  });

  it("advances phases in gameplay order and loops back to night", () => {
    assert.equal(nextPhase("night"), "discussion");
    assert.equal(nextPhase("discussion"), "voting");
    assert.equal(nextPhase("voting"), "results");
    assert.equal(nextPhase("results"), "night");
  });
});
