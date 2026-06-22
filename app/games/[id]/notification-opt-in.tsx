"use client";

import { useCallback, useEffect, useState } from "react";
import { savePushSubscription } from "@/app/push/actions";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

/** Converts a base64url VAPID key into the Uint8Array the Push API expects. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

type Status = "loading" | "unsupported" | "default" | "granted" | "denied";

/**
 * Registers the service worker and lets the player turn on native (lock-screen)
 * push notifications. On iOS this only works once the app is added to the Home
 * Screen and opened standalone, so we surface a hint when subscribing fails.
 */
export function NotificationOptIn() {
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!VAPID_PUBLIC_KEY) return false;
    const registration = await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          VAPID_PUBLIC_KEY,
        ) as BufferSource,
      });
    }

    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;

    const result = await savePushSubscription(
      {
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      },
      typeof navigator !== "undefined" ? navigator.userAgent : undefined,
    );
    return result.ok;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const supported =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window &&
      Boolean(VAPID_PUBLIC_KEY);

    if (!supported) {
      // Leave status as "loading", which renders nothing. Avoids a synchronous
      // setState in the effect body.
      return;
    }

    void (async () => {
      try {
        await navigator.serviceWorker.register("/sw.js");
      } catch {
        // SW registration can fail in private mode / unsupported contexts.
      }
      if (cancelled) return;

      const permission = Notification.permission;
      if (permission === "granted") {
        // Already allowed — make sure the subscription is stored server-side.
        await subscribe().catch(() => {});
        if (!cancelled) setStatus("granted");
      } else {
        setStatus(permission as Status);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [subscribe]);

  const enable = useCallback(async () => {
    setBusy(true);
    setHint(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission as Status);
        if (permission === "denied") {
          setHint("Notifications are blocked in your device settings.");
        }
        return;
      }
      const ok = await subscribe();
      if (ok) {
        setStatus("granted");
      } else {
        setHint(
          "Add this app to your Home Screen, then open it to enable alerts.",
        );
      }
    } catch {
      setHint(
        "Add this app to your Home Screen, then open it to enable alerts.",
      );
    } finally {
      setBusy(false);
    }
  }, [subscribe]);

  if (status === "loading" || status === "unsupported" || status === "granted") {
    return null;
  }

  if (status === "denied") {
    return null;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={enable}
        disabled={busy}
        className="inline-flex h-8 items-center justify-center rounded-lg border border-zinc-700 px-3 text-xs font-medium text-zinc-200 transition-colors hover:border-red-700 hover:text-red-300 disabled:opacity-60"
      >
        {busy ? "Enabling…" : "Enable alerts"}
      </button>
      {hint ? (
        <span className="max-w-48 text-right text-[10px] leading-tight text-zinc-500">
          {hint}
        </span>
      ) : null}
    </div>
  );
}
