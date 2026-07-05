import { createClient } from "@supabase/supabase-js";

// Cliente de servidor: usa la service_role key (ignora RLS).
// SOLO importar desde código del servidor (API routes, server components).
export function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
