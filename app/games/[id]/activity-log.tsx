export type ActivityEntry = {
  id: string;
  at: string;
  title: string;
  detail: string;
  tone: "neutral" | "danger" | "success" | "info";
};

const TONE_STYLES: Record<ActivityEntry["tone"], string> = {
  neutral: "border-zinc-700/60 bg-zinc-950/30",
  danger: "border-red-800/50 bg-red-950/20",
  success: "border-emerald-800/50 bg-emerald-950/20",
  info: "border-sky-800/50 bg-sky-950/20",
};

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ActivityLog({ entries }: { entries: ActivityEntry[] }) {
  if (entries.length === 0) return null;

  return (
    <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
      <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">
        Your activity
      </p>
      <h2 className="mt-1 text-lg font-semibold text-zinc-50">Activity log</h2>
      <p className="mt-1 text-sm text-zinc-400">
        A history of actions and events that involve you.
      </p>

      <ol className="mt-4 space-y-2">
        {entries.map((entry) => (
          <li
            key={entry.id}
            className={`rounded-xl border px-4 py-3 ${TONE_STYLES[entry.tone]}`}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium text-zinc-100">{entry.title}</p>
              <time
                dateTime={entry.at}
                className="shrink-0 text-[10px] text-zinc-500"
              >
                {formatWhen(entry.at)}
              </time>
            </div>
            <p className="mt-1 text-sm text-zinc-300">{entry.detail}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
