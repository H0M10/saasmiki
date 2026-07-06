// Máquina de estados de la conversación del bot de pedidos.
// Cada cliente tiene una fila en `sesiones_bot` que guarda en qué paso va,
// su carrito y sus datos; este módulo decide qué responder a cada mensaje.

import { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "./supabase";
import { enviarTexto, enviarBotones, enviarLista } from "./whatsapp";

// ---------- Tipos ----------

export type MensajeEntrante = {
  de: string; // teléfono del cliente (E.164 sin +)
  texto: string | null; // mensaje de texto plano
  opcionId: string | null; // id de la opción tocada (lista o botón)
  ubicacion: { lat: number; lng: number } | null;
};

type ItemCarrito = {
  platillo_id: string;
  nombre: string;
  precio: number;
  cantidad: number;
  notas: string | null;
};

type DatosSesion = {
  platillo?: { id: string; nombre: string; precio: number };
  cantidad?: number;
  nombre?: string;
  metodo_pago?: "efectivo" | "tarjeta" | "transferencia";
  paga_con?: number;
  lat?: number;
  lng?: number;
};

type Sesion = {
  telefono: string;
  paso: string;
  carrito: ItemCarrito[];
  datos: DatosSesion;
  updated_at: string;
};

const SESION_EXPIRA_HORAS = 6;

// ---------- Entrada principal ----------

export async function procesarMensaje(m: MensajeEntrante) {
  const db = supabaseAdmin();

  const { data: ajustes, error: errAjustes } = await db.from("ajustes").select("*").single();
  if (errAjustes || !ajustes) {
    throw new Error(`leyendo ajustes: ${errAjustes?.message ?? "fila inexistente"}`);
  }

  // "cancelar" reinicia la conversación en cualquier punto
  if (m.texto && m.texto.trim().toLowerCase() === "cancelar") {
    await borrarSesion(db, m.de);
    await enviarTexto(m.de, "Tu pedido fue cancelado. Escríbenos cuando quieras ordenar de nuevo 👋");
    return;
  }

  let sesion = await obtenerSesion(db, m.de);

  // Sesión vieja: se descarta y empieza de cero
  if (sesion && horasDesde(sesion.updated_at) > SESION_EXPIRA_HORAS) {
    await borrarSesion(db, m.de);
    sesion = null;
  }

  // Conversación nueva
  if (!sesion) {
    if (estaCerrado(ajustes)) {
      await enviarTexto(m.de, `${ajustes.mensaje_cerrado}${textoHorarios(ajustes)}`);
      return;
    }
    const { error: errSesion } = await db
      .from("sesiones_bot")
      .insert({ telefono: m.de, paso: "categoria" });
    if (errSesion) throw new Error(`creando sesión: ${errSesion.message}`);
    await enviarTexto(m.de, ajustes.mensaje_bienvenida);
    await enviarMenuCategorias(db, m.de);
    return;
  }

  switch (sesion.paso) {
    case "categoria":
      await pasoCategoria(db, m, sesion);
      break;
    case "platillo":
      await pasoPlatillo(db, m, sesion);
      break;
    case "cantidad":
      await pasoCantidad(db, m, sesion);
      break;
    case "nota":
      await pasoNota(db, m, sesion);
      break;
    case "algomas":
      await pasoAlgoMas(db, m, sesion);
      break;
    case "nombre":
      await pasoNombre(db, m, sesion);
      break;
    case "pago":
      await pasoPago(db, m, sesion, ajustes);
      break;
    case "pagacon":
      await pasoPagaCon(db, m, sesion);
      break;
    case "ubicacion":
      await pasoUbicacion(db, m, sesion, ajustes);
      break;
    case "confirmar":
      await pasoConfirmar(db, m, sesion);
      break;
    default:
      // Paso desconocido: reiniciar
      await borrarSesion(db, m.de);
      await enviarTexto(m.de, "Empecemos de nuevo 🙂");
      await db.from("sesiones_bot").insert({ telefono: m.de, paso: "categoria" });
      await enviarMenuCategorias(db, m.de);
  }
}

// ---------- Pasos de la conversación ----------

async function pasoCategoria(db: SupabaseClient, m: MensajeEntrante, s: Sesion) {
  if (m.opcionId?.startsWith("cat:")) {
    const catId = m.opcionId.slice(4);
    const hubo = await enviarPlatillosDeCategoria(db, m.de, catId);
    if (hubo) await actualizarSesion(db, s.telefono, { paso: "platillo" });
    return;
  }
  await enviarTexto(m.de, "Elige una categoría del menú 👇 (o escribe *cancelar* para salir)");
  await enviarMenuCategorias(db, m.de);
}

async function pasoPlatillo(db: SupabaseClient, m: MensajeEntrante, s: Sesion) {
  if (m.opcionId === "volver") {
    await actualizarSesion(db, s.telefono, { paso: "categoria" });
    await enviarMenuCategorias(db, m.de);
    return;
  }
  if (m.opcionId?.startsWith("plat:")) {
    const platId = m.opcionId.slice(5);
    const { data: p } = await db
      .from("platillos")
      .select("id, nombre, precio")
      .eq("id", platId)
      .single();
    if (!p) {
      await enviarTexto(m.de, "Ese platillo ya no está disponible 😔 Elige otro:");
      await enviarMenuCategorias(db, m.de);
      await actualizarSesion(db, s.telefono, { paso: "categoria" });
      return;
    }
    await actualizarSesion(db, s.telefono, {
      paso: "cantidad",
      datos: { ...s.datos, platillo: { id: p.id, nombre: p.nombre, precio: Number(p.precio) } },
    });
    await enviarBotones(m.de, `*${p.nombre}* — $${Number(p.precio).toFixed(2)}\n\n¿Cuántos quieres?`, [
      { id: "cant:1", titulo: "1" },
      { id: "cant:2", titulo: "2" },
      { id: "cant:3", titulo: "3" },
    ]);
    await enviarTexto(m.de, "(o escribe la cantidad, ej. *5*)");
    return;
  }
  await enviarTexto(m.de, "Elige un platillo de la lista 👇");
}

async function pasoCantidad(db: SupabaseClient, m: MensajeEntrante, s: Sesion) {
  let cantidad: number | null = null;
  if (m.opcionId?.startsWith("cant:")) cantidad = parseInt(m.opcionId.slice(5), 10);
  else if (m.texto) {
    const n = parseInt(m.texto.trim(), 10);
    if (!isNaN(n)) cantidad = n;
  }
  if (!cantidad || cantidad < 1 || cantidad > 50) {
    await enviarTexto(m.de, "No entendí la cantidad 🤔 Escribe un número, ej. *2*");
    return;
  }
  await actualizarSesion(db, s.telefono, {
    paso: "nota",
    datos: { ...s.datos, cantidad },
  });
  await enviarBotones(
    m.de,
    "¿Le quitamos algo? (cebolla, chile, etc.)\n\nEscribe qué le quitamos, ej. *sin cebolla* — o toca el botón:",
    [{ id: "nota:no", titulo: "Así está bien ✅" }]
  );
}

async function pasoNota(db: SupabaseClient, m: MensajeEntrante, s: Sesion) {
  let notas: string | null = null;
  if (m.opcionId === "nota:no") notas = null;
  else if (m.texto) notas = m.texto.trim().slice(0, 200);
  else {
    await enviarTexto(m.de, "Escribe qué le quitamos, o toca *Así está bien* 👆");
    return;
  }

  const p = s.datos.platillo;
  const cantidad = s.datos.cantidad ?? 1;
  if (!p) {
    await reiniciar(db, m.de);
    return;
  }

  const carrito: ItemCarrito[] = [
    ...s.carrito,
    { platillo_id: p.id, nombre: p.nombre, precio: p.precio, cantidad, notas },
  ];
  const total = totalDe(carrito);

  await actualizarSesion(db, s.telefono, {
    paso: "algomas",
    carrito,
    datos: { ...s.datos, platillo: undefined, cantidad: undefined },
  });

  await enviarBotones(
    m.de,
    `Agregado: ${cantidad}x ${p.nombre}${notas ? ` (${notas})` : ""} ✅\n\n${resumenCarrito(carrito)}\n\n*Total: $${total.toFixed(2)}*\n\n¿Algo más?`,
    [
      { id: "mas", titulo: "➕ Pedir más" },
      { id: "fin", titulo: "✅ Finalizar pedido" },
    ]
  );
}

async function pasoAlgoMas(db: SupabaseClient, m: MensajeEntrante, s: Sesion) {
  if (m.opcionId === "mas") {
    await actualizarSesion(db, s.telefono, { paso: "categoria" });
    await enviarMenuCategorias(db, m.de);
    return;
  }
  if (m.opcionId === "fin") {
    if (s.carrito.length === 0) {
      await actualizarSesion(db, s.telefono, { paso: "categoria" });
      await enviarTexto(m.de, "Tu carrito está vacío. Elige algo del menú 👇");
      await enviarMenuCategorias(db, m.de);
      return;
    }
    // Si ya conocemos al cliente, saltamos la pregunta del nombre
    const { data: cliente } = await db
      .from("clientes")
      .select("nombre")
      .eq("telefono", s.telefono)
      .maybeSingle();
    if (cliente?.nombre) {
      await actualizarSesion(db, s.telefono, {
        paso: "pago",
        datos: { ...s.datos, nombre: cliente.nombre },
      });
      await preguntarPago(m.de, cliente.nombre);
    } else {
      await actualizarSesion(db, s.telefono, { paso: "nombre" });
      await enviarTexto(m.de, "¿A nombre de quién va el pedido? 📝");
    }
    return;
  }
  await enviarTexto(m.de, "Toca *Pedir más* o *Finalizar pedido* 👆");
}

async function pasoNombre(db: SupabaseClient, m: MensajeEntrante, s: Sesion) {
  const nombre = m.texto?.trim();
  if (!nombre || nombre.length < 2) {
    await enviarTexto(m.de, "Escríbenos tu nombre, porfa 🙂");
    return;
  }
  await actualizarSesion(db, s.telefono, {
    paso: "pago",
    datos: { ...s.datos, nombre: nombre.slice(0, 80) },
  });
  await preguntarPago(m.de, nombre);
}

async function preguntarPago(a: string, nombre: string) {
  await enviarBotones(a, `¡Gracias, ${nombre}! 🙌\n\n¿Cómo vas a pagar?`, [
    { id: "pago:efectivo", titulo: "💵 Efectivo" },
    { id: "pago:tarjeta", titulo: "💳 Tarjeta" },
    { id: "pago:transferencia", titulo: "🏦 Transferencia" },
  ]);
}

async function pasoPago(
  db: SupabaseClient,
  m: MensajeEntrante,
  s: Sesion,
  ajustes: { datos_transferencia: string | null }
) {
  if (!m.opcionId?.startsWith("pago:")) {
    await enviarTexto(m.de, "Toca una de las opciones de pago 👆");
    return;
  }
  const metodo = m.opcionId.slice(5) as DatosSesion["metodo_pago"];
  const total = totalDe(s.carrito);

  if (metodo === "efectivo") {
    await actualizarSesion(db, s.telefono, {
      paso: "pagacon",
      datos: { ...s.datos, metodo_pago: metodo },
    });
    await enviarTexto(
      m.de,
      `Tu total es *$${total.toFixed(2)}* 💵\n\n¿Con cuánto vas a pagar? (para llevarte el cambio exacto)`
    );
    return;
  }

  await actualizarSesion(db, s.telefono, {
    paso: "ubicacion",
    datos: { ...s.datos, metodo_pago: metodo },
  });

  if (metodo === "transferencia" && ajustes.datos_transferencia) {
    await enviarTexto(m.de, `Datos para tu transferencia 🏦\n\n${ajustes.datos_transferencia}`);
  }
  if (metodo === "tarjeta") {
    await enviarTexto(m.de, "Perfecto, el repartidor lleva la terminal 💳");
  }
  await pedirUbicacion(m.de);
}

async function pasoPagaCon(db: SupabaseClient, m: MensajeEntrante, s: Sesion) {
  const total = totalDe(s.carrito);
  const monto = m.texto ? parseFloat(m.texto.replace(/[$,\s]/g, "")) : NaN;
  if (isNaN(monto) || monto <= 0) {
    await enviarTexto(m.de, "No entendí el monto 🤔 Escribe solo el número, ej. *500*");
    return;
  }
  if (monto < total) {
    await enviarTexto(
      m.de,
      `Tu total es $${total.toFixed(2)} y me indicas $${monto.toFixed(2)} — no alcanza 😅 ¿Con cuánto vas a pagar?`
    );
    return;
  }
  await actualizarSesion(db, s.telefono, {
    paso: "ubicacion",
    datos: { ...s.datos, paga_con: monto },
  });
  await pedirUbicacion(m.de);
}

async function pedirUbicacion(a: string) {
  await enviarTexto(
    a,
    "📍 Ahora comparte tu ubicación para la entrega:\n\nToca el clip 📎 (o el +) → *Ubicación* → *Enviar tu ubicación actual*"
  );
}

async function pasoUbicacion(
  db: SupabaseClient,
  m: MensajeEntrante,
  s: Sesion,
  ajustes: {
    centro_lat: number | null;
    centro_lng: number | null;
    radio_km: number;
    mensaje_fuera_zona: string;
  }
) {
  if (!m.ubicacion) {
    await pedirUbicacion(m.de);
    return;
  }

  // Validar zona de entrega (si está configurado el centro)
  if (ajustes.centro_lat != null && ajustes.centro_lng != null) {
    const dist = distanciaKm(ajustes.centro_lat, ajustes.centro_lng, m.ubicacion.lat, m.ubicacion.lng);
    if (dist > Number(ajustes.radio_km)) {
      await enviarTexto(m.de, ajustes.mensaje_fuera_zona);
      return;
    }
  }

  const datos = { ...s.datos, lat: m.ubicacion.lat, lng: m.ubicacion.lng };
  await actualizarSesion(db, s.telefono, { paso: "confirmar", datos });

  const total = totalDe(s.carrito);
  let pagoTexto = "";
  if (datos.metodo_pago === "efectivo" && datos.paga_con) {
    pagoTexto = `💵 Efectivo — pagas con $${datos.paga_con.toFixed(2)}, cambio: $${(datos.paga_con - total).toFixed(2)}`;
  } else if (datos.metodo_pago === "tarjeta") {
    pagoTexto = "💳 Tarjeta (terminal al entregar)";
  } else {
    pagoTexto = "🏦 Transferencia";
  }

  await enviarBotones(
    m.de,
    `📋 *Resumen de tu pedido*\n\n${resumenCarrito(s.carrito)}\n\n*Total: $${total.toFixed(2)}*\n${pagoTexto}\n👤 ${datos.nombre}\n📍 Ubicación recibida ✅\n\n¿Confirmamos?`,
    [
      { id: "conf:si", titulo: "✅ Confirmar" },
      { id: "conf:no", titulo: "❌ Cancelar" },
    ]
  );
}

async function pasoConfirmar(db: SupabaseClient, m: MensajeEntrante, s: Sesion) {
  if (m.opcionId === "conf:no") {
    await borrarSesion(db, m.de);
    await enviarTexto(m.de, "Pedido cancelado 👍 Escríbenos cuando se te antoje algo.");
    return;
  }
  if (m.opcionId !== "conf:si") {
    await enviarTexto(m.de, "Toca *Confirmar* o *Cancelar* 👆");
    return;
  }

  const d = s.datos;
  const total = totalDe(s.carrito);

  // Cliente: crear o actualizar
  const { data: cliente, error: errCliente } = await db
    .from("clientes")
    .upsert(
      { telefono: s.telefono, nombre: d.nombre, ultima_lat: d.lat, ultima_lng: d.lng },
      { onConflict: "telefono" }
    )
    .select("id")
    .single();
  if (errCliente || !cliente) {
    console.error("Error creando cliente:", errCliente);
    await enviarTexto(m.de, "Ocurrió un error guardando tu pedido 😔 Intenta de nuevo en un momento.");
    return;
  }

  // Pedido
  const { data: pedido, error: errPedido } = await db
    .from("pedidos")
    .insert({
      cliente_id: cliente.id,
      estado: "pendiente",
      metodo_pago: d.metodo_pago,
      paga_con: d.paga_con ?? null,
      cambio: d.metodo_pago === "efectivo" && d.paga_con ? d.paga_con - total : null,
      lat: d.lat,
      lng: d.lng,
      total,
    })
    .select("id")
    .single();
  if (errPedido || !pedido) {
    console.error("Error creando pedido:", errPedido);
    await enviarTexto(m.de, "Ocurrió un error guardando tu pedido 😔 Intenta de nuevo en un momento.");
    return;
  }

  // Items
  const { error: errItems } = await db.from("pedido_items").insert(
    s.carrito.map((i) => ({
      pedido_id: pedido.id,
      platillo_id: i.platillo_id,
      nombre_platillo: i.nombre,
      cantidad: i.cantidad,
      precio_unit: i.precio,
      notas: i.notas,
    }))
  );
  if (errItems) console.error("Error creando items:", errItems);

  await borrarSesion(db, m.de);
  await enviarTexto(
    m.de,
    `🎉 ¡Listo, ${d.nombre}! Tu pedido fue enviado al restaurante.\n\nTe avisamos por aquí en cuanto lo confirmen 🙌`
  );
}

// ---------- Mensajes de menú ----------

async function enviarMenuCategorias(db: SupabaseClient, a: string) {
  const { data: cats } = await db
    .from("categorias")
    .select("id, nombre")
    .eq("activa", true)
    .order("orden");
  if (!cats || cats.length === 0) {
    await enviarTexto(a, "Por el momento no tenemos menú disponible 😔");
    return;
  }
  await enviarLista(a, "¿Qué se te antoja hoy? 🍽️", "Ver menú", [
    {
      titulo: "Categorías",
      filas: cats.slice(0, 10).map((c) => ({ id: `cat:${c.id}`, titulo: c.nombre.slice(0, 24) })),
    },
  ]);
}

async function enviarPlatillosDeCategoria(db: SupabaseClient, a: string, catId: string): Promise<boolean> {
  const { data: plats } = await db
    .from("platillos")
    .select("id, nombre, precio, descripcion")
    .eq("categoria_id", catId)
    .eq("disponible", true)
    .order("orden");
  if (!plats || plats.length === 0) {
    await enviarTexto(a, "Esa categoría no tiene platillos disponibles ahorita 😔 Elige otra:");
    await enviarMenuCategorias(db, a);
    return false;
  }
  const filas = plats.slice(0, 9).map((p) => ({
    id: `plat:${p.id}`,
    titulo: p.nombre.slice(0, 24),
    descripcion: `$${Number(p.precio).toFixed(2)}${p.descripcion ? ` — ${p.descripcion}` : ""}`.slice(0, 72),
  }));
  filas.push({ id: "volver", titulo: "⬅️ Ver categorías", descripcion: "Regresar al menú" });
  await enviarLista(a, "Elige tu platillo 👇", "Ver platillos", [{ titulo: "Platillos", filas }]);
  return true;
}

// ---------- Sesión ----------

async function obtenerSesion(db: SupabaseClient, tel: string): Promise<Sesion | null> {
  const { data } = await db.from("sesiones_bot").select("*").eq("telefono", tel).maybeSingle();
  return (data as Sesion) ?? null;
}

async function actualizarSesion(
  db: SupabaseClient,
  tel: string,
  cambios: { paso?: string; carrito?: ItemCarrito[]; datos?: DatosSesion }
) {
  await db
    .from("sesiones_bot")
    .update({ ...cambios, updated_at: new Date().toISOString() })
    .eq("telefono", tel);
}

async function borrarSesion(db: SupabaseClient, tel: string) {
  await db.from("sesiones_bot").delete().eq("telefono", tel);
}

async function reiniciar(db: SupabaseClient, tel: string) {
  await borrarSesion(db, tel);
  await db.from("sesiones_bot").insert({ telefono: tel, paso: "categoria" });
  await enviarTexto(tel, "Algo salió mal, empecemos de nuevo 🙂");
}

// ---------- Utilidades ----------

function totalDe(carrito: ItemCarrito[]): number {
  return carrito.reduce((sum, i) => sum + i.precio * i.cantidad, 0);
}

function resumenCarrito(carrito: ItemCarrito[]): string {
  return carrito
    .map(
      (i) =>
        `• ${i.cantidad}x ${i.nombre} — $${(i.precio * i.cantidad).toFixed(2)}${i.notas ? `\n   📝 ${i.notas}` : ""}`
    )
    .join("\n");
}

function horasDesde(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 3_600_000;
}

// Distancia entre dos coordenadas (fórmula de Haversine)
function distanciaKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------- Horarios ----------

type Horario = { abre: string; cierra: string } | null;
type Ajustes = { cerrado_manual: boolean; horarios: Record<string, Horario> };

const DIAS = ["dom", "lun", "mar", "mie", "jue", "vie", "sab"];
const NOMBRES_DIA: Record<string, string> = {
  lun: "Lunes",
  mar: "Martes",
  mie: "Miércoles",
  jue: "Jueves",
  vie: "Viernes",
  sab: "Sábado",
  dom: "Domingo",
};

function ahoraEnMexico(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Mexico_City" }));
}

function estaCerrado(a: Ajustes): boolean {
  if (a.cerrado_manual) return true;
  const horarios = a.horarios ?? {};
  if (Object.keys(horarios).length === 0) return false; // sin horarios configurados = siempre abierto

  const ahora = ahoraEnMexico();
  const h = horarios[DIAS[ahora.getDay()]];
  if (!h) return true; // día sin horario = cerrado

  const minutos = ahora.getHours() * 60 + ahora.getMinutes();
  const [aH, aM] = h.abre.split(":").map(Number);
  const [cH, cM] = h.cierra.split(":").map(Number);
  const abre = aH * 60 + aM;
  const cierra = cH * 60 + cM;

  if (cierra > abre) return minutos < abre || minutos >= cierra;
  return minutos >= cierra && minutos < abre; // horario que cruza medianoche
}

function textoHorarios(a: Ajustes): string {
  const horarios = a.horarios ?? {};
  const lineas = ["lun", "mar", "mie", "jue", "vie", "sab", "dom"]
    .map((d) => {
      const h = horarios[d];
      return h ? `${NOMBRES_DIA[d]}: ${h.abre} a ${h.cierra}` : null;
    })
    .filter(Boolean);
  return lineas.length ? `\n\nNuestro horario 🕐\n${lineas.join("\n")}` : "";
}
