import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

// Cliente de servidor: usa la service_role key (ignora RLS).
// SOLO importar desde código del servidor (API routes, server components).
export function supabaseAdmin() {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}
