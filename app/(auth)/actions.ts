"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

export type AuthState = {
  error?: string;
  message?: string;
};

export const credentialsSchema = z.object({
  email: z.email("Enter a valid email address.").trim(),
  password: z.string().min(1, "Password is required."),
});
export const signupSchema = credentialsSchema.extend({
  password: z.string().min(6, "Password must be at least 6 characters.").max(128, "Password must be 128 characters or fewer."),
});

export async function login(
  _prevState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = credentialsSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { email, password } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message };
  }

  redirect("/dashboard");
}

export async function signup(
  _prevState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { email, password } = parsed.data;

  const supabase = await createClient();
  const origin = (await headers()).get("origin");

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/confirm?next=/profile/setup`,
    },
  });

  if (error) {
    return { error: error.message };
  }

  // When email confirmation is enabled, no session is returned yet.
  if (!data.session) {
    return {
      message: "Check your email for a confirmation link to finish signing up.",
    };
  }

  redirect("/profile/setup");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
