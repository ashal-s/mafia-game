import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type RateLimitPolicy = {
  action:
    | "game_create"
    | "game_join"
    | "host_control"
    | "role_action"
    | "vote_change";
  scope?: string;
};

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number; message: string };

/**
 * Consumes one server-side rate-limit attempt for the authenticated user.
 * The database function performs the increment atomically, so limits work
 * across server instances rather than only within one Next.js process.
 */
export async function consumeRateLimit(
  supabase: SupabaseClient,
  policy: RateLimitPolicy,
): Promise<RateLimitResult> {
  const { data, error } = await supabase.rpc("consume_rate_limit", {
    p_action: policy.action,
    p_scope: policy.scope ?? "global",
  });

  // Fail closed: a broken limiter must not silently remove abuse protection.
  if (error || !data?.length) {
    return {
      allowed: false,
      retryAfterSeconds: 1,
      message: "This action is temporarily unavailable. Please try again.",
    };
  }

  const result = data[0];
  if (result.allowed) return { allowed: true };

  const retryAfterSeconds = Math.max(1, result.retry_after_seconds);
  return {
    allowed: false,
    retryAfterSeconds,
    message: `You're doing that too quickly. Try again in ${retryAfterSeconds} second${retryAfterSeconds === 1 ? "" : "s"}.`,
  };
}
