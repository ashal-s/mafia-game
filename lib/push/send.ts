import webpush from "web-push";
import { createAdminClient, hasServiceRole } from "@/lib/supabase/admin";

export type PushPayload = {
  title: string;
  body?: string;
  /** Path to open/focus when the notification is tapped (e.g. `/games/abc`). */
  url?: string;
  /** Collapse key so repeat alerts replace rather than stack. */
  tag?: string;
};

let vapidConfigured: boolean | null = null;

/**
 * Lazily configures the shared VAPID identity. Returns false (and disables push)
 * when the keys are not set, so the app runs fine without push configured.
 */
function ensureVapid(): boolean {
  if (vapidConfigured !== null) return vapidConfigured;

  const publicKey =
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:notifications@example.com";

  if (!publicKey || !privateKey) {
    vapidConfigured = false;
    return false;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

/** True when Web Push can actually be delivered (VAPID + service role present). */
export function isPushEnabled(): boolean {
  return ensureVapid() && hasServiceRole();
}

/**
 * Sends a Web Push notification to every stored subscription for the given
 * users. Best-effort and fire-and-forget friendly: errors are swallowed and
 * subscriptions that the push service reports as gone (404/410) are pruned.
 *
 * Uses the service-role client because it must read other players'
 * subscriptions (which are owner-only under RLS).
 */
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload,
): Promise<void> {
  const unique = Array.from(new Set(userIds)).filter(Boolean);
  if (unique.length === 0) return;
  if (!isPushEnabled()) return;

  const admin = createAdminClient();

  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("user_id", unique);

  if (!subs || subs.length === 0) return;

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body ?? "",
    url: payload.url ?? "/",
    tag: payload.tag,
  });

  const staleIds: string[] = [];

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body,
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          staleIds.push(sub.id);
        }
        // Other errors (network, rate limit) are ignored; the in-app
        // notification still lands and the user resyncs on focus.
      }
    }),
  );

  if (staleIds.length > 0) {
    await admin.from("push_subscriptions").delete().in("id", staleIds);
  }
}
