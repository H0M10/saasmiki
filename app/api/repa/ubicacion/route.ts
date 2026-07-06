import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { claveRepaValida } from "@/lib/panel-auth";

// El teléfono del repartidor manda su posición cada pocos segundos mientras
// tiene pedidos en reparto; el panel la muestra en un link de mapa.
export async function POST(req: NextRequest) {
  if (!claveRepaValida(req)) return NextResponse.json({ error: "clave inválida" }, { status: 401 });

  const { pedido_ids, lat, lng } = await req.json();
  if (!Array.isArray(pedido_ids) || pedido_ids.length === 0 || lat == null || lng == null) {
    return NextResponse.json({ error: "faltan datos" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { error } = await db
    .from("pedidos")
    .update({ repa_lat: lat, repa_lng: lng, repa_actualizado_at: new Date().toISOString() })
    .in("id", pedido_ids.slice(0, 20))
    .eq("estado", "en_reparto");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
