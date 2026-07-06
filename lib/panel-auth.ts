import { NextRequest } from "next/server";
import { env } from "./env";

// Autenticación simple del panel: una clave compartida (PANEL_PASSWORD en
// las variables de entorno) que el navegador manda en el header x-panel-key.
// Suficiente para arrancar; se puede migrar a Supabase Auth con roles después.
export function claveValida(req: NextRequest): boolean {
  const clave = env("PANEL_PASSWORD");
  return clave.length > 0 && req.headers.get("x-panel-key") === clave;
}
