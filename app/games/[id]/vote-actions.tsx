"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { submitVote, type FormState } from "../actions";
import { SubmitButton } from "@/components/submit-button";

export type VotePlayer = {
  id: string;
  name: string;
  isSelf: boolean;
};

export type VoteRow = {
  voter_id: string;
  target_id: string | null;
};

export type VoteActionProps = {
  gameId: string;
  phaseId: string;
  canVote: boolean;
  alivePlayers: VotePlayer[];
  currentTargetId: string | null;
  hasVoted: boolean;
  initialVotes: VoteRow[];
};

const ABSTAIN = "abstain";

export function VoteActions(props: VoteActionProps) {
  const {
    gameId,
    phaseId,
    canVote,
    alivePlayers,
    currentTargetId,
    hasVoted,
    initialVotes,
  } = props;

  const supabase = useMemo(() => createClient(), []);
  const [votes, setVotes] = useState<VoteRow[]>(initialVotes);

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from("votes")
      .select("voter_id, target_id")
      .eq("phase_id", phaseId);
    if (data) setVotes(data as VoteRow[]);
  }, [supabase, phaseId]);

  // Live tally: day votes are public, so update counts as players vote/change.
  useEffect(() => {
    const channel = supabase
      .channel(`votes:${phaseId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "votes",
          filter: `game_id=eq.${gameId}`,
        },
        () => {
          void refresh();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, gameId, phaseId, refresh]);

  const aliveIds = useMemo(
    () => new Set(alivePlayers.map((p) => p.id)),
    [alivePlayers],
  );

  // Count one vote per living voter for each living target (abstains excluded).
  const tally = useMemo(() => {
    const counts = new Map<string, number>();
    for (const v of votes) {
      if (v.target_id && aliveIds.has(v.voter_id) && aliveIds.has(v.target_id)) {
        counts.set(v.target_id, (counts.get(v.target_id) ?? 0) + 1);
      }
    }
    return counts;
  }, [votes, aliveIds]);

  const abstainCount = useMemo(() => {
    let n = 0;
    for (const v of votes) {
      if (!v.target_id && aliveIds.has(v.voter_id)) n += 1;
    }
    return n;
  }, [votes, aliveIds]);

  const [state, formAction] = useActionState<FormState, FormData>(
    submitVote,
    {},
  );

  const initialChoice = currentTargetId ?? (hasVoted ? ABSTAIN : "");
  const [choice, setChoice] = useState<string>(initialChoice);

  const selectable = alivePlayers.filter((p) => !p.isSelf);

  // Spectators and the dead see the live tally but cannot cast a vote.
  if (!canVote) {
    return (
      <section className="mt-6 rounded-2xl border border-amber-800/50 bg-amber-950/20 p-6">
        <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">
          Voting
        </p>
        <h2 className="mt-1 text-lg font-semibold text-zinc-50">
          Town vote in progress
        </h2>
        <p className="mt-1 text-sm text-zinc-300">
          Only living players can vote. Here is the running tally.
        </p>
        <Tally
          selectable={alivePlayers}
          tally={tally}
          abstainCount={abstainCount}
        />
      </section>
    );
  }

  return (
    <section className="mt-6 rounded-2xl border border-amber-800/50 bg-amber-950/20 p-6">
      <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">
        Voting
      </p>
      <h2 className="mt-1 text-lg font-semibold text-zinc-50">
        Vote to eliminate
      </h2>
      <p className="mt-1 text-sm text-zinc-300">
        Choose a player to vote out, or abstain. You can change your vote until
        voting closes. The most-voted player is eliminated; a tie eliminates no
        one.
      </p>

      {hasVoted ? (
        <p className="mt-4 rounded-lg border border-zinc-700/60 bg-zinc-950/40 px-3 py-2 text-sm text-zinc-300">
          {currentTargetId
            ? `Your vote is locked in for ${
                alivePlayers.find((p) => p.id === currentTargetId)?.name ??
                "a player"
              }. You can change it until voting closes.`
            : "You are abstaining. You can change your vote until voting closes."}
        </p>
      ) : null}

      <form action={formAction} className="mt-4 space-y-2">
        <input type="hidden" name="game_id" value={gameId} />

        <fieldset className="space-y-2">
          {selectable.map((p) => {
            const count = tally.get(p.id) ?? 0;
            return (
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
                  className="h-4 w-4 accent-amber-500"
                />
                <span className="flex-1 text-sm font-medium text-zinc-100">
                  {p.name}
                </span>
                <VoteCount count={count} />
              </label>
            );
          })}

          <label
            className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${
              choice === ABSTAIN
                ? "border-zinc-400 bg-zinc-800/60"
                : "border-zinc-700/60 bg-zinc-950/30 hover:border-zinc-600"
            }`}
          >
            <input
              type="radio"
              name="target_id"
              value={ABSTAIN}
              checked={choice === ABSTAIN}
              onChange={() => setChoice(ABSTAIN)}
              className="h-4 w-4 accent-amber-500"
            />
            <span className="flex-1 text-sm font-medium text-zinc-100">
              Abstain (vote no one)
            </span>
            <VoteCount count={abstainCount} />
          </label>
        </fieldset>

        {state.error ? (
          <p className="text-sm text-red-400">{state.error}</p>
        ) : null}

        <SubmitButton
          pendingText="Submitting…"
          disabled={choice === "" || selectable.length === 0}
        >
          {hasVoted ? "Change vote" : "Cast vote"}
        </SubmitButton>
      </form>
    </section>
  );
}

function VoteCount({ count }: { count: number }) {
  return (
    <span className="shrink-0 rounded-full border border-zinc-700/60 bg-zinc-950/50 px-2 py-0.5 font-mono text-xs font-semibold text-zinc-300">
      {count} {count === 1 ? "vote" : "votes"}
    </span>
  );
}

function Tally({
  selectable,
  tally,
  abstainCount,
}: {
  selectable: VotePlayer[];
  tally: Map<string, number>;
  abstainCount: number;
}) {
  return (
    <ul className="mt-4 space-y-2">
      {selectable.map((p) => (
        <li
          key={p.id}
          className="flex items-center gap-3 rounded-xl border border-zinc-700/60 bg-zinc-950/30 px-4 py-3"
        >
          <span className="flex-1 text-sm font-medium text-zinc-100">
            {p.name}
          </span>
          <VoteCount count={tally.get(p.id) ?? 0} />
        </li>
      ))}
      <li className="flex items-center gap-3 rounded-xl border border-zinc-700/60 bg-zinc-950/30 px-4 py-3">
        <span className="flex-1 text-sm font-medium text-zinc-100">
          Abstain
        </span>
        <VoteCount count={abstainCount} />
      </li>
    </ul>
  );
}
