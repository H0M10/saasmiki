"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useClave, PantallaClave, dinero } from "@/components/panel-ui";

type Pedido = {
  id: string;
  numero_corto: string | null;
  estado: "listo" | "en_reparto";
  metodo_pago: string;
  paga_con: number | null;
  cambio: number | null;
  lat: number | null;
  lng: number | null;
  total: number;
  clientes: { nombre: string | null; telefono: string } | null;
  pedido_items: { nombre_platillo: string; cantidad: number }[];
};

export default function VistaRepa() {
  const { clave, lista, guardar, salir } = useClave("repa_key");
  const [mala, setMala] = useState(false);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [gps, setGps] = useState<"apagado" | "activo" | "error">("apagado");
  const posicion = useRef<{ lat: number; lng: number } | null>(null);
  const watchId = useRef<number | null>(null);

  const cargar = useCallback(
    async (k: string) => {
      try {
        const res = await fetch("/api/repa/pedidos", { headers: { "x-panel-key": k } });
        if (res.status === 401) {
          salir();
          setMala(true);
          return;
        }
        const j = await res.json();
        setPedidos(j.pedidos ?? []);
      } catch {
        /* reintenta en el siguiente ciclo */
      }
    },
    [salir]
  );

  useEffect(() => {
    if (!clave) return;
    cargar(clave);
    const timer = setInterval(() => cargar(clave), 7000);
    return () => clearInterval(timer);
  }, [clave, cargar]);

  // --- GPS: vigila la posición del teléfono mientras la vista está abierta ---
  useEffect(() => {
    if (!clave) return;
    if (!("geolocation" in navigator)) {
      setGps("error");
      return;
    }
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        posicion.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setGps("activo");
      },
      () => setGps("error"),
      { enableHighAccuracy: true, maximumAge: 10000 }
    );
    return () => {
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    };
  }, [clave]);

  // --- Cada 15 s manda la posición al servidor para los pedidos en reparto ---
  useEffect(() => {
    if (!clave) return;
    const timer = setInterval(() => {
      const p = posicion.current;
      const enReparto = pedidos.filter((x) => x.estado === "en_reparto").map((x) => x.id);
      if (!p || enReparto.length === 0) return;
      fetch("/api/repa/ubicacion", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-panel-key": clave },
        body: JSON.stringify({ pedido_ids: enReparto, lat: p.lat, lng: p.lng }),
      }).catch(() => {});
    }, 15000);
    return () => clearInterval(timer);
  }, [clave, pedidos]);

  async function accionar(p: Pedido, accion: "reparto" | "entregado") {
    if (!clave) return;
    setOcupado(true);
    try {
      const res = await fetch(`/api/panel/pedidos/${p.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-panel-key": clave },
        body: JSON.stringify({ accion }),
      });
      const j = await res.json();
      if (!res.ok) alert(`Error: ${j.error}`);
      await cargar(clave);
    } finally {
      setOcupado(false);
    }
  }

  if (!lista) return null;
  if (!clave) {
    return (
      <PantallaClave
        titulo="Repartidor"
        incorrecta={mala}
        onEntrar={(v) => {
          guardar(v);
          setMala(false);
        }}
      />
    );
  }

  return (
    <main className="min-h-screen p-4 max-w-md mx-auto">
      <header className="flex items-center justify-between mb-4">
        <h1 className="titulo text-2xl font-extrabold text-hueso">
          🛵 Repar<span className="text-fuego">tos</span>
        </h1>
        <div className="flex items-center gap-3">
          <span
            className={`sello text-xs ${
              gps === "activo" ? "text-salsa" : gps === "error" ? "text-chile" : "text-humo"
            }`}
          >
            {gps === "activo" ? "GPS ✓" : gps === "error" ? "GPS ✗" : "GPS…"}
          </span>
          <button className="text-humo text-xs underline" onClick={salir}>
            Salir
          </button>
        </div>
      </header>

      {gps === "error" && (
        <p className="text-chile text-xs mb-3">
          Activa la ubicación del teléfono y dale permiso al navegador para que el restaurante pueda
          ver dónde vas.
        </p>
      )}

      <div className="flex flex-col gap-4">
        {pedidos.length === 0 && (
          <p className="ticket-num text-humo/60 text-sm text-center py-16 border-2 border-dashed border-carbon-3 rounded-xl">
            — no hay entregas pendientes —
          </p>
        )}

        {pedidos.map((p) => (
          <article key={p.id} className="comanda p-4 pt-5 entrar">
            <div className="flex items-baseline justify-between">
              <span className="ticket-num text-3xl font-bold text-tinta">
                #{p.numero_corto ?? "—"}
              </span>
              <span
                className={`sello text-xs ${
                  p.estado === "listo" ? "text-fuego-2" : "text-calle"
                }`}
              >
                {p.estado === "listo" ? "Por recoger" : "En camino"}
              </span>
            </div>
            <p className="titulo text-lg font-bold text-tinta">{p.clientes?.nombre ?? "Cliente"}</p>

            <hr className="corte" />

            <ul className="ticket-num text-sm text-tinta">
              {p.pedido_items.map((i, idx) => (
                <li key={idx}>
                  {i.cantidad}× {i.nombre_platillo}
                </li>
              ))}
            </ul>

            <hr className="corte" />

            {/* lo más importante para el repa: el cobro */}
            <p className="ticket-num text-sm font-bold text-tinta bg-fuego/20 border-l-4 border-fuego px-2 py-1">
              {p.metodo_pago === "efectivo"
                ? `COBRAR ${dinero(p.total)} · paga ${dinero(p.paga_con)} · dar cambio ${dinero(p.cambio)}`
                : p.metodo_pago === "tarjeta"
                  ? `COBRAR ${dinero(p.total)} CON TERMINAL 💳`
                  : `YA PAGÓ por transferencia ✓ (${dinero(p.total)})`}
            </p>

            <div className="grid grid-cols-2 gap-2 mt-3">
              {p.lat != null && (
                <a
                  className="btn bg-calle text-papel text-center text-sm"
                  href={`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  🗺 Cómo llegar
                </a>
              )}
              {p.clientes?.telefono && (
                <a
                  className="btn bg-tinta text-papel text-center text-sm"
                  href={`https://wa.me/${p.clientes.telefono}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  💬 WhatsApp
                </a>
              )}
            </div>

            <div className="mt-2">
              {p.estado === "listo" ? (
                <button
                  className="btn bg-fuego hover:bg-fuego-2 text-carbon w-full text-lg py-3"
                  disabled={ocupado}
                  onClick={() => accionar(p, "reparto")}
                >
                  🛵 Iniciar viaje
                </button>
              ) : (
                <button
                  className="btn bg-salsa hover:bg-salsa-2 text-papel w-full text-lg py-3"
                  disabled={ocupado}
                  onClick={() => accionar(p, "entregado")}
                >
                  ✅ Entregado
                </button>
              )}
            </div>
          </article>
        ))}
      </div>

      <p className="ticket-num text-[10px] text-humo/50 text-center mt-8">
        tu ubicación se comparte solo mientras tienes viajes activos
      </p>
    </main>
  );
}
