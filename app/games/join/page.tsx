import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserWithProfile } from "@/lib/profile";
import { JoinGameForm } from "./join-form";

export default async function JoinGamePage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { user, profile } = await getCurrentUserWithProfile();

  if (!user) {
    redirect("/login");
  }
  if (!profile?.username) {
    redirect("/profile/setup");
  }

  const { code } = await searchParams;

  return (
    <div className="flex flex-1 flex-col bg-zinc-950 text-zinc-100">
      <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
        <Link href="/dashboard" className="text-lg font-bold tracking-tight text-red-500">
          Mafia
        </Link>
        <Link
          href="/dashboard"
          className="text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-200"
        >
          Back to dashboard
        </Link>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 px-6 py-12">
        <h1 className="text-2xl font-semibold text-zinc-50">Join a game</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Enter the invite code your host shared with you.
        </p>

        <JoinGameForm defaultCode={code ?? ""} />
      </main>
    </div>
  );
}
