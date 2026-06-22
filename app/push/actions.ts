"use server";

import { createClient } from "@/lib/supabase/server";

export type SavePushResult = { ok: boolean; error?: string };

type IncomingSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

/**
 * Stores (or refreshes) the current user's Web Push subscription. Keyed on the
 * push `endpoint` so re-subscribing on the same device updates the existing row
 * rather than creating duplicates. RLS ensures a user can only write their own.
 */
export async function savePushSubscription(
  subscription: IncomingSubscription,
  userAgent?: string,
): Promise<SavePushResult> {
  if (
    !subscription?.endpoint ||
    !subscription.keys?.p256dh ||
    !subscription.keys?.auth
  ) {
    return { ok: false, error: "Invalid subscription." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      user_agent: userAgent ?? null,
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
  if (!endpoint) return { ok: false, error: "Missing endpoint." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint)
    .eq("user_id", user.id);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
