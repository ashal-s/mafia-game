import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserWithProfile } from "@/lib/profile";
import { CreateGameForm } from "./create-game-form";

export default async function NewGamePage() {
  const { user, profile } = await getCurrentUserWithProfile();

  if (!user) {
    redirect("/login");
  }
  if (!profile?.username) {
    redirect("/profile/setup");
  }

  const supabase = await createClient();
  const [{ data: presets }, { data: roles }] = await Promise.all([
    supabase
      .from("role_presets")
      .select(
        "id, name, description, min_players, max_players, items:role_preset_items(count, role:roles(key, name, alignment, sort_order))",
      )
      .order("min_players", { ascending: true }),
    supabase
      .from("roles")
      .select("id, key, name, alignment, ability, description, sort_order")
      .order("sort_order", { ascending: true }),
  ]);

  return (
    <div className="flex flex-1 flex-col bg-transparent text-zinc-100">
      <AppHeader>
        <Link
          href="/dashboard"
          className="text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-200"
        >
          Back to dashboard
        </Link>
      </AppHeader>

      <main className="mx-auto w-full max-w-lg flex-1 px-6 py-12">
        <h1 className="text-2xl font-semibold text-zinc-50">Create a game</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Pick a role preset, name your table, and invite your friends.
        </p>

        <CreateGameForm presets={presets ?? []} roles={roles ?? []} />
      </main>
    </div>
  );
}
