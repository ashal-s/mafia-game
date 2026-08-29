"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

export type ProfileState = {
  error?: string;
};

export const profileSchema = z.object({
  username: z.string().trim().regex(/^[A-Za-z0-9_]{3,20}$/, "Username must be 3–20 characters using letters, numbers, or underscores."),
  display_name: z.string().trim().max(50, "Display name must be 50 characters or fewer."),
});

export async function updateProfile(
  _prevState: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const parsed = profileSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { username, display_name: displayName } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { error } = await supabase.from("profiles").upsert(
    {
      id: user.id,
      username,
      display_name: displayName || null,
    },
    { onConflict: "id" },
  );

  if (error) {
    // 23505 = unique_violation (username already taken).
    if (error.code === "23505") {
      return { error: "That username is already taken. Try another." };
    }
    return { error: error.message };
  }

  redirect("/dashboard");
}
