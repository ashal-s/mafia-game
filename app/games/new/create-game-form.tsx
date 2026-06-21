"use client";

import { useActionState, useState } from "react";
import { createGame, type FormState } from "@/app/games/actions";
import { SubmitButton } from "@/components/submit-button";

type Preset = {
  id: string;
  name: string;
  description: string | null;
  min_players: number;
  max_players: number;
};

const initialState: FormState = {};

export function CreateGameForm({ presets }: { presets: Preset[] }) {
  const [state, formAction] = useActionState(createGame, initialState);
  const [selectedId, setSelectedId] = useState(presets[0]?.id ?? "");

  const selected = presets.find((preset) => preset.id === selectedId);

  return (
    <form action={formAction} className="mt-6 space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="name" className="text-sm font-medium text-zinc-300">
          Game name <span className="text-zinc-500">(optional)</span>
        </label>
        <input
          id="name"
          name="name"
          type="text"
          maxLength={80}
          className="h-11 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-red-500 focus:outline-none"
          placeholder="Friday Night Mafia"
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-zinc-300">Role preset</legend>
        {presets.length === 0 ? (
          <p className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-400">
            No presets available.
          </p>
        ) : (
          <div className="space-y-2">
            {presets.map((preset) => (
              <label
                key={preset.id}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors ${
                  selectedId === preset.id
                    ? "border-red-500 bg-red-950/20"
                    : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-700"
                }`}
              >
                <input
                  type="radio"
                  name="preset_id"
                  value={preset.id}
                  checked={selectedId === preset.id}
                  onChange={() => setSelectedId(preset.id)}
                  className="mt-1 accent-red-500"
                />
                <span className="flex-1">
                  <span className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-zinc-100">
                      {preset.name}
                    </span>
                    <span className="font-mono text-xs text-zinc-400">
                      {preset.min_players}–{preset.max_players} players
                    </span>
                  </span>
                  {preset.description ? (
                    <span className="mt-0.5 block text-xs text-zinc-400">
                      {preset.description}
                    </span>
                  ) : null}
                </span>
              </label>
            ))}
          </div>
        )}
      </fieldset>

      {selected ? (
        <p className="text-xs text-zinc-500">
          You can start once at least{" "}
          <span className="font-medium text-zinc-300">{selected.min_players}</span>{" "}
          players have joined. Up to{" "}
          <span className="font-medium text-zinc-300">{selected.max_players}</span>{" "}
          can play.
        </p>
      ) : null}

      {state.error ? (
        <p className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">
          {state.error}
        </p>
      ) : null}

      <SubmitButton pendingText="Creating…">Create game</SubmitButton>
    </form>
  );
}
