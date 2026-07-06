import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { claveValida } from "@/lib/panel-auth";

// Lista los pedidos activos para el panel (el navegador consulta cada pocos segundos).
export async function GET(req: NextRequest) {
  if (!claveValida(req)) {
    return NextResponse.json({ error: "clave inválida" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("pedidos")
    .select(
      "id, numero_corto, estado, metodo_pago, paga_con, cambio, lat, lng, total, creado_at, clientes(nombre, telefono), pedido_items(nombre_platillo, cantidad, precio_unit, notas)"
    )
    .in("estado", ["pendiente", "aceptado", "preparando", "listo", "en_reparto"])
    .order("creado_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ pedidos: data });
}
