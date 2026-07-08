"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { useClave, PantallaClave, dinero } from "@/components/panel-ui";

type Pedido = {
  id: string;
  numero_corto: string | null;
  estado: string;
  metodo_pago: string;
  paga_con: number | null;
  cambio: number | null;
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

export default function Ticket({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { clave, lista, guardar, salir } = useClave("panel_key");
  const [mala, setMala] = useState(false);
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(
    async (k: string) => {
      const res = await fetch(`/api/panel/pedidos/${id}`, { headers: { "x-panel-key": k } });
      if (res.status === 401) {
        salir();
        setMala(true);
        return;
      }
      const j = await res.json();
      if (!res.ok) {
        setError(j.error);
        return;
      }
      setPedido(j.pedido);
    },
    [id, salir]
  );

  useEffect(() => {
    if (clave) cargar(clave);
  }, [clave, cargar]);

  // El QR apunta a esta misma página: al escanearlo con un teléfono del
  // equipo (con la clave guardada) se abre el pedido para verificar la bolsa.
  useEffect(() => {
    QRCode.toDataURL(`${window.location.origin}/panel/ticket/${id}`, {
      margin: 1,
      width: 180,
    }).then(setQr);
  }, [id]);

  if (!lista) return null;
  if (!clave) {
    return (
      <PantallaClave
        titulo="Ticket"
        incorrecta={mala}
        onEntrar={(v) => {
          guardar(v);
          setMala(false);
        }}
      />
    );
  }
  if (error) return <main className="min-h-screen p-6 text-chile">{error}</main>;
  if (!pedido) return <main className="min-h-screen p-6 text-humo">Cargando…</main>;

  const fecha = new Date(pedido.creado_at).toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  const pagoLineas =
    pedido.metodo_pago === "efectivo"
      ? [`EFECTIVO — paga ${dinero(pedido.paga_con)}`, `CAMBIO: ${dinero(pedido.cambio)}`]
      : pedido.metodo_pago === "tarjeta"
        ? ["TARJETA — llevar terminal"]
        : ["TRANSFERENCIA"];

  return (
    <main className="min-h-screen flex flex-col items-center p-4 gap-4">
      {/* controles (no salen en la impresión) */}
      <div className="no-imprimir flex gap-3 items-center">
        <Link href="/panel" className="text-humo underline text-sm">
          ← Volver al panel
        </Link>
        <button className="btn bg-fuego hover:bg-fuego-2 text-carbon" onClick={() => window.print()}>
          🖨 Imprimir
        </button>
      </div>

      {/* el ticket: 80 mm de ancho, como la impresora térmica */}
      <div
        className="solo-ticket comanda p-4 pt-6"
        style={{ width: "80mm", maxWidth: "100%", fontFamily: "var(--fuente-ticket), monospace" }}
      >
        <p className="text-center text-[10px] text-tinta-suave tracking-widest">
          * * * PEDIDO * * *
        </p>
        <p className="ticket-num text-center text-6xl font-bold text-tinta leading-none my-2">
          #{pedido.numero_corto ?? "—"}
        </p>
        <p className="text-center text-xs text-tinta-suave">{fecha}</p>
        <p className="titulo text-center text-2xl font-extrabold text-tinta mt-1">
          {pedido.clientes?.nombre ?? "Cliente"}
        </p>

        <hr className="corte" />

        <ul className="text-sm text-tinta flex flex-col gap-1">
          {pedido.pedido_items.map((i, idx) => (
            <li key={idx}>
              <div className="flex justify-between gap-2">
                <span>
                  {i.cantidad}× {i.nombre_platillo}
                </span>
                <span>{dinero(i.precio_unit * i.cantidad)}</span>
              </div>
              {i.notas && <div className="font-bold pl-3">≫ {i.notas.toUpperCase()}</div>}
            </li>
          ))}
        </ul>

        <hr className="corte" />

        <div className="flex justify-between text-tinta font-bold text-lg">
          <span>TOTAL</span>
          <span className="ticket-num">{dinero(pedido.total)}</span>
        </div>
        {pagoLineas.map((l) => (
          <p key={l} className="text-sm text-tinta">
            {l}
          </p>
        ))}

        <hr className="corte" />

        {qr && (
          <div className="flex flex-col items-center gap-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="QR del pedido" style={{ width: 140, height: 140 }} />
            <p className="text-[10px] text-tinta-suave text-center">
              Escanea para verificar el pedido antes de entregar
            </p>
          </div>
        )}

        <p className="text-center text-[10px] text-tinta-suave mt-2">
          — — — — gracias por su compra — — — —
        </p>
      </div>
    </main>
  );
}
