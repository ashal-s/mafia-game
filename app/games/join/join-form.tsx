"use client";

import { useActionState } from "react";
import { joinByCode, type FormState } from "@/app/games/actions";
import { SubmitButton } from "@/components/submit-button";

const initialState: FormState = {};

export function JoinGameForm({ defaultCode }: { defaultCode: string }) {
  const [state, formAction] = useActionState(joinByCode, initialState);

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="code" className="text-sm font-medium text-zinc-300">
          Invite code
        </label>
        <input
          id="code"
          name="code"
          type="text"
          required
          maxLength={6}
          autoCapitalize="characters"
          autoComplete="off"
          defaultValue={defaultCode}
          className="h-12 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-center font-mono text-lg uppercase tracking-[0.4em] text-zinc-100 placeholder:tracking-normal placeholder:text-zinc-500 focus:border-red-500 focus:outline-none"
          placeholder="ABC123"
        />
      </div>

      {state.error ? (
        <p className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">
          {state.error}
        </p>
      ) : null}

      <SubmitButton pendingText="Joining…">Join game</SubmitButton>
    </form>
  );
}
