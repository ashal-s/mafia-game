"use server";

import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

export type SavePushResult = { ok: boolean; error?: string };

export const pushSubscriptionSchema = z.object({
  endpoint: z.url("The push endpoint is invalid.").max(2048),
  keys: z.object({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(512),
  }),
});
export type IncomingSubscription = z.infer<typeof pushSubscriptionSchema>;
const userAgentSchema = z.string().max(512, "User agent is too long.").optional();

/**
 * Stores (or refreshes) the current user's Web Push subscription. Keyed on the
 * push `endpoint` so re-subscribing on the same device updates the existing row
 * rather than creating duplicates. RLS ensures a user can only write their own.
 */
export async function savePushSubscription(
  subscription: IncomingSubscription,
  userAgent?: string,
): Promise<SavePushResult> {
  const parsed = pushSubscriptionSchema.safeParse(subscription);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid subscription." };
  const parsedUserAgent = userAgentSchema.safeParse(userAgent);
  if (!parsedUserAgent.success) return { ok: false, error: parsedUserAgent.error.issues[0]?.message };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      user_agent: parsedUserAgent.data ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Removes a subscription (e.g. after the user disables notifications). */
export async function deletePushSubscription(
  endpoint: string,
): Promise<SavePushResult> {
  const parsed = z.url("The push endpoint is invalid.").max(2048).safeParse(endpoint);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", parsed.data)
    .eq("user_id", user.id);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
