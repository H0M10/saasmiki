"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  useClave,
  PantallaClave,
  NavPanel,
  dinero,
  minutosDesde,
  beep,
} from "@/components/panel-ui";

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
  repa_lat?: number | null;
  repa_lng?: number | null;
  repa_actualizado_at?: string | null;
  clientes: { nombre: string | null; telefono: string } | null;
  pedido_items: {
    nombre_platillo: string;
    cantidad: number;
    precio_unit: number;
    notas: string | null;
  }[];
};

const COLUMNAS: { titulo: string; estados: string[]; color: string }[] = [
  { titulo: "Pendientes", estados: ["pendiente"], color: "text-chile" },
  { titulo: "En cocina", estados: ["aceptado", "preparando"], color: "text-fuego" },
  { titulo: "Listos", estados: ["listo"], color: "text-hueso" },
  { titulo: "En reparto", estados: ["en_reparto"], color: "text-calle" },
];

export default function Panel() {
  const { clave, lista, guardar, salir } = useClave("panel_key");
  const [mala, setMala] = useState(false);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const pendientesPrevios = useRef(0);

  const cargar = useCallback(
    async (k: string) => {
      try {
        const res = await fetch("/api/panel/pedidos", { headers: { "x-panel-key": k } });
        if (res.status === 401) {
          salir();
          setMala(true);
          return;
        }
        const json = await res.json();
        const listaP: Pedido[] = json.pedidos ?? [];
        const pendientes = listaP.filter((p) => p.estado === "pendiente").length;
        if (pendientes > pendientesPrevios.current) beep();
        pendientesPrevios.current = pendientes;
        setPedidos(listaP);
      } catch {
        /* sin conexión: reintenta en el siguiente ciclo */
      }
    },
    [salir]
  );

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
      if (motivo === undefined) return;
    }
    setOcupado(true);
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
      setOcupado(false);
    }
  }

  if (!lista) return null;
  if (!clave) {
    return (
      <PantallaClave
        titulo="Panel de pedidos"
        incorrecta={mala}
        onEntrar={(v) => {
          guardar(v);
          setMala(false);
        }}
      />
    );
  }

  return (
    <main className="min-h-screen p-4 md:p-6">
      <NavPanel clave={clave} onSalir={salir} />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        {COLUMNAS.map((col) => {
          const listaC = pedidos.filter((p) => col.estados.includes(p.estado));
          return (
            <section key={col.titulo}>
              <h2 className={`titulo text-xl font-extrabold mb-3 ${col.color}`}>
                {col.titulo}
                <span className="ticket-num text-sm text-humo ml-2">
                  {String(listaC.length).padStart(2, "0")}
                </span>
              </h2>
              <div className="flex flex-col gap-4">
                {listaC.length === 0 && (
                  <p className="ticket-num text-humo/60 text-xs text-center py-8 border-2 border-dashed border-carbon-3 rounded-xl">
                    — sin pedidos —
                  </p>
                )}
                {listaC.map((p) => (
                  <Comanda key={p.id} p={p} accionar={accionar} ocupado={ocupado} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}

function Comanda({
  p,
  accionar,
  ocupado,
}: {
  p: Pedido;
  accionar: (p: Pedido, accion: string) => void;
  ocupado: boolean;
}) {
  const min = minutosDesde(p.creado_at);
  const esNuevo = p.estado === "pendiente";
  const repaFresco =
    p.repa_actualizado_at != null &&
    Date.now() - new Date(p.repa_actualizado_at).getTime() < 3 * 60000;

  const pagoLinea =
    p.metodo_pago === "efectivo"
      ? `EFECTIVO · paga ${dinero(p.paga_con)} · cambio ${dinero(p.cambio)}`
      : p.metodo_pago === "tarjeta"
        ? "TARJETA · llevar terminal"
        : "TRANSFERENCIA · ya pagó";

  const Btn = ({
    accion,
    children,
    estilo,
  }: {
    accion: string;
    children: React.ReactNode;
    estilo: string;
  }) => (
    <button
      disabled={ocupado}
      onClick={() => accionar(p, accion)}
      className={`btn text-sm flex-1 ${estilo}`}
    >
      {children}
    </button>
  );

  return (
    <article className={`comanda p-4 pt-5 entrar ${esNuevo ? "urgente" : ""}`}>
      {/* encabezado del ticket */}
      <div className="flex items-baseline justify-between">
        <span className="ticket-num text-2xl font-bold text-tinta">
          {p.numero_corto ? `#${p.numero_corto}` : "NUEVO"}
        </span>
        <span
          className={`ticket-num text-xs ${min >= 20 ? "text-chile font-bold" : "text-tinta-suave"}`}
        >
          {min} min
        </span>
      </div>
      <p className="titulo text-lg font-bold text-tinta leading-tight">
        {p.clientes?.nombre ?? "Sin nombre"}
      </p>

      <hr className="corte" />

      {/* platillos */}
      <ul className="ticket-num text-sm text-tinta flex flex-col gap-1">
        {p.pedido_items.map((i, idx) => (
          <li key={idx}>
            <div className="flex justify-between gap-2">
              <span>
                {i.cantidad}× {i.nombre_platillo}
              </span>
              <span className="text-tinta-suave">{dinero(i.precio_unit * i.cantidad)}</span>
            </div>
            {i.notas && (
              <div className="bg-fuego/20 border-l-4 border-fuego px-2 py-0.5 mt-0.5 font-bold">
                ⚠ {i.notas}
              </div>
            )}
          </li>
        ))}
      </ul>

      <hr className="corte" />

      <div className="flex justify-between items-baseline">
        <span className="ticket-num text-xs text-tinta-suave">{pagoLinea}</span>
        <span className="ticket-num text-xl font-bold text-tinta">{dinero(p.total)}</span>
      </div>

      {/* enlaces */}
      <div className="flex gap-3 mt-1 text-xs">
        {p.clientes?.telefono && (
          <a
            className="text-salsa-2 underline font-semibold"
            href={`https://wa.me/${p.clientes.telefono}`}
            target="_blank"
            rel="noreferrer"
          >
            WhatsApp
          </a>
        )}
        {p.lat != null && p.lng != null && (
          <a
            className="text-calle underline font-semibold"
            href={`https://www.google.com/maps?q=${p.lat},${p.lng}`}
            target="_blank"
            rel="noreferrer"
          >
            Mapa cliente
          </a>
        )}
        {repaFresco && (
          <a
            className="text-chile-2 underline font-semibold"
            href={`https://www.google.com/maps?q=${p.repa_lat},${p.repa_lng}`}
            target="_blank"
            rel="noreferrer"
          >
            📍 Repa en vivo
          </a>
        )}
      </div>

      {/* acciones */}
      <div className="flex flex-wrap gap-2 mt-3">
        {p.estado === "pendiente" && (
          <>
            <Btn accion="aceptar" estilo="bg-salsa hover:bg-salsa-2 text-papel">
              Aceptar
            </Btn>
            <Btn accion="rechazar" estilo="bg-chile hover:bg-chile-2 text-papel">
              Declinar
            </Btn>
          </>
        )}
        {p.estado === "aceptado" && (
          <Btn accion="preparando" estilo="bg-fuego hover:bg-fuego-2 text-carbon">
            Preparando
          </Btn>
        )}
        {(p.estado === "aceptado" || p.estado === "preparando") && (
          <Btn accion="listo" estilo="bg-tinta text-papel hover:opacity-90">
            Listo
          </Btn>
        )}
        {p.estado === "listo" && (
          <Btn accion="reparto" estilo="bg-calle text-papel hover:opacity-90">
            En camino
          </Btn>
        )}
        {p.estado === "en_reparto" && (
          <Btn accion="entregado" estilo="bg-salsa hover:bg-salsa-2 text-papel">
            Entregado
          </Btn>
        )}
        {["aceptado", "preparando", "listo"].includes(p.estado) && (
          <button
            disabled={ocupado}
            onClick={() => accionar(p, "cancelar")}
            className="btn text-sm text-tinta-suave border-2 border-tinta-suave/40 hover:border-tinta-suave"
          >
            ✕
          </button>
        )}
      </div>
    </article>
  );
}
