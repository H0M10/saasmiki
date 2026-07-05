import { NextRequest, NextResponse } from "next/server";
import { enviarTexto } from "@/lib/whatsapp";

// GET: verificación del webhook. Meta llama esta URL una sola vez
// (cuando das "Verificar y guardar" en el panel) con un reto que hay
// que devolver tal cual si el verify token coincide.
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const modo = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const reto = params.get("hub.challenge");

  if (modo === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(reto, { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

// POST: aquí llegan los mensajes de los clientes.
// Por ahora responde un eco para comprobar que todo el circuito funciona;
// en la Fase 2 esto se reemplaza por la máquina de estados del pedido.
export async function POST(req: NextRequest) {
  const body = await req.json();

  const mensaje = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (mensaje) {
    const de = mensaje.from as string; // teléfono del cliente
    const texto = mensaje.text?.body ?? "(mensaje no de texto)";
    await enviarTexto(de, `✅ Bot conectado. Recibí: "${texto}"`);
  }

  // Siempre responder 200 rápido: si no, Meta reintenta y desactiva el webhook.
  return NextResponse.json({ ok: true });
}
