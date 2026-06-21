import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for use in Client Components (runs in the browser).
 * `createBrowserClient` is a singleton, so it's safe to call this repeatedly.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
