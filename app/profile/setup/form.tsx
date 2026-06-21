"use client";

import { useActionState } from "react";
import { updateProfile, type ProfileState } from "./actions";
import { SubmitButton } from "@/components/submit-button";

const initialState: ProfileState = {};

export function ProfileSetupForm({
  defaultDisplayName,
}: {
  defaultDisplayName?: string | null;
}) {
  const [state, formAction] = useActionState(updateProfile, initialState);

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="username" className="text-sm font-medium text-zinc-300">
          Username <span className="text-red-400">*</span>
        </label>
        <input
          id="username"
          name="username"
          type="text"
          required
          minLength={3}
          maxLength={20}
          pattern="[A-Za-z0-9_]+"
          autoComplete="username"
          className="h-11 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-red-500 focus:outline-none"
          placeholder="e.g. night_owl"
        />
        <p className="text-xs text-zinc-500">
          3–20 characters. Letters, numbers, and underscores only. Must be unique.
        </p>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="display_name"
          className="text-sm font-medium text-zinc-300"
        >
          Display name{" "}
          <span className="text-zinc-500">(optional)</span>
        </label>
        <input
          id="display_name"
          name="display_name"
          type="text"
          maxLength={60}
          defaultValue={defaultDisplayName ?? ""}
          className="h-11 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-red-500 focus:outline-none"
          placeholder="Shown to other players"
        />
      </div>

      {state.error ? (
        <p className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">
          {state.error}
        </p>
      ) : null}

      <SubmitButton pendingText="Saving…">Continue to dashboard</SubmitButton>
    </form>
  );
}
