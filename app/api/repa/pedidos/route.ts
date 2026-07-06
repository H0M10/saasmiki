import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { claveRepaValida } from "@/lib/panel-auth";

// Pedidos que le interesan al repartidor: listos para recoger y en reparto.
export async function GET(req: NextRequest) {
  if (!claveRepaValida(req)) return NextResponse.json({ error: "clave inválida" }, { status: 401 });

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("pedidos")
    .select(
      "id, numero_corto, estado, metodo_pago, paga_con, cambio, lat, lng, total, listo_at, clientes(nombre, telefono), pedido_items(nombre_platillo, cantidad)"
    )
    .in("estado", ["listo", "en_reparto"])
    .order("listo_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ pedidos: data });
}
