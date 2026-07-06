import { NextRequest, NextResponse } from "next/server";
import { procesarMensaje, MensajeEntrante } from "@/lib/bot";
import { env } from "@/lib/env";

// GET: verificación del webhook. Meta llama esta URL una sola vez
// (cuando das "Verificar y guardar" en el panel) con un reto que hay
// que devolver tal cual si el verify token coincide.
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const modo = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const reto = params.get("hub.challenge");

  if (modo === "subscribe" && token === env("WHATSAPP_VERIFY_TOKEN")) {
    return new NextResponse(reto, { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

// POST: aquí llegan los mensajes de los clientes (y también callbacks de
// estado tipo "entregado/leído", que ignoramos).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const msg = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (msg) {
      const entrante: MensajeEntrante = {
        de: msg.from,
        texto: msg.text?.body ?? null,
        opcionId:
          msg.interactive?.list_reply?.id ??
          msg.interactive?.button_reply?.id ??
          null,
        ubicacion: msg.location
          ? { lat: msg.location.latitude, lng: msg.location.longitude }
          : null,
      };
      await procesarMensaje(entrante);
    }
  } catch (err) {
    // Nunca dejar que un error tumbe la respuesta: si Meta no recibe 200,
    // reintenta en bucle y puede desactivar el webhook.
    console.error("Error procesando webhook:", err);
  }
  return NextResponse.json({ ok: true });
}
