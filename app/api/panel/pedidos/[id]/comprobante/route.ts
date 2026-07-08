import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { claveValida } from "@/lib/panel-auth";

// Devuelve un link temporal (1 hora) al comprobante de transferencia,
// que vive en un bucket privado.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!claveValida(req)) {
    return NextResponse.json({ error: "clave inválida" }, { status: 401 });
  }
  const { id } = await params;
  const db = supabaseAdmin();

  const { data: pedido } = await db
    .from("pedidos")
    .select("comprobante_url")
    .eq("id", id)
    .single();
  if (!pedido?.comprobante_url) {
    return NextResponse.json({ error: "este pedido no tiene comprobante" }, { status: 404 });
  }

  const { data, error } = await db.storage
    .from("comprobantes")
    .createSignedUrl(pedido.comprobante_url, 3600);
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "no se pudo firmar" }, { status: 500 });
  }
  return NextResponse.json({ url: data.signedUrl });
}
