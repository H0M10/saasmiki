import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { claveValida, claveRepaValida } from "@/lib/panel-auth";
import { enviarTexto } from "@/lib/whatsapp";

// Acciones que puede ejecutar la clave del repartidor
const ACCIONES_REPA = ["reparto", "entregado"];

// Transiciones de estado permitidas: qué acción aplica desde qué estados,
// a cuál pasa y qué timestamp registra (para los KPIs de tiempos).
const TRANSICIONES: Record<
  string,
  { desde: string[]; a: string; marca: string | null }
> = {
  aceptar: { desde: ["pendiente"], a: "aceptado", marca: "aceptado_at" },
  rechazar: { desde: ["pendiente"], a: "rechazado", marca: null },
  preparando: { desde: ["aceptado"], a: "preparando", marca: "preparando_at" },
  listo: { desde: ["aceptado", "preparando"], a: "listo", marca: "listo_at" },
  reparto: { desde: ["listo"], a: "en_reparto", marca: "en_reparto_at" },
  entregado: { desde: ["en_reparto"], a: "entregado", marca: "entregado_at" },
  cancelar: {
    desde: ["aceptado", "preparando", "listo"],
    a: "cancelado",
    marca: null,
  },
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { accion, motivo } = await req.json();

  const esAdmin = claveValida(req);
  const esRepa = claveRepaValida(req) && ACCIONES_REPA.includes(accion);
  if (!esAdmin && !esRepa) {
    return NextResponse.json({ error: "clave inválida" }, { status: 401 });
  }

  const t = TRANSICIONES[accion];
  if (!t) {
    return NextResponse.json({ error: `acción desconocida: ${accion}` }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: pedido, error: errPedido } = await db
    .from("pedidos")
    .select("id, estado, numero_corto, total, clientes(nombre, telefono)")
    .eq("id", id)
    .single();
  if (errPedido || !pedido) {
    return NextResponse.json({ error: "pedido no encontrado" }, { status: 404 });
  }
  if (!t.desde.includes(pedido.estado)) {
    return NextResponse.json(
      { error: `no se puede "${accion}" un pedido en estado "${pedido.estado}"` },
      { status: 409 }
    );
  }

  // Armar los cambios
  const cambios: Record<string, unknown> = { estado: t.a };
  if (t.marca) cambios[t.marca] = new Date().toISOString();
  if (accion === "rechazar" || accion === "cancelar") {
    cambios.motivo_rechazo = motivo ?? null;
  }

  // Al aceptar se asigna el número corto del día (0001, 0002, ...)
  let numeroCorto = pedido.numero_corto;
  if (accion === "aceptar") {
    const { data: n, error: errNum } = await db.rpc("siguiente_numero_corto");
    if (errNum) {
      return NextResponse.json({ error: `número corto: ${errNum.message}` }, { status: 500 });
    }
    numeroCorto = n;
    cambios.numero_corto = n;
  }

  const { error: errUpdate } = await db.from("pedidos").update(cambios).eq("id", id);
  if (errUpdate) {
    return NextResponse.json({ error: errUpdate.message }, { status: 500 });
  }

  // Avisar al cliente por WhatsApp (si falla el aviso, la transición no se revierte)
  const cliente = pedido.clientes as unknown as { nombre: string | null; telefono: string } | null;
  if (cliente?.telefono) {
    const nombre = cliente.nombre ?? "";
    const num = numeroCorto ? `#${numeroCorto}` : "";
    const avisos: Record<string, string> = {
      aceptar: `✅ ¡Pedido aceptado, ${nombre}! Tu número de pedido es *${num}*.\n\nYa lo estamos preparando, te avisamos cuando vaya en camino 🍳`,
      rechazar: `😔 Lo sentimos, no pudimos tomar tu pedido${motivo ? `:\n${motivo}` : "."}`,
      reparto: `🛵 ¡Tu pedido ${num} va en camino!${cliente.nombre ? ` Prepara el pago si es efectivo 😉` : ""}`,
      entregado: `🎉 Pedido ${num} entregado. ¡Buen provecho, ${nombre}! Gracias por tu compra 🙌`,
      cancelar: `Tu pedido ${num} fue cancelado${motivo ? `:\n${motivo}` : "."} Una disculpa 🙏`,
    };
    const aviso = avisos[accion];
    if (aviso) {
      try {
        await enviarTexto(cliente.telefono, aviso);
      } catch (e) {
        console.error("No se pudo avisar al cliente:", e);
      }
    }
  }

  return NextResponse.json({ ok: true, estado: t.a, numero_corto: numeroCorto });
}
