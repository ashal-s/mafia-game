export type TimelineEvent = {
  id: string;
  at: string;
  day: number;
  phase: string;
  type: string;
  title: string;
  detail: string;
  hostOnly: boolean;
};

const EVENT_STYLE: Record<string, string> = {
  death: "border-red-800/50 bg-red-950/20",
  vote: "border-amber-800/50 bg-amber-950/20",
  phase: "border-sky-800/50 bg-sky-950/20",
  end: "border-emerald-800/50 bg-emerald-950/20",
};

function labelPhase(phase: string) {
  return phase.charAt(0).toUpperCase() + phase.slice(1);
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function GameTimeline({ events, isHost }: { events: TimelineEvent[]; isHost: boolean }) {
  if (events.length === 0) return null;

  const days = new Map<number, Map<string, TimelineEvent[]>>();
  for (const event of events) {
    const phases = days.get(event.day) ?? new Map<string, TimelineEvent[]>();
    const phaseEvents = phases.get(event.phase) ?? [];
    phaseEvents.push(event);
    phases.set(event.phase, phaseEvents);
    days.set(event.day, phases);
  }

  return (
    <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 sm:p-6">
      <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">
        Game history
      </p>
      <div className="mt-1 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-50">Timeline</h2>
          <p className="mt-1 text-sm text-zinc-400">
            {isHost ? "Public events and host-only game details." : "What has happened in the game so far."}
          </p>
        </div>
        {isHost ? (
          <span className="shrink-0 rounded-full border border-amber-800/60 bg-amber-950/30 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-amber-300">
            Host view
          </span>
        ) : null}
      </div>

      <div className="mt-5 space-y-7">
        {[...days].map(([day, phases]) => (
          <section key={day} aria-labelledby={`timeline-day-${day}`}>
            <div className="flex items-center gap-3">
              <h3 id={`timeline-day-${day}`} className="shrink-0 text-sm font-semibold text-zinc-100">
                Day {day}
              </h3>
              <div className="h-px flex-1 bg-zinc-800" />
            </div>
            <div className="mt-3 space-y-5">
              {[...phases].map(([phase, phaseEvents]) => (
                <div key={phase}>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
                    {labelPhase(phase)}
                  </p>
                  <ol className="relative ml-1 space-y-2 border-l border-zinc-700 pl-4">
                    {phaseEvents.map((event) => (
                      <li key={event.id} className={`relative rounded-xl border px-3 py-3 sm:px-4 ${EVENT_STYLE[event.type] ?? EVENT_STYLE.phase}`}>
                        <span className="absolute -left-[1.32rem] top-5 h-2 w-2 rounded-full bg-zinc-500 ring-4 ring-zinc-900" />
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-medium text-zinc-100">{event.title}</p>
                          <time dateTime={event.at} className="shrink-0 text-[10px] text-zinc-500">
                            {formatTime(event.at)}
                          </time>
                        </div>
                        <p className="mt-1 text-sm text-zinc-300">{event.detail}</p>
                        {event.hostOnly ? (
                          <span className="mt-2 inline-block text-[10px] font-medium uppercase tracking-wide text-amber-400">
                            Host only
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
