import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertAuthenticated, assertCanAccessChatRoom, assertCanVote,
  assertCurrentPhase, assertGameActive, assertHost, assertPlayerAlive,
  assertPlayerInGame, assertRoleCanAct, permissionMessage, PermissionError,
} from "../lib/game-permissions";

const alive = { user_id: "u1", status: "alive" as const };

test("authentication and membership are required", () => {
  assert.throws(() => assertAuthenticated(null), /Sign in/);
  assert.throws(() => assertPlayerInGame(null), /not in this game/);
  assert.doesNotThrow(() => assertAuthenticated({ id: "u1" }));
});

test("removed and dead players cannot act", () => {
  assert.throws(() => assertPlayerAlive({ user_id: "u1", status: "left" }), PermissionError);
  assert.throws(() => assertPlayerAlive({ user_id: "u1", status: "dead" }), /Dead players/);
});

test("games must be active and unpaused", () => {
  assert.throws(() => assertGameActive({ status: "lobby" }), /not active/);
  assert.throws(() => assertGameActive({ status: "in_progress", is_paused: true }), /paused/);
});

test("voting combines alive and phase checks", () => {
  assert.throws(() => assertCurrentPhase("night", "voting"), /voting/);
  assert.throws(() => assertCanVote(alive, "discussion"), /voting/);
  assert.doesNotThrow(() => assertCanVote(alive, "voting"));
});

test("permission errors expose only their safe message", () => {
  assert.equal(permissionMessage(new PermissionError("NO", "Safe message")), "Safe message");
  assert.equal(permissionMessage(new Error("database detail")), null);
});

test("host and role checks reject unauthorized actors", () => {
  assert.throws(() => assertHost({ host_id: "host" }, "other"), /host/);
  assert.throws(() => assertRoleCanAct(null), /role/);
});

test("team chat is isolated and hosts can access every room", () => {
  assert.throws(() => assertCanAccessChatRoom({ player: alive, roomType: "mafia", alignment: "town" }), /access/);
  assert.doesNotThrow(() => assertCanAccessChatRoom({ player: alive, roomType: "mafia", alignment: "mafia" }));
  assert.doesNotThrow(() => assertCanAccessChatRoom({ player: { ...alive, is_host: true }, roomType: "dead" }));
});
