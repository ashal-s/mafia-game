import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";
import { requireSupabaseEnv } from "@/lib/supabase/env";

/**
 * Supabase client for use in Client Components (runs in the browser).
 * `createBrowserClient` is a singleton, so it's safe to call this repeatedly.
 */
export function createClient() {
  const { url, anonKey } = requireSupabaseEnv();
  return createBrowserClient<Database>(url, anonKey);
}
