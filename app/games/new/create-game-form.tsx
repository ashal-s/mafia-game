"use client";

import { useActionState, useMemo, useState } from "react";
import { createGame, type FormState } from "@/app/games/actions";
import { SubmitButton } from "@/components/submit-button";

type Alignment = "town" | "mafia" | "neutral";

type PresetItemRole = {
  key: string;
  name: string;
  alignment: Alignment;
  sort_order: number;
};

type PresetItem = {
  count: number;
  role: PresetItemRole | PresetItemRole[] | null;
};

type Preset = {
  id: string;
  name: string;
  description: string | null;
  min_players: number;
  max_players: number;
  items: PresetItem[];
};

type Role = {
  id: string;
  key: string;
  name: string;
  alignment: Alignment;
  ability: string;
  description: string | null;
  sort_order: number;
};

const initialState: FormState = {};

const ALIGNMENT_BADGE: Record<Alignment, string> = {
  mafia: "border-red-700/60 bg-red-950/40 text-red-300",
  town: "border-emerald-700/50 bg-emerald-950/30 text-emerald-300",
  neutral: "border-amber-700/50 bg-amber-950/30 text-amber-300",
};

function one<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function Stepper({
  value,
  onChange,
  min,
  max,
}: {
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
}) {
  const btn =
    "flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-700 text-lg leading-none text-zinc-200 transition-colors hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label="Decrease"
        onClick={() => onChange(value - 1)}
        disabled={value <= min}
        className={btn}
      >
        −
      </button>
      <span className="w-7 text-center font-mono text-sm text-zinc-100">
        {value}
      </span>
      <button
        type="button"
        aria-label="Increase"
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        className={btn}
      >
        +
      </button>
    </div>
  );
}

function LimitRow({
  title,
  subtitle,
  value,
  setValue,
  unlimited,
  setUnlimited,
  min,
  max,
  name,
}: {
  title: string;
  subtitle: string;
  value: number;
  setValue: (next: number) => void;
  unlimited: boolean;
  setUnlimited: (next: boolean) => void;
  min: number;
  max: number;
  name: string;
}) {
  // Never submit (or display) more than the cap, even if the value was set
  // higher before the player count / preset changed.
  const effective = clamp(value, min, max);
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-100">{title}</p>
          <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>
        </div>
        <div className={unlimited ? "pointer-events-none opacity-40" : ""}>
          <Stepper
            value={effective}
            onChange={(v) => setValue(clamp(v, min, max))}
            min={min}
            max={max}
          />
        </div>
      </div>
      <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-zinc-400">
        <input
          type="checkbox"
          checked={unlimited}
          onChange={(e) => setUnlimited(e.target.checked)}
          className="accent-red-500"
        />
        Unlimited (capped at {max} per game)
      </label>
      <input
        type="hidden"
        name={name}
        value={unlimited ? "unlimited" : effective}
      />
    </div>
  );
}

export function CreateGameForm({
  presets,
  roles,
}: {
  presets: Preset[];
  roles: Role[];
}) {
  const [state, formAction] = useActionState(createGame, initialState);

  const specials = useMemo(
    () =>
      roles
        .filter((r) => r.key !== "villager")
        .sort((a, b) => a.sort_order - b.sort_order),
    [roles],
  );

  const [setup, setSetup] = useState<string>(presets[0]?.id ?? "custom");
  const [players, setPlayers] = useState(8);
  const [counts, setCounts] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const r of specials) {
      init[r.key] =
        r.key === "mafia" || r.key === "detective" || r.key === "healer"
          ? 1
          : 0;
    }
    return init;
  });

  const [sniperBullets, setSniperBullets] = useState(2);
  const [sniperUnlimited, setSniperUnlimited] = useState(false);
  const [healerSelfHeals, setHealerSelfHeals] = useState(1);
  const [healerUnlimited, setHealerUnlimited] = useState(false);

  const presetRoleKeys = useMemo(() => {
    const preset = presets.find((p) => p.id === setup);
    const keys = new Set<string>();
    for (const item of preset?.items ?? []) {
      const role = one(item.role);
      if (role) keys.add(role.key);
    }
    return keys;
  }, [presets, setup]);

  const includesSniper =
    setup === "custom"
      ? (counts["sniper"] ?? 0) > 0
      : presetRoleKeys.has("sniper");
  const includesHealer =
    setup === "custom"
      ? (counts["healer"] ?? 0) > 0
      : presetRoleKeys.has("healer");

  const specialsTotal = specials.reduce(
    (sum, r) => sum + (counts[r.key] ?? 0),
    0,
  );
  const mafiaTotal = specials
    .filter((r) => r.alignment === "mafia")
    .reduce((sum, r) => sum + (counts[r.key] ?? 0), 0);
  const villagers = players - specialsTotal;
  const seatsLeft = Math.max(0, players - specialsTotal);

  const selectedPreset = presets.find((p) => p.id === setup);
  // Each round has exactly one night, so a game can never run more rounds than
  // there are players — that's the ceiling for bullets / self-heals.
  const maxRounds =
    setup === "custom" ? players : (selectedPreset?.max_players ?? 15);

  const customInvalid =
    setup === "custom" &&
    (players < 3 || players > 30 || mafiaTotal < 1 || villagers < 0);

  function setCount(key: string, next: number) {
    setCounts((prev) => ({ ...prev, [key]: clamp(next, 0, 30) }));
  }

  function optionCard(selected: boolean) {
    return `flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors ${
      selected
        ? "border-red-500 bg-red-950/20"
        : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-700"
    }`;
  }

  return (
    <form action={formAction} className="mt-6 space-y-6">
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

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-zinc-300">
          Game setup
        </legend>
        <p className="text-xs text-zinc-500">
          Pick a ready-made preset or build your own role mix.
        </p>

        {presets.map((preset) => {
          const items = (preset.items ?? [])
            .map((item) => ({ count: item.count, role: one(item.role) }))
            .filter(
              (item): item is { count: number; role: PresetItemRole } =>
                item.role !== null,
            )
            .sort((a, b) => a.role.sort_order - b.role.sort_order);
          const selected = setup === preset.id;

          return (
            <label key={preset.id} className={optionCard(selected)}>
              <input
                type="radio"
                name="setup"
                value={preset.id}
                checked={selected}
                onChange={() => setSetup(preset.id)}
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
                <span className="mt-2 flex flex-wrap gap-1.5">
                  {items.map((item) => (
                    <span
                      key={item.role.key}
                      className={`rounded-full border px-2 py-0.5 text-xs font-medium ${ALIGNMENT_BADGE[item.role.alignment]}`}
                    >
                      {item.count}× {item.role.name}
                    </span>
                  ))}
                </span>
                <span className="mt-1.5 block text-xs text-zinc-500">
                  Extra players above the baseline join as villagers (up to{" "}
                  {preset.max_players}).
                </span>
              </span>
            </label>
          );
        })}

        {specials.length > 0 ? (
          <label className={optionCard(setup === "custom")}>
            <input
              type="radio"
              name="setup"
              value="custom"
              checked={setup === "custom"}
              onChange={() => setSetup("custom")}
              className="mt-1 accent-red-500"
            />
            <span className="flex-1">
              <span className="text-sm font-semibold text-zinc-100">
                Custom game
              </span>
              <span className="mt-0.5 block text-xs text-zinc-400">
                Choose the number of players and exactly how many of each role.
                Villagers fill the rest.
              </span>
            </span>
          </label>
        ) : null}
      </fieldset>

      {setup === "custom" ? (
        <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-zinc-200">
                Number of players
              </p>
              <p className="text-xs text-zinc-500">All seats must fill to start.</p>
            </div>
            <Stepper
              value={players}
              onChange={(v) => setPlayers(clamp(v, 3, 30))}
              min={3}
              max={30}
            />
            <input type="hidden" name="players" value={players} />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Roles
            </p>
            {specials.map((role) => (
              <div
                key={role.key}
                className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium text-zinc-100">
                    {role.name}
                    <span
                      className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium capitalize ${ALIGNMENT_BADGE[role.alignment]}`}
                    >
                      {role.alignment}
                    </span>
                  </p>
                  {role.description ? (
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {role.description}
                    </p>
                  ) : null}
                </div>
                <Stepper
                  value={counts[role.key] ?? 0}
                  onChange={(v) => setCount(role.key, v)}
                  min={0}
                  max={(counts[role.key] ?? 0) + seatsLeft}
                />
                <input
                  type="hidden"
                  name={`count_${role.key}`}
                  value={counts[role.key] ?? 0}
                />
              </div>
            ))}

            <div className="flex items-center justify-between rounded-xl border border-emerald-900/40 bg-emerald-950/20 px-3 py-2.5">
              <div>
                <p className="text-sm font-medium text-emerald-200">
                  Villager
                </p>
                <p className="text-xs text-emerald-300/70">
                  Auto-filled with the remaining seats
                </p>
              </div>
              <span className="font-mono text-sm text-emerald-200">
                {Math.max(0, villagers)}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-zinc-800 pt-3 text-xs">
            <span className="text-zinc-500">
              {specialsTotal} special {specialsTotal === 1 ? "role" : "roles"} +{" "}
              {Math.max(0, villagers)} villagers
            </span>
            <span
              className={
                villagers < 0 || mafiaTotal < 1
                  ? "font-medium text-red-300"
                  : "font-medium text-zinc-300"
              }
            >
              {players} / {players} seats
            </span>
          </div>

          {mafiaTotal < 1 ? (
            <p className="text-xs text-amber-300">
              Add at least one Mafia so there&apos;s a threat to find.
            </p>
          ) : null}
          {villagers < 0 ? (
            <p className="text-xs text-red-300">
              You&apos;ve assigned {specialsTotal} special roles but only{" "}
              {players} players. Remove {specialsTotal - players} or add more
              players.
            </p>
          ) : null}
        </div>
      ) : null}

      {includesSniper || includesHealer ? (
        <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
          <div>
            <p className="text-sm font-medium text-zinc-200">Role options</p>
            <p className="text-xs text-zinc-500">
              Fine-tune how the special abilities work.
            </p>
          </div>

          {includesSniper ? (
            <LimitRow
              title="Sniper bullets"
              subtitle={`Shots the sniper can fire across the whole game (max ${maxRounds}).`}
              value={sniperBullets}
              setValue={setSniperBullets}
              unlimited={sniperUnlimited}
              setUnlimited={setSniperUnlimited}
              min={1}
              max={maxRounds}
              name="sniper_bullets"
            />
          ) : null}

          {includesHealer ? (
            <LimitRow
              title="Healer self-heals"
              subtitle={`Times the healer may protect themselves (max ${maxRounds}).`}
              value={healerSelfHeals}
              setValue={setHealerSelfHeals}
              unlimited={healerUnlimited}
              setUnlimited={setHealerUnlimited}
              min={0}
              max={maxRounds}
              name="healer_self_heals"
            />
          ) : null}
        </div>
      ) : null}

      {state.error ? (
        <p className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">
          {state.error}
        </p>
      ) : null}

      <SubmitButton pendingText="Creating…" disabled={customInvalid}>
        Create game
      </SubmitButton>
    </form>
  );
}
