import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

let _client: SupabaseClient | null = null;

/**
 * Lazy Supabase-Admin-Client. Erst beim ersten Zugriff erzeugt, damit
 * Importe (und ein statischer Build ohne Envs) nicht an der Modul-Ladung scheitern.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (!env.supabaseUrl || !env.supabaseServiceKey) {
    throw new Error(
      "Supabase ist nicht konfiguriert (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)."
    );
  }
  if (!_client) {
    _client = createClient(env.supabaseUrl, env.supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return _client;
}
