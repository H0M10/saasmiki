// Helpers para enviar mensajes por la WhatsApp Cloud API.

const API_URL = () =>
  `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

async function enviar(payload: object) {
  const res = await fetch(API_URL(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error("Error de WhatsApp API:", err);
  }
  return res;
}

export function enviarTexto(a: string, texto: string) {
  return enviar({
    messaging_product: "whatsapp",
    to: a,
    type: "text",
    text: { body: texto },
  });
}

export function enviarBotones(
  a: string,
  texto: string,
  botones: { id: string; titulo: string }[] // máx 3
) {
  return enviar({
    messaging_product: "whatsapp",
    to: a,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: texto },
      action: {
        buttons: botones.map((b) => ({
          type: "reply",
          reply: { id: b.id, title: b.titulo },
        })),
      },
    },
  });
}

export function enviarLista(
  a: string,
  texto: string,
  tituloBoton: string,
  secciones: {
    titulo: string;
    filas: { id: string; titulo: string; descripcion?: string }[]; // máx 10 por sección
  }[]
) {
  return enviar({
    messaging_product: "whatsapp",
    to: a,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: texto },
      action: {
        button: tituloBoton,
        sections: secciones.map((s) => ({
          title: s.titulo,
          rows: s.filas.map((f) => ({
            id: f.id,
            title: f.titulo,
            description: f.descripcion,
          })),
        })),
      },
    },
  });
}
