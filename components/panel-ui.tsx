"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

// ---------- Manejo de la clave (guardada en el navegador) ----------

export function useClave(almacen: string) {
  const [clave, setClave] = useState<string | null>(null);
  const [lista, setLista] = useState(false);

  useEffect(() => {
    setClave(localStorage.getItem(almacen));
    setLista(true);
  }, [almacen]);

  const guardar = useCallback(
    (v: string) => {
      localStorage.setItem(almacen, v);
      setClave(v);
    },
    [almacen]
  );

  const salir = useCallback(() => {
    localStorage.removeItem(almacen);
    setClave(null);
  }, [almacen]);

  return { clave, lista, guardar, salir };
}

// ---------- Pantalla de clave (comanda de papel) ----------

export function PantallaClave({
  titulo,
  onEntrar,
  incorrecta,
}: {
  titulo: string;
  onEntrar: (clave: string) => void;
  incorrecta?: boolean;
}) {
  const [v, setV] = useState("");
  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <form
        className="comanda w-full max-w-xs p-6 pt-8 flex flex-col gap-4 entrar"
        onSubmit={(e) => {
          e.preventDefault();
          if (v.trim()) onEntrar(v.trim());
        }}
      >
        <div className="text-center">
          <p className="ticket-num text-xs text-tinta-suave tracking-widest">SAASMIKE · COCINA</p>
          <h1 className="titulo text-3xl font-extrabold text-tinta mt-1">{titulo}</h1>
        </div>
        <hr className="corte" />
        <input
          type="password"
          placeholder="Clave de acceso"
          className="campo ticket-num text-center"
          value={v}
          onChange={(e) => setV(e.target.value)}
          autoFocus
        />
        {incorrecta && (
          <p className="text-chile text-sm text-center font-semibold">Clave incorrecta</p>
        )}
        <button className="btn bg-fuego hover:bg-fuego-2 text-carbon text-lg">Entrar</button>
        <p className="ticket-num text-[10px] text-tinta-suave text-center">
          * * * gracias por su visita * * *
        </p>
      </form>
    </main>
  );
}

// ---------- Navegación del panel + interruptor ABIERTO/CERRADO ----------

const TABS = [
  { href: "/panel", etiqueta: "Pedidos" },
  { href: "/panel/menu", etiqueta: "Menú" },
  { href: "/panel/ajustes", etiqueta: "Ajustes" },
];

export function NavPanel({ clave, onSalir }: { clave: string; onSalir: () => void }) {
  const ruta = usePathname();
  const [cerrado, setCerrado] = useState<boolean | null>(null);
  const [cambiando, setCambiando] = useState(false);

  const cargarEstado = useCallback(async () => {
    try {
      const res = await fetch("/api/panel/ajustes", { headers: { "x-panel-key": clave } });
      if (res.ok) {
        const j = await res.json();
        setCerrado(!!j.ajustes?.cerrado_manual);
      }
    } catch {
      /* se reintenta con el siguiente ciclo de la página */
    }
  }, [clave]);

  useEffect(() => {
    cargarEstado();
  }, [cargarEstado]);

  async function alternarCerrado() {
    if (cerrado === null || cambiando) return;
    const nuevo = !cerrado;
    const verbo = nuevo ? "CERRAR el negocio" : "ABRIR el negocio";
    if (!confirm(`¿${verbo}? El bot ${nuevo ? "dejará de tomar" : "volverá a tomar"} pedidos al instante.`)) return;
    setCambiando(true);
    try {
      const res = await fetch("/api/panel/ajustes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-panel-key": clave },
        body: JSON.stringify({ cerrado_manual: nuevo }),
      });
      if (res.ok) setCerrado(nuevo);
    } finally {
      setCambiando(false);
    }
  }

  return (
    <header className="flex flex-wrap items-center gap-3 mb-5">
      <h1 className="titulo text-3xl font-extrabold text-hueso">
        Saas<span className="text-fuego">Mike</span>
      </h1>

      <nav className="flex gap-1 bg-carbon-2 rounded-xl p-1">
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={`titulo px-4 py-1.5 rounded-lg text-sm font-bold transition-colors ${
              ruta === t.href ? "bg-papel text-tinta" : "text-humo hover:text-hueso"
            }`}
          >
            {t.etiqueta}
          </Link>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-3">
        {cerrado !== null && (
          <button
            onClick={alternarCerrado}
            disabled={cambiando}
            className={`sello text-sm cursor-pointer ${
              cerrado ? "text-chile" : "text-salsa"
            } hover:opacity-80 disabled:opacity-50`}
            title="Clic para cambiar"
          >
            {cerrado ? "● Cerrado" : "● Abierto"}
          </button>
        )}
        <button className="text-humo text-sm underline hover:text-hueso" onClick={onSalir}>
          Salir
        </button>
      </div>
    </header>
  );
}

// ---------- Utilidades compartidas ----------

export const dinero = (n: number | null | undefined) =>
  n == null ? "" : `$${Number(n).toFixed(2)}`;

export function minutosDesde(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
}

export function beep() {
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
    /* sin audio no pasa nada */
  }
}
