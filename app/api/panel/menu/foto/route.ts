import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { claveValida } from "@/lib/panel-auth";

// Sube la foto de un platillo a Supabase Storage (bucket público "fotos")
// y guarda la URL en el platillo. El bot la manda cuando el cliente lo elige.
export async function POST(req: NextRequest) {
  if (!claveValida(req)) return NextResponse.json({ error: "clave inválida" }, { status: 401 });

  const form = await req.formData();
  const archivo = form.get("archivo");
  const platilloId = form.get("platillo_id");
  if (!(archivo instanceof File) || typeof platilloId !== "string") {
    return NextResponse.json({ error: "faltan datos" }, { status: 400 });
  }
  if (archivo.size > 4 * 1024 * 1024) {
    return NextResponse.json({ error: "la foto pesa más de 4 MB" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const ruta = `platillos/${platilloId}.jpg`;
  const bytes = Buffer.from(await archivo.arrayBuffer());

  const { error: errSubida } = await db.storage
    .from("fotos")
    .upload(ruta, bytes, { contentType: "image/jpeg", upsert: true });
  if (errSubida) return NextResponse.json({ error: errSubida.message }, { status: 500 });

  // URL pública + marca de tiempo para que WhatsApp no use una versión vieja en caché
  const { data: pub } = db.storage.from("fotos").getPublicUrl(ruta);
  const url = `${pub.publicUrl}?v=${Date.now()}`;

  const { error: errUpdate } = await db
    .from("platillos")
    .update({ foto_url: url })
    .eq("id", platilloId);
  if (errUpdate) return NextResponse.json({ error: errUpdate.message }, { status: 500 });

  return NextResponse.json({ ok: true, foto_url: url });
}

// Quitar la foto de un platillo
export async function DELETE(req: NextRequest) {
  if (!claveValida(req)) return NextResponse.json({ error: "clave inválida" }, { status: 401 });

  const platilloId = req.nextUrl.searchParams.get("platillo_id");
  if (!platilloId) return NextResponse.json({ error: "falta platillo_id" }, { status: 400 });

  const db = supabaseAdmin();
  await db.storage.from("fotos").remove([`platillos/${platilloId}.jpg`]);
  const { error } = await db.from("platillos").update({ foto_url: null }).eq("id", platilloId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
