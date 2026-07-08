import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { claveValida } from "@/lib/panel-auth";

// Lista los pedidos activos para el panel (el navegador consulta cada pocos segundos).
export async function GET(req: NextRequest) {
  if (!claveValida(req)) {
    return NextResponse.json({ error: "clave inválida" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const campos =
    "id, numero_corto, estado, metodo_pago, paga_con, cambio, lat, lng, total, creado_at, clientes(nombre, telefono), pedido_items(nombre_platillo, cantidad, precio_unit, notas)";

  const consultar = (extra: string) =>
    db
      .from("pedidos")
      .select(campos + extra)
      .in("estado", ["pendiente", "aceptado", "preparando", "listo", "en_reparto"])
      .order("creado_at", { ascending: true });

  // Campos que dependen de migraciones; si alguna no se ha corrido todavía,
  // se reintenta con menos campos para no tumbar el panel.
  let { data, error } = await consultar(
    ", repa_lat, repa_lng, repa_actualizado_at, pago_confirmado, comprobante_url"
  );
  if (error?.message.includes("pago_confirmado") || error?.message.includes("comprobante_url")) {
    ({ data, error } = await consultar(", repa_lat, repa_lng, repa_actualizado_at"));
  }
  if (error?.message.includes("repa_lat")) {
    ({ data, error } = await consultar(""));
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ pedidos: data });
}
