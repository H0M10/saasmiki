"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Pedido = {
  id: string;
  numero_corto: string | null;
  estado: string;
  metodo_pago: string;
  paga_con: number | null;
  cambio: number | null;
  lat: number | null;
  lng: number | null;
  total: number;
  creado_at: string;
  clientes: { nombre: string | null; telefono: string } | null;
  pedido_items: {
    nombre_platillo: string;
    cantidad: number;
    precio_unit: number;
    notas: string | null;
  }[];
};

const COLUMNAS: { titulo: string; estados: string[]; color: string }[] = [
  { titulo: "🔔 Pendientes", estados: ["pendiente"], color: "border-amber-400" },
  { titulo: "🍳 En cocina", estados: ["aceptado", "preparando"], color: "border-sky-400" },
  { titulo: "📦 Listos", estados: ["listo"], color: "border-violet-400" },
  { titulo: "🛵 En reparto", estados: ["en_reparto"], color: "border-emerald-400" },
];

const dinero = (n: number | null) => (n == null ? "" : `$${Number(n).toFixed(2)}`);

function minutosDesde(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
}

function beep() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.25, ctx.currentTime);
    o.start();
    o.stop(ctx.currentTime + 0.5);
  } catch {
    // sin audio no pasa nada
  }
}

export default function Panel() {
  const [clave, setClave] = useState<string | null>(null);
  const [claveInput, setClaveInput] = useState("");
  const [claveMala, setClaveMala] = useState(false);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [cargando, setCargando] = useState(false);
  const pendientesPrevios = useRef(0);

  useEffect(() => {
    setClave(localStorage.getItem("panel_key"));
  }, []);

  const cargar = useCallback(async (k: string) => {
    try {
      const res = await fetch("/api/panel/pedidos", { headers: { "x-panel-key": k } });
      if (res.status === 401) {
        localStorage.removeItem("panel_key");
        setClave(null);
        setClaveMala(true);
        return;
      }
      const json = await res.json();
      const lista: Pedido[] = json.pedidos ?? [];
      const pendientes = lista.filter((p) => p.estado === "pendiente").length;
      if (pendientes > pendientesPrevios.current) beep();
      pendientesPrevios.current = pendientes;
      setPedidos(lista);
    } catch {
      // sin conexión: se reintenta en el siguiente ciclo
    }
  }, []);

  useEffect(() => {
    if (!clave) return;
    cargar(clave);
    const timer = setInterval(() => cargar(clave), 5000);
    return () => clearInterval(timer);
  }, [clave, cargar]);

  async function accionar(p: Pedido, accion: string) {
    if (!clave) return;
    let motivo: string | undefined;
    if (accion === "rechazar" || accion === "cancelar") {
      motivo = prompt("Motivo (se le enviará al cliente):") ?? undefined;
      if (motivo === undefined) return; // canceló el prompt
    }
    setCargando(true);
    try {
      const res = await fetch(`/api/panel/pedidos/${p.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-panel-key": clave },
        body: JSON.stringify({ accion, motivo }),
      });
      const json = await res.json();
      if (!res.ok) alert(`Error: ${json.error}`);
      await cargar(clave);
    } finally {
      setCargando(false);
    }
  }

  // ---------- Pantalla de clave ----------
  if (!clave) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-neutral-950 text-neutral-100">
        <form
          className="bg-neutral-900 border border-neutral-700 rounded-2xl p-8 w-80 flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            localStorage.setItem("panel_key", claveInput);
            setClave(claveInput);
            setClaveMala(false);
          }}
        >
          <h1 className="text-xl font-bold text-center">🍳 Panel de pedidos</h1>
          <input
            type="password"
            placeholder="Clave del panel"
            className="rounded-lg bg-neutral-800 border border-neutral-600 px-3 py-2"
            value={claveInput}
            onChange={(e) => setClaveInput(e.target.value)}
            autoFocus
          />
          {claveMala && <p className="text-red-400 text-sm">Clave incorrecta</p>}
          <button className="rounded-lg bg-emerald-600 hover:bg-emerald-500 py-2 font-semibold">
            Entrar
          </button>
        </form>
      </main>
    );
  }

  // ---------- Panel ----------
  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 p-4">
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">🍳 Panel de pedidos</h1>
        <div className="flex items-center gap-3 text-sm text-neutral-400">
          <span>{pedidos.length} activos · se actualiza solo</span>
          <button
            className="underline hover:text-neutral-200"
            onClick={() => {
              localStorage.removeItem("panel_key");
              setClave(null);
            }}
          >
            Salir
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {COLUMNAS.map((col) => {
          const lista = pedidos.filter((p) => col.estados.includes(p.estado));
          return (
            <section key={col.titulo} className={`rounded-2xl border-t-4 ${col.color} bg-neutral-900 p-3`}>
              <h2 className="font-bold mb-3">
                {col.titulo} <span className="text-neutral-400 font-normal">({lista.length})</span>
              </h2>
              <div className="flex flex-col gap-3">
                {lista.length === 0 && (
                  <p className="text-neutral-500 text-sm text-center py-6">— vacío —</p>
                )}
                {lista.map((p) => (
                  <Tarjeta key={p.id} p={p} accionar={accionar} deshabilitado={cargando} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}

function Tarjeta({
  p,
  accionar,
  deshabilitado,
}: {
  p: Pedido;
  accionar: (p: Pedido, accion: string) => void;
  deshabilitado: boolean;
}) {
  const min = minutosDesde(p.creado_at);
  const pagoLinea =
    p.metodo_pago === "efectivo"
      ? `💵 Efectivo — paga ${dinero(p.paga_con)}, cambio ${dinero(p.cambio)}`
      : p.metodo_pago === "tarjeta"
        ? "💳 Tarjeta (llevar terminal)"
        : "🏦 Transferencia";

  const Btn = ({ accion, children, estilo }: { accion: string; children: React.ReactNode; estilo: string }) => (
    <button
      disabled={deshabilitado}
      onClick={() => accionar(p, accion)}
      className={`rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50 ${estilo}`}
    >
      {children}
    </button>
  );

  return (
    <article className="rounded-xl bg-neutral-800 border border-neutral-700 p-3 text-sm">
      <div className="flex items-center justify-between mb-1">
        <span className="text-lg font-black">
          {p.numero_corto ? `#${p.numero_corto}` : "🆕 NUEVO"}
        </span>
        <span className={`text-xs ${min >= 20 ? "text-red-400" : "text-neutral-400"}`}>
          hace {min} min
        </span>
      </div>

      <p className="font-semibold">
        👤 {p.clientes?.nombre ?? "Sin nombre"}{" "}
        {p.clientes?.telefono && (
          <a
            className="text-emerald-400 underline"
            href={`https://wa.me/${p.clientes.telefono}`}
            target="_blank"
            rel="noreferrer"
          >
            WhatsApp
          </a>
        )}
      </p>

      <ul className="my-2 border-y border-neutral-700 py-2">
        {p.pedido_items.map((i, idx) => (
          <li key={idx}>
            <span className="font-semibold">{i.cantidad}x {i.nombre_platillo}</span>
            {i.notas && (
              <span className="block text-amber-300 font-bold pl-4">📝 {i.notas}</span>
            )}
          </li>
        ))}
      </ul>

      <p className="font-bold">Total: {dinero(p.total)}</p>
      <p className="text-neutral-300">{pagoLinea}</p>
      {p.lat != null && p.lng != null && (
        <a
          className="text-sky-400 underline"
          href={`https://www.google.com/maps?q=${p.lat},${p.lng}`}
          target="_blank"
          rel="noreferrer"
        >
          📍 Ver ubicación en el mapa
        </a>
      )}

      <div className="flex flex-wrap gap-2 mt-3">
        {p.estado === "pendiente" && (
          <>
            <Btn accion="aceptar" estilo="bg-emerald-600 hover:bg-emerald-500">✅ Aceptar</Btn>
            <Btn accion="rechazar" estilo="bg-red-700 hover:bg-red-600">❌ Declinar</Btn>
          </>
        )}
        {p.estado === "aceptado" && (
          <Btn accion="preparando" estilo="bg-sky-600 hover:bg-sky-500">🍳 Preparando</Btn>
        )}
        {(p.estado === "aceptado" || p.estado === "preparando") && (
          <Btn accion="listo" estilo="bg-violet-600 hover:bg-violet-500">📦 Listo</Btn>
        )}
        {p.estado === "listo" && (
          <Btn accion="reparto" estilo="bg-emerald-600 hover:bg-emerald-500">🛵 En camino</Btn>
        )}
        {p.estado === "en_reparto" && (
          <Btn accion="entregado" estilo="bg-emerald-700 hover:bg-emerald-600">🎉 Entregado</Btn>
        )}
        {["aceptado", "preparando", "listo"].includes(p.estado) && (
          <Btn accion="cancelar" estilo="bg-neutral-700 hover:bg-neutral-600">Cancelar</Btn>
        )}
      </div>
    </article>
  );
}
