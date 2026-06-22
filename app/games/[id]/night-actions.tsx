"use client";

import { useActionState, useState } from "react";
import { submitNightAction, type FormState } from "../actions";
import { SubmitButton } from "@/components/submit-button";
import type { NightActionType } from "@/lib/night";

export type NightTarget = {
  id: string;
  name: string;
  isSelf: boolean;
};

export type NightActionProps = {
  gameId: string;
  actionType: NightActionType;
  allowSelf: boolean;
  optional: boolean;
  alivePlayers: NightTarget[];
  currentTargetId: string | null;
  hasSubmitted: boolean;
  limit?: { label: string; remaining: number | null } | null;
  /**
   * When true, the player may still act on others but not on themselves — used
   * for the healer once their self-heals are exhausted.
   */
  disableSelf?: boolean;
};

const SKIP = "skip";

const META: Record<
  NightActionType,
  { title: string; blurb: string; verb: string; accent: string }
> = {
  mafia_kill: {
    title: "Choose your kill",
    blurb: "Pick a player for the mafia to eliminate tonight.",
    verb: "eliminate",
    accent: "border-red-800/60 bg-red-950/30",
  },
  investigate: {
    title: "Investigate a player",
    blurb: "Choose someone to learn whether they are suspicious.",
    verb: "investigate",
    accent: "border-sky-800/50 bg-sky-950/25",
  },
  heal: {
    title: "Protect a player",
    blurb: "Choose a player to shield from the night's attack.",
    verb: "protect",
    accent: "border-emerald-800/50 bg-emerald-950/25",
  },
  sniper_shoot: {
    title: "Take your shot",
    blurb: "Spend a bullet to kill a player — or hold your fire.",
    verb: "shoot",
    accent: "border-amber-800/50 bg-amber-950/25",
  },
};

export function NightActions(props: NightActionProps) {
  const {
    gameId,
    actionType,
    allowSelf,
    optional,
    alivePlayers,
    currentTargetId,
    hasSubmitted,
    limit,
    disableSelf,
  } = props;

  const meta = META[actionType];
  const canSelf = allowSelf && !disableSelf;
  const selectable = alivePlayers.filter((p) => canSelf || !p.isSelf);

  const [state, formAction] = useActionState<FormState, FormData>(
    submitNightAction,
    {},
  );

  // Default selection: a previously chosen target, or "skip" for an optional
  // action that has already been submitted with no target.
  const initialChoice =
    currentTargetId ?? (optional && hasSubmitted ? SKIP : "");
  const [choice, setChoice] = useState<string>(initialChoice);

  // Only the sniper is fully blocked when out of resource — every shot spends a
  // bullet. The healer's self-heal limit only removes the self option, so they
  // can keep protecting others.
  const outOfResource = actionType === "sniper_shoot" && limit?.remaining === 0;
  const submittedTarget = currentTargetId
    ? (alivePlayers.find((p) => p.id === currentTargetId)?.name ?? "a player")
    : null;

  return (
    <section className={`mt-6 rounded-2xl border p-6 ${meta.accent}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">
            Night action
          </p>
          <h2 className="mt-1 text-lg font-semibold text-zinc-50">
            {meta.title}
          </h2>
          <p className="mt-1 text-sm text-zinc-300">{meta.blurb}</p>
        </div>
        {limit ? (
          <div className="shrink-0 rounded-lg border border-zinc-700/60 bg-zinc-950/40 px-3 py-1.5 text-center">
            <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">
              {limit.label} left
            </p>
            <p className="font-mono text-sm font-semibold text-zinc-100">
              {limit.remaining === null ? "∞" : limit.remaining}
            </p>
          </div>
        ) : null}
      </div>

      {hasSubmitted ? (
        <p className="mt-4 rounded-lg border border-zinc-700/60 bg-zinc-950/40 px-3 py-2 text-sm text-zinc-300">
          {submittedTarget
            ? `Locked in: you will ${meta.verb} ${submittedTarget}. You can change this until the night ends.`
            : "Locked in: you are holding your fire. You can change this until the night ends."}
        </p>
      ) : null}

      {disableSelf && !outOfResource ? (
        <p className="mt-4 rounded-lg border border-amber-800/50 bg-amber-950/20 px-3 py-2 text-sm text-amber-300">
          You&apos;re out of self-heals — you can still protect other players,
          just not yourself.
        </p>
      ) : null}

      {outOfResource ? (
        <p className="mt-4 text-sm text-amber-300">
          You have no {limit?.label.toLowerCase()} remaining.
        </p>
      ) : (
        <form action={formAction} className="mt-4 space-y-2">
          <input type="hidden" name="game_id" value={gameId} />

          <fieldset className="space-y-2">
            {selectable.map((p) => (
              <label
                key={p.id}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${
                  choice === p.id
                    ? "border-zinc-400 bg-zinc-800/60"
                    : "border-zinc-700/60 bg-zinc-950/30 hover:border-zinc-600"
                }`}
              >
                <input
                  type="radio"
                  name="target_id"
                  value={p.id}
                  checked={choice === p.id}
                  onChange={() => setChoice(p.id)}
                  className="h-4 w-4 accent-red-500"
                />
                <span className="text-sm font-medium text-zinc-100">
                  {p.name}
                  {p.isSelf ? (
                    <span className="ml-1 text-xs text-zinc-500">(you)</span>
                  ) : null}
                </span>
              </label>
            ))}

            {optional ? (
              <label
                className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${
                  choice === SKIP
                    ? "border-zinc-400 bg-zinc-800/60"
                    : "border-zinc-700/60 bg-zinc-950/30 hover:border-zinc-600"
                }`}
              >
                <input
                  type="radio"
                  name="target_id"
                  value={SKIP}
                  checked={choice === SKIP}
                  onChange={() => setChoice(SKIP)}
                  className="h-4 w-4 accent-red-500"
                />
                <span className="text-sm font-medium text-zinc-100">
                  Hold fire (don&apos;t shoot)
                </span>
              </label>
            ) : null}
          </fieldset>

          {state.error ? (
            <p className="text-sm text-red-400">{state.error}</p>
          ) : null}

          <SubmitButton
            pendingText="Submitting…"
            disabled={choice === "" || selectable.length === 0}
          >
            {hasSubmitted ? "Update choice" : "Lock in choice"}
          </SubmitButton>
        </form>
      )}
    </section>
  );
}
