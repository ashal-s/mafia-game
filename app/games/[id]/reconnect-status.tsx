export type ReconnectState =
  | "action_required"
  | "already_submitted"
  | "waiting"
  | "dead"
  | "paused";

export type LatestAlert = {
  type: string;
  title: string;
  body: string | null;
  created_at: string;
} | null;

const STATE_COPY: Record<
  ReconnectState,
  { eyebrow: string; title: string; detail: string; style: string }
> = {
  action_required: {
    eyebrow: "Action required",
    title: "It’s your turn",
    detail: "Complete the action below before this phase ends.",
    style: "border-amber-700/60 bg-amber-950/35 text-amber-100",
  },
  already_submitted: {
    eyebrow: "Action submitted",
    title: "You’re all caught up",
    detail: "Your choice is saved. You can change it until the phase ends.",
    style: "border-emerald-800/60 bg-emerald-950/25 text-emerald-100",
  },
  waiting: {
    eyebrow: "No action needed",
    title: "Waiting for the next phase",
    detail: "You can follow the conversation and see recent events below.",
    style: "border-sky-800/60 bg-sky-950/25 text-sky-100",
  },
  dead: {
    eyebrow: "Eliminated",
    title: "You’re watching from the graveyard",
    detail: "You can’t act or vote, but you can follow the game and use dead chat.",
    style: "border-red-800/60 bg-red-950/30 text-red-100",
  },
  paused: {
    eyebrow: "Game paused",
    title: "Waiting for the host",
    detail: "Actions are on hold. Your current submission remains saved.",
    style: "border-zinc-700 bg-zinc-900/70 text-zinc-100",
  },
};

function formatAlertTime(value: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function ReconnectStatus({
  state,
  latestAlert,
}: {
  state: ReconnectState;
  latestAlert: LatestAlert;
}) {
  const copy = STATE_COPY[state];

  return (
    <section aria-label="Your current game status" className="mt-4 space-y-3">
      <div className={`rounded-2xl border px-5 py-4 ${copy.style}`}>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] opacity-70">
          {copy.eyebrow}
        </p>
        <h2 className="mt-1 text-lg font-semibold">{copy.title}</h2>
        <p className="mt-1 text-sm opacity-80">{copy.detail}</p>
      </div>

      {latestAlert ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
              Latest alert
            </p>
            <time className="text-[11px] text-zinc-600" dateTime={latestAlert.created_at}>
              {formatAlertTime(latestAlert.created_at)}
            </time>
          </div>
          <p className="mt-1 text-sm font-semibold text-zinc-100">{latestAlert.title}</p>
          {latestAlert.body ? (
            <p className="mt-0.5 text-sm text-zinc-400">{latestAlert.body}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
