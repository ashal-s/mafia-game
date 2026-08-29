import { redirect } from "next/navigation";
import { MafiaLogo } from "@/components/mafia-logo";
import { getCurrentUserWithProfile } from "@/lib/profile";
import { ProfileSetupForm } from "./form";

export default async function ProfileSetupPage() {
  const { user, profile } = await getCurrentUserWithProfile();

  if (!user) {
    redirect("/login");
  }

  // Username already chosen — nothing to set up.
  if (profile?.username) {
    redirect("/dashboard");
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-transparent px-4 py-16 text-zinc-100">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <MafiaLogo size="lg" />
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 shadow-xl">
          <h1 className="text-xl font-semibold text-zinc-50">
            Choose your username
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            You&apos;ll need a username before you can join or create games.
          </p>
          <ProfileSetupForm defaultDisplayName={profile?.display_name} />
        </div>
      </div>
    </div>
  );
}
