import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { claveValida } from "@/lib/panel-auth";

// CRUD del menú. El bot lee estas mismas tablas, así que cualquier cambio
// aquí se refleja en WhatsApp al instante.

export async function GET(req: NextRequest) {
  if (!claveValida(req)) return NextResponse.json({ error: "clave inválida" }, { status: 401 });

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("categorias")
    .select("id, nombre, orden, activa, platillos(id, nombre, descripcion, precio, disponible, orden, foto_url)")
    .order("orden")
    .order("orden", { referencedTable: "platillos" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ categorias: data });
}

// Crear categoría o platillo
export async function POST(req: NextRequest) {
  if (!claveValida(req)) return NextResponse.json({ error: "clave inválida" }, { status: 401 });

  const db = supabaseAdmin();
  const body = await req.json();

  if (body.tipo === "categoria") {
    const { data, error } = await db
      .from("categorias")
      .insert({ nombre: body.nombre, orden: body.orden ?? 99 })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, categoria: data });
  }

  if (body.tipo === "platillo") {
    const { data, error } = await db
      .from("platillos")
      .insert({
        categoria_id: body.categoria_id,
        nombre: body.nombre,
        descripcion: body.descripcion ?? null,
        precio: body.precio,
        orden: body.orden ?? 99,
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, platillo: data });
  }

  return NextResponse.json({ error: "tipo desconocido" }, { status: 400 });
}

// Editar categoría o platillo (nombre, precio, disponible, etc.)
export async function PATCH(req: NextRequest) {
  if (!claveValida(req)) return NextResponse.json({ error: "clave inválida" }, { status: 401 });

  const db = supabaseAdmin();
  const { tipo, id, cambios } = await req.json();
  const tabla = tipo === "categoria" ? "categorias" : tipo === "platillo" ? "platillos" : null;
  if (!tabla || !id) return NextResponse.json({ error: "tipo o id inválido" }, { status: 400 });

  // Solo se permiten campos editables conocidos
  const permitidos =
    tipo === "categoria"
      ? ["nombre", "orden", "activa"]
      : ["nombre", "descripcion", "precio", "disponible", "orden", "categoria_id"];
  const filtrados = Object.fromEntries(
    Object.entries(cambios ?? {}).filter(([k]) => permitidos.includes(k))
  );
  if (Object.keys(filtrados).length === 0) {
    return NextResponse.json({ error: "sin cambios válidos" }, { status: 400 });
  }

  const { error } = await db.from(tabla).update(filtrados).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// Borrar categoría (con sus platillos) o platillo
export async function DELETE(req: NextRequest) {
  if (!claveValida(req)) return NextResponse.json({ error: "clave inválida" }, { status: 401 });

  const db = supabaseAdmin();
  const tipo = req.nextUrl.searchParams.get("tipo");
  const id = req.nextUrl.searchParams.get("id");
  const tabla = tipo === "categoria" ? "categorias" : tipo === "platillo" ? "platillos" : null;
  if (!tabla || !id) return NextResponse.json({ error: "tipo o id inválido" }, { status: 400 });

  const { error } = await db.from(tabla).delete().eq("id", id);
  if (error) {
    // Un platillo con pedidos históricos no se puede borrar (integridad);
    // en ese caso se desactiva para que deje de aparecer en el bot.
    if (tipo === "platillo") {
      const { error: e2 } = await db.from("platillos").update({ disponible: false }).eq("id", id);
      if (!e2) {
        return NextResponse.json({
          ok: true,
          aviso: "Tiene pedidos históricos: se marcó como agotado en lugar de borrarse.",
        });
      }
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
