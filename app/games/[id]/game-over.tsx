import Link from "next/link";
import { AppHeader } from "@/components/app-header";

type Alignment = "town" | "mafia" | "neutral";

export type RevealEntry = {
  name: string;
  roleName: string;
  alignment: Alignment;
  alive: boolean;
  isSelf: boolean;
};

const ALIGNMENT_BADGE: Record<Alignment, string> = {
  mafia: "border-red-700/60 bg-red-950/40 text-red-300",
  town: "border-emerald-700/50 bg-emerald-950/30 text-emerald-300",
  neutral: "border-amber-700/50 bg-amber-950/30 text-amber-300",
};

const WINNER_BANNER: Record<
  Alignment,
  { title: string; blurb: string; card: string; title_color: string }
> = {
  mafia: {
    title: "Mafia win",
    blurb: "The mafia reached parity and seized the town.",
    card: "border-red-800/60 bg-red-950/30",
    title_color: "text-red-300",
  },
  town: {
    title: "Town wins",
    blurb: "Every member of the mafia has been eliminated.",
    card: "border-emerald-800/50 bg-emerald-950/25",
    title_color: "text-emerald-300",
  },
  neutral: {
    title: "Neutral wins",
    blurb: "A neutral party achieved their goal.",
    card: "border-amber-800/50 bg-amber-950/25",
    title_color: "text-amber-300",
  },
};

export function GameOver({
  gameName,
  winner,
  reveal,
}: {
  gameName: string | null;
  winner: Alignment | null;
  reveal: RevealEntry[];
}) {
  const banner = winner ? WINNER_BANNER[winner] : null;

  return (
    <div className="flex flex-1 flex-col bg-transparent text-zinc-100">
      <AppHeader>
        <span className="text-xs font-medium uppercase tracking-widest text-zinc-500">
          {gameName || "Mafia game"}
        </span>
      </AppHeader>

      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
        <section
          className={`rounded-2xl border p-6 text-center ${
            banner?.card ?? "border-zinc-800 bg-zinc-900/60"
          }`}
        >
          <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">
            Game over
          </p>
          <h1
            className={`mt-2 text-3xl font-bold ${
              banner?.title_color ?? "text-zinc-50"
            }`}
          >
            {banner?.title ?? "Game over"}
          </h1>
          {banner?.blurb ? (
            <p className="mt-2 text-sm text-zinc-300">{banner.blurb}</p>
          ) : null}
        </section>

        <section className="mt-8">
          <h2 className="text-sm font-semibold text-zinc-200">
            Final roles
          </h2>
          <div className="mt-3 overflow-hidden rounded-xl border border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-900/80 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Player</th>
                  <th className="px-4 py-2 font-medium">Role</th>
                  <th className="px-4 py-2 font-medium">Team</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {reveal.map((r, i) => (
                  <tr key={i} className="bg-zinc-950/40">
                    <td className="px-4 py-2 text-zinc-200">
                      {r.name}
                      {r.isSelf ? (
                        <span className="ml-1 text-xs text-zinc-500">
                          (you)
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2 text-zinc-300">{r.roleName}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs font-medium ${ALIGNMENT_BADGE[r.alignment]}`}
                      >
                        {r.alignment.charAt(0).toUpperCase() +
                          r.alignment.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`text-xs font-medium ${
                          r.alive ? "text-emerald-300" : "text-zinc-500"
                        }`}
                      >
                        {r.alive ? "Survived" : "Eliminated"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="mt-8">
          <Link
            href="/dashboard"
            className="inline-flex h-11 items-center justify-center rounded-lg border border-zinc-700 px-4 text-sm font-medium text-zinc-200 transition-colors hover:border-zinc-600"
          >
            Back to dashboard
          </Link>
        </div>
      </main>
    </div>
  );
}
