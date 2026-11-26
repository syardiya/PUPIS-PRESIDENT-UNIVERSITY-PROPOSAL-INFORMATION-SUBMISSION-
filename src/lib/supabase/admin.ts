import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { normalizeEnvValue, normalizeSupabaseUrl } from "./url";

/**
 * Server-only Supabase Service Role client.
 * Bypasses RLS — use strictly in trusted server-side flows after verifying
 * caller identity and authorization via `src/lib/auth/guard.ts`.
 */
export function createAdminClient(): SupabaseClient<Database> {
  const supabaseUrl = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = normalizeEnvValue(
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing or invalid NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables."
    );
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
