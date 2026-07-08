import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { claveValida } from "@/lib/panel-auth";

// Métricas del negocio calculadas sobre los pedidos del rango pedido
// (?dias=7 o ?dias=30). Los importes solo cuentan pedidos ENTREGADOS.

const TZ = "America/Mexico_City";

function fechaLocal(iso: string): string {
  // YYYY-MM-DD en hora de México
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
}

function horaLocal(iso: string): number {
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", hour12: false }).format(
      new Date(iso)
    )
  );
}

function distanciaKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const promedioMin = (pares: [string | null, string | null][]) => {
  const mins = pares
    .filter(([a, b]) => a && b)
    .map(([a, b]) => (new Date(b!).getTime() - new Date(a!).getTime()) / 60000)
    .filter((m) => m >= 0 && m < 24 * 60);
  return mins.length ? Math.round((mins.reduce((s, m) => s + m, 0) / mins.length) * 10) / 10 : null;
};

export async function GET(req: NextRequest) {
  if (!claveValida(req)) return NextResponse.json({ error: "clave inválida" }, { status: 401 });

  const dias = Math.min(90, Math.max(1, Number(req.nextUrl.searchParams.get("dias")) || 7));
  const desde = new Date(Date.now() - dias * 86400000).toISOString();
  const db = supabaseAdmin();

  const [{ data: pedidos, error: e1 }, { data: ajustes }] = await Promise.all([
    db
      .from("pedidos")
      .select(
        "id, estado, total, metodo_pago, creado_at, aceptado_at, listo_at, en_reparto_at, entregado_at, lat, lng, cliente_id"
      )
      .gte("creado_at", desde),
    db.from("ajustes").select("centro_lat, centro_lng, radio_km").single(),
  ]);
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });

  const todos = pedidos ?? [];
  const validos = todos.filter((p) => !["rechazado", "cancelado"].includes(p.estado));
  const entregados = todos.filter((p) => p.estado === "entregado");

  // Items de esos pedidos (para el top de platillos)
  const ids = validos.map((p) => p.id);
  const { data: items } = ids.length
    ? await db
        .from("pedido_items")
        .select("nombre_platillo, cantidad, precio_unit, pedido_id")
        .in("pedido_id", ids)
    : { data: [] };

  // --- Ventas por día (se rellenan los días sin ventas) ---
  const porDia = new Map<string, { pedidos: number; ingresos: number }>();
  for (let i = dias - 1; i >= 0; i--) {
    const f = fechaLocal(new Date(Date.now() - i * 86400000).toISOString());
    porDia.set(f, { pedidos: 0, ingresos: 0 });
  }
  for (const p of validos) {
    const f = fechaLocal(p.creado_at);
    const d = porDia.get(f);
    if (d) d.pedidos++;
  }
  for (const p of entregados) {
    const f = fechaLocal(p.creado_at);
    const d = porDia.get(f);
    if (d) d.ingresos += Number(p.total);
  }

  // --- Pedidos por hora ---
  const porHora = Array.from({ length: 24 }, () => 0);
  for (const p of validos) porHora[horaLocal(p.creado_at)]++;

  // --- Top platillos ---
  const top = new Map<string, { cantidad: number; ingreso: number }>();
  for (const i of items ?? []) {
    const t = top.get(i.nombre_platillo) ?? { cantidad: 0, ingreso: 0 };
    t.cantidad += i.cantidad;
    t.ingreso += i.cantidad * Number(i.precio_unit);
    top.set(i.nombre_platillo, t);
  }
  const topPlatillos = [...top.entries()]
    .map(([nombre, t]) => ({ nombre, ...t }))
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, 8);

  // --- Métodos de pago ---
  const pagos = { efectivo: 0, tarjeta: 0, transferencia: 0 };
  for (const p of validos) pagos[p.metodo_pago as keyof typeof pagos]++;

  // --- Zonas por distancia al centro ---
  let zonas: { etiqueta: string; pedidos: number }[] | null = null;
  if (ajustes?.centro_lat != null && ajustes?.centro_lng != null) {
    const cubetas = [0, 0, 0, 0]; // 0-1, 1-2, 2-3, 3+
    for (const p of validos) {
      if (p.lat == null || p.lng == null) continue;
      const d = distanciaKm(ajustes.centro_lat, ajustes.centro_lng, p.lat, p.lng);
      cubetas[d < 1 ? 0 : d < 2 ? 1 : d < 3 ? 2 : 3]++;
    }
    zonas = [
      { etiqueta: "0–1 km", pedidos: cubetas[0] },
      { etiqueta: "1–2 km", pedidos: cubetas[1] },
      { etiqueta: "2–3 km", pedidos: cubetas[2] },
      { etiqueta: "+3 km", pedidos: cubetas[3] },
    ];
  }

  // --- Clientes ---
  const porCliente = new Map<string, number>();
  for (const p of validos) porCliente.set(p.cliente_id, (porCliente.get(p.cliente_id) ?? 0) + 1);
  const clientesUnicos = porCliente.size;
  const recurrentes = [...porCliente.values()].filter((n) => n > 1).length;

  const ingresos = entregados.reduce((s, p) => s + Number(p.total), 0);

  return NextResponse.json({
    dias,
    resumen: {
      pedidos: validos.length,
      entregados: entregados.length,
      rechazados: todos.length - validos.length,
      ingresos,
      ticketPromedio: entregados.length ? Math.round((ingresos / entregados.length) * 100) / 100 : 0,
      clientesUnicos,
      recurrentes,
      minCocina: promedioMin(entregados.map((p) => [p.aceptado_at, p.listo_at])),
      minEntrega: promedioMin(entregados.map((p) => [p.en_reparto_at, p.entregado_at])),
    },
    ventasPorDia: [...porDia.entries()].map(([fecha, v]) => ({ fecha, ...v })),
    porHora,
    topPlatillos,
    pagos,
    zonas,
  });
}
