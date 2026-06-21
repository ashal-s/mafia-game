import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserWithProfile } from "@/lib/profile";

export default async function Home() {
  const { user, profile } = await getCurrentUserWithProfile();

  // Signed-in users skip the marketing page.
  if (user) {
    redirect(profile?.username ? "/dashboard" : "/profile/setup");
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-950 px-4 text-center text-zinc-100">
      <main className="flex max-w-xl flex-col items-center gap-6">
        <span className="text-5xl font-bold tracking-tight text-red-500">
          Mafia
        </span>
        <h1 className="text-3xl font-semibold leading-tight text-zinc-50 sm:text-4xl">
          The classic game of deception, online.
        </h1>
        <p className="max-w-md text-base text-zinc-400">
          Gather your friends, take on secret roles, and figure out who you can
          trust before the town falls.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/signup"
            className="flex h-11 items-center justify-center rounded-lg bg-red-600 px-6 text-sm font-semibold text-white transition-colors hover:bg-red-500"
          >
            Get started
          </Link>
          <Link
            href="/login"
            className="flex h-11 items-center justify-center rounded-lg border border-zinc-700 px-6 text-sm font-semibold text-zinc-200 transition-colors hover:border-zinc-600"
          >
            Log in
          </Link>
        </div>
      </main>
    </div>
  );
}
