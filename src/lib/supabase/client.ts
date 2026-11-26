import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { normalizeEnvValue, normalizeSupabaseUrl } from "./url";

export function createClient(): SupabaseClient<Database> {
  // Static `process.env.NEXT_PUBLIC_*` reads are required so Next.js inlines them in client bundles
  const supabaseUrl = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseAnonKey = normalizeEnvValue(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing or invalid NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables."
    );
  }

  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
}
