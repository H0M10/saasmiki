import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { claveValida } from "@/lib/panel-auth";

// Ajustes del negocio: horarios, cierre manual, zona y textos del bot.
// El bot los consulta en cada mensaje, así que aplican al instante.

export async function GET(req: NextRequest) {
  if (!claveValida(req)) return NextResponse.json({ error: "clave inválida" }, { status: 401 });

  const db = supabaseAdmin();
  const { data, error } = await db.from("ajustes").select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ajustes: data });
}

export async function PATCH(req: NextRequest) {
  if (!claveValida(req)) return NextResponse.json({ error: "clave inválida" }, { status: 401 });

  const db = supabaseAdmin();
  const cambios = await req.json();

  const permitidos = [
    "cerrado_manual",
    "horarios",
    "centro_lat",
    "centro_lng",
    "radio_km",
    "mensaje_bienvenida",
    "mensaje_cerrado",
    "mensaje_fuera_zona",
    "datos_transferencia",
  ];
  const filtrados = Object.fromEntries(
    Object.entries(cambios ?? {}).filter(([k]) => permitidos.includes(k))
  );
  if (Object.keys(filtrados).length === 0) {
    return NextResponse.json({ error: "sin cambios válidos" }, { status: 400 });
  }

  const { error } = await db.from("ajustes").update(filtrados).eq("id", 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
