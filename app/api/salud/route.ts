import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { env } from "@/lib/env";

// Diagnóstico rápido del despliegue: qué versión corre, qué variables de
// entorno están presentes (solo sí/no — nunca los valores) y si la conexión
// a la base de datos funciona.
export async function GET() {
  let db = "ok";
  try {
    const { error } = await supabaseAdmin().from("ajustes").select("id").single();
    if (error) db = `error: ${error.message}`;
  } catch (e) {
    db = `excepción: ${e instanceof Error ? e.message : String(e)}`;
  }

  return NextResponse.json({
    version: "fase-2-bot",
    db,
    // La URL del proyecto no es secreta (viaja al navegador por el prefijo
    // NEXT_PUBLIC); mostrarla ayuda a detectar errores de pegado en Vercel.
    supabase_url_leida: env("NEXT_PUBLIC_SUPABASE_URL"),
    variables: {
      NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      WHATSAPP_TOKEN: !!process.env.WHATSAPP_TOKEN,
      WHATSAPP_PHONE_NUMBER_ID: !!process.env.WHATSAPP_PHONE_NUMBER_ID,
      WHATSAPP_VERIFY_TOKEN: !!process.env.WHATSAPP_VERIFY_TOKEN,
    },
  });
}
