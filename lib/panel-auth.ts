import { NextRequest } from "next/server";
import { env } from "./env";

// Autenticación simple por clave compartida en el header x-panel-key.
// Dos claves distintas: la del panel (admin/caja/cocina) y la de los
// repartidores (solo puede iniciar viaje, entregar y compartir ubicación).
// Suficiente para arrancar; se puede migrar a Supabase Auth con roles después.

export function claveValida(req: NextRequest): boolean {
  const clave = env("PANEL_PASSWORD");
  return clave.length > 0 && req.headers.get("x-panel-key") === clave;
}

export function claveRepaValida(req: NextRequest): boolean {
  const clave = env("REPA_PASSWORD");
  return clave.length > 0 && req.headers.get("x-panel-key") === clave;
}
