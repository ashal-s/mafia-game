"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type ProfileState = {
  error?: string;
};

const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;

export async function updateProfile(
  _prevState: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const username = String(formData.get("username") ?? "").trim();
  const displayName = String(formData.get("display_name") ?? "").trim();

  if (!USERNAME_PATTERN.test(username)) {
    return {
      error:
        "Username must be 3–20 characters using letters, numbers, or underscores.",
    };
  }

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
